---
title: AWS SNS + SQS 在 x-game 中的使用
slug: aws-sns-sqs
tags: [aws, sns, sqs, serverless, event-driven, dlq, kms]
project: x-game
status: active
created: 2026-07-22
updated: 2026-07-22
sources:
  - https://docs.aws.amazon.com/sns/latest/dg/sns-getting-started.html
  - https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-polling-vs-long-polling.html
---

# AWS SNS + SQS 在 x-game 中的使用

> 学习笔记 / 来源:阅读 [template.yaml](../../template.yaml) [apps/server/src/event-worker.ts](../../apps/server/src/event-worker.ts) [packages/api/src/services/game-events.ts](../../packages/api/src/services/game-events.ts) 等。

## TL;DR

x-game 的"游戏完成事件 / 行为监控告警"链路走的是经典的 **API → SNS Topic → SQS Queue → 消费 Lambda → DLQ** 模式。SNS 负责扇出与解耦,SQS 负责承接流量与失败缓冲,Lambda 收到事件后按 `eventType` 分流,**目前真正被消费的只有 `analytics.anomalies.detected`(转飞书告警);`game.session.completed` 已经在生产端发出,但暂时只有日志**,留给未来扩展接成就系统 / 排行榜再算。

## 1. 本项目里的现状

### 1.1 链路节点对照表

| 链路环节 | 文件 | 行号 | 角色 |
| --- | --- | --- | --- |
| SNS SDK 依赖 | [packages/api/package.json](../../packages/api/package.json) | 14 | `@aws-sdk/client-sns` |
| SNS 发布封装 | [packages/api/src/services/game-events.ts](../../packages/api/src/services/game-events.ts) | 1, 4, 14-71 | 唯一的生产者 |
| 游戏完成触发 publish | [packages/api/src/routers/game.ts](../../packages/api/src/routers/game.ts) | 134 | `publishGameCompleted` 调用点 |
| 埋点触发 publish | [packages/api/src/services/analytics-ingest.ts](../../packages/api/src/services/analytics-ingest.ts) | 85-96 | `publishAnalyticsAlerts`,失败返 503 |
| 告警业务回调 | [packages/api/src/services/analytics-alerts.ts](../../packages/api/src/services/analytics-alerts.ts) | 88-120 | `processAnalyticsAnomalies` 接飞书 Webhook |
| SQS 消费 Lambda | [apps/server/src/event-worker.ts](../../apps/server/src/event-worker.ts) | 27-91 | envelope 解析 + 部分失败响应 |
| Worker 产物打包 | [apps/server/tsdown.config.ts](../../apps/server/tsdown.config.ts) | 25-31 | 单独产出 `eventWorker.mjs` |
| Topic ARN 环境变量 | [packages/env/src/server.ts](../../packages/env/src/server.ts) | 26 | `GAME_EVENTS_TOPIC_ARN` 可选 |
| MCP 日志枚举 | [apps/mcp-server/src/tools/logs.ts](../../apps/mcp-server/src/tools/logs.ts) | 23-58 | MCP Agent 可查 worker 日志 |
| KMS Key | [template.yaml](../../template.yaml) | 666-695 | 共用一把 Key 加密 Topic 与 Queue |
| SNS Topic | [template.yaml](../../template.yaml) | 697-701 | `x-game-events-${Stage}` |
| SQS DLQ | [template.yaml](../../template.yaml) | 703-712 | 14 天保留 |
| SQS 主队列 | [template.yaml](../../template.yaml) | 713-726 | 5 次失败 → DLQ |
| Queue Policy(白名单) | [template.yaml](../../template.yaml) | 728-746 | 仅允许本 Topic ARN 投递 |
| SNS Subscription | [template.yaml](../../template.yaml) | 748-755 | `Protocol: sqs`,保留 envelope |
| SQS 触发 Lambda | [template.yaml](../../template.yaml) | 757-800 | `BatchSize=10`,开部分失败 |
| DLQ CloudWatch 告警 | [template.yaml](../../template.yaml) | 802-817 | 可见消息 > 0 即触发 |
| ServerFunction SNS 权限 | [template.yaml](../../template.yaml) | 562-582 | `sns:Publish` + KMS GenDataKey |

### 1.2 资源拓扑图

```
                                        ┌─────────────────────────────────┐
API Handler (ServerFunction)            │  GameEventsTopic                │
   │  sns:Publish (GAME_EVENTS_TOPIC_ARN)│  KMS 加密                       │
   ▼                                    └────────────────┬────────────────┘
                                                         │ Subscription(协议=sqs,
                                                         │  RawMessageDelivery=false,
                                                         │  保留 envelope)
                                                         ▼
              ┌──────────────────────────────────────────────────────────┐
              │ GameEventsQueue                                           │
              │   VisibilityTimeout: 180s (> Worker Timeout 30s)         │
              │   MessageRetentionPeriod: 4 天                            │
              │   RedrivePolicy: → DLQ,maxReceiveCount: 5                │
              │   QueuePolicy: 只允许 GameEventsTopic 投递                │
              └────────────────────┬─────────────────────────────────────┘
                                   │ EventSource:SQS,BatchSize=10,
                                   │ FunctionResponseTypes:
                                   │   ReportBatchItemFailures
                                   ▼
                          ┌────────────────────────┐
                          │ GameEventWorkerFunction│  → 业务处理 → 必要时调外部
                          └────────────────────────┘
                                   │ 第 6 次失败(累计 5 次重试后)
                                   ▼
              ┌──────────────────────────────────────────────────────────┐
              │ GameEventsDeadLetterQueue(14 天保留)                     │
              └────────────────────┬─────────────────────────────────────┘
                                   │ ApproximateNumberOfMessagesVisible > 0
                                   ▼
                          ┌────────────────────────┐
                          │ CloudWatch Alarm        │  → 告警给运维
                          └────────────────────────┘
```

### 1.3 消息体的 envelope 约定

生产端 [packages/api/src/services/game-events.ts:14-71](../../packages/api/src/services/game-events.ts#L14-L71) 发出的所有事件都遵循这套结构:

```jsonc
{
  "eventType": "game.session.completed",   // 或 "analytics.anomalies.detected"
  "eventId": "<uuid>",                      // 幂等键
  "occurredAt": "2026-07-22T10:00:00.000Z", // 业务时间,不是投递时间
  "payload": { /* 事件特有的字段 */ }
}
```

外加一条 `MessageAttributes.eventType` ([game-events.ts:36-41](../../packages/api/src/services/game-events.ts#L36-L41)),**body 内一份 / Attributes 一份**:body 用于消费端逻辑分发,Attributes 用于 SQS **基于属性的过滤**(虽然当前没用,但已经为以后省钱了)。

## 2. 底层原理

### 2.1 为什么要"先 SNS 再 SQS"

把 SNS 和 SQS 拆开不是迷信 AWS 拼盘,而是各管一件事:

| 组件 | 主要语义 | 解决了什么 |
| --- | --- | --- |
| **SNS Topic** | **广播(fan-out),at-least-once** | 生产者只需知 Topic ARN;**扩展多消费者零改生产代码**;消息按订阅者复制 |
| **SQS Queue** | **缓冲、重试、削峰** | 消费者可被反压;**失败可保留**并自动重投;提供"批量消费 + 部分失败"模型 |
| **Lambda EventSource: SQS** | **消费触发** | 队列有消息 → 自动调起;消费速率随配额扩缩;不在 OSS 玩消费者 |

> **反面思路**(帮助理解为什么不要这么干):
>
> | 方案 | 缺点 |
> | --- | --- |
> | **API 直接 `Invoke` 另一个 Lambda** | 同步调用,**下游失败 = 上游 5xx**;无缓冲;消费者挂了消息丢失;无法扇出 |
> | **API 直接写 SQS,绕开 SNS** | SQS 投递是**单目标**的;以后想加消费者必须改写生产代码;并且没有"广播"语义 |
> | **EventBridge** | 适合**跨账号/跨服务 + 复杂路由规则 + archive**;本项目只是"几个 Lambda 订阅同一类事件",用 EB 杀鸡用牛刀,成本也更高 |

### 2.2 SQS 关键参数为什么这么设

```yaml
VisibilityTimeout: 180         # 主队列
MessageRetentionPeriod: 345600 # 主队列=4 天
RedrivePolicy:
  deadLetterTargetArn: <DLQ>
  maxReceiveCount: 5            # 5 次重试 → DLQ

ReceiveMessageWaitTimeSeconds: 20
```

- **`VisibilityTimeout = 180s`,Worker `Timeout = 30s`**:`180 > 30` 留出了 6 倍冗余。防止"消息处理到 29.9s 时 Lambda timeout → 消息立刻被另一个 worker 重新看见"的竞态(那等于**双重消费**)。
- **`MessageRetentionPeriod` 主 4 天 / DLQ 14 天**:主队列要**主动防止长期堆积**(4 天还没消费 = 一定出问题了);DLQ 是排查的最后一道,**留够时间让 ops 修完 bug 还能重新驱动**。
- **`maxReceiveCount: 5`**:重试 5 次后承认失败,丢进 DLQ,**避免坏消息反复刷 worker 浪费钱**。
- **`ReceiveMessageWaitTimeSeconds: 20`**:**长轮询**,consumer 发送 `ReceiveMessage` 后,空队列会阻塞至 20s 内有消息(或超时),比短轮询省 API 调用费、也比 WebSocket/SSE 模式省运维。

### 2.3 envelope 双层解析的原因

[apps/server/src/event-worker.ts:27-30](../../apps/server/src/event-worker.ts#L27-L30) 里这段:

```ts
const snsEnvelope = JSON.parse(record.body) as { Message?: string };
const rawMessage = snsEnvelope.Message ?? record.body;
const event = JSON.parse(rawMessage) as PlatformEvent;
```

是因为 [template.yaml:748-755](../../template.yaml#L748-L755) 显式声明了 `RawMessageDelivery: false`(默认行为)。**打开订阅时,SNS 不会把原始消息直接丢进 SQS,而是包一层 envelope**:

```jsonc
{
  "Type": "Notification",
  "MessageId": "...",
  "TopicArn": "arn:aws:sns:...",
  "Message": "{\"eventType\":\"game.session.completed\", ...}",  // ← 这才是真正发的字符串
  "Timestamp": "...",
  "Signature": "..."
}
```

所以 SQS 的 `record.body` 是 **envelope JSON**,真正业务体在 `Message` 字段中。`?? record.body` 这行兜底是给**未来谁开了 `RawMessageDelivery: true`** 的弹性(在那种模式下 `Message` 是字符串本身,代码也能直跑)。

> **打开 `RawMessageDelivery: true` 的代价**:失去 envelope 里的 `MessageId` / `Signature` / `Timestamp`,也就失去了 AWS 做的"消息级审计 / SNS 签名校验"。**安全性与可观测性都打折**,这个项目选择保留 envelope 是合理保守做法。

### 2.4 部分失败响应(`ReportBatchItemFailures`)

消费端 [event-worker.ts:56-91](../../apps/server/src/event-worker.ts#L56-L91):

```ts
const failures: Array<{ itemIdentifier: string }> = [];
for (const record of event.Records) {
  try { /* 处理一条 */ }
  catch (error) { failures.push({ itemIdentifier: record.messageId }); }
}
return { batchItemFailures: failures };
```

配合 [template.yaml:799-800](../../template.yaml#L799-L800) 声明的:

```yaml
FunctionResponseTypes:
  - ReportBatchItemFailures
```

效果:
- 一批 10 条进来,**处理成功的消息直接 ACK**;仅**失败的进 failures 数组让 SQS 重新投递**。
- **避免"一条坏数据拖死 9 条好消息"**的放大效应。
- 没开这个特性时,Lambda 抛错 = 整批退回,**反复 reprocess 到 maxReceiveCount 才进 DLQ**,浪费且慢。

### 2.5 IAM / KMS

- **生产者权限**([template.yaml:573-582](../../template.yaml#L573-L582)):ServerFunction 角色只授予 `sns:Publish` 到本 Topic + `kms:GenerateDataKey` / `kms:Decrypt` 到本 Key,**不给通配**。
- **消费者权限**([template.yaml:783-786](../../template.yaml#L783-L786)):用 SAM 托管策略 `SQSPollerPolicy`(`QueueName: !GetAtt GameEventsQueue.QueueName`)代替通配 `sqs:*`,再 `KMSDecryptPolicy` 限定到本 Key。
- **Key Policy**([template.yaml:680-689](../../template.yaml#L680-L689))显式声明 `sns.amazonaws.com` / `sqs.amazonaws.com` 作为 principal,**否则 SNS publish 与 SQS receive 走到 KMS 加密/解密时会 5xx**。

### 2.6 幂等:`alertedAt is null`

[packages/api/src/services/analytics-alerts.ts:88-120](../../packages/api/src/services/analytics-alerts.ts#L88-L120) 的关键设计:

```ts
// 只有在飞书明确成功后才写 alertedAt;抛出的错误会让 Lambda 返回
// partial batch failure,由 SQS 重试并最终进入 DLQ。
export async function processAnalyticsAnomalies(eventIds: string[]) {
  if (!env.FEISHU_ANALYTICS_WEBHOOK_URL) return;
  const pending = await loadPendingRows(eventIds);  // where alertedAt is null
  if (pending.length === 0) return;
  // ... 调用飞书 ...
  await db.update(behaviorEvent).set({ alertedAt: new Date() })
    .where(and(inArray(behaviorEvent.id, ids), isNull(behaviorEvent.alertedAt)));
}
```

这套"打勾"逻辑保证:
- 即使 SQS 因为 at-least-once 重复投递,**飞书不会被多次打扰**——第二次进 worker 时 `loadPendingRows` 已经查不到未打标的行,直接返回。
- 这把"业务幂等"放在 DB 唯一约束逻辑上,**和消息重试频率解耦**——重试策略可以激进,幂等边界由数据状态说了算。

## 3. 设计权衡

| 决策 | 选 | 原因 | 代价 |
| --- | --- | --- | --- |
| 单个 Shared SNS Topic(而非每类事件一个 Topic) | ✅ | 加新事件/新消费者无需改生产代码;运维也只盯一组资源 | Topic 内多种事件混在一起,**消费者必须按 `eventType` 自己路由** |
| Topic 加密用 KMS(而非 SSE-SQS 默认) | ✅ | 合规 + 防止"未授权的 SQS 接收"截听事件流 | 每条消息加解密,一点点性能开销 |
| 保留 SNS envelope(`RawMessageDelivery: false`) | ✅ | 保留 `MessageId` / `Signature` / `Timestamp`,可观测/审计更好 | 消费端多一层 JSON.parse(几行兜底) |
| `VisibilityTimeout=180s`(> Worker 30s × 6) | ✅ | 杜绝 Lambda timeout 边界导致的双重消费 | 长超时期间消息"积压"在某一 worker,不能被其他并发 worker 接 |
| 主队列保留 4 天 / DLQ 14 天 | ✅ | 阶梯式:主队列不堆积,DLQ 给 ops 排查完整窗口 | DLQ 长保留看似浪费,**但事故排查价值远大于存储成本** |
| `ReportBatchItemFailures` | ✅ | 一条坏数据不必拖其他 9 条一起重试 | Worker 代码要手工收 failures(约 8 行模板代码) |
| DLQ Alarm 阈值 = 0 | ✅ | DLQ 有任何消息 = 事故,比阈值 1 灵敏 | 误报概率上升;需要 ops 流程"立刻响应"来消化 |
| 匿名不 publish,登录才 publish | ✅ | 防"免费向飞书发消息"被刷 | 匿名行为数据**永远不会被实时告警通知**(只入 DB 供离线查) |

## 4. 心智图(一句话压缩)

> **API 写一笔事件 → SNS 当广播站扇出 → SQS 当待办清单托管(带 5 次重试 + DLQ)→ 一攒够 10 条就让 Lambda 跑一批 → Lambda 按 `eventType` 分流 → 飞书成功后才给 DB 打勾做幂等 → 任何环节死了 DLQ 接盘 + 告警叫运维 → MCP Agent 顺手拉日志给你看。**

## 5. 扩展点(给以后自己留的钩子)

如果以后要扩展多消费者,正确做法(参考第 1 节"反例"):

```yaml
# 在 template.yaml 加一条:
NewAchievementSubscription:
  Type: AWS::SNS::Subscription
  Properties:
    TopicArn: !Ref GameEventsTopic
    Protocol: sqs
    Endpoint: !GetAtt NewAchievementQueue.Arn
    RawMessageDelivery: false

NewAchievementWorkerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: newAchievementWorker.handler
    Events:
      Triggers:
        Type: SQS
        Properties:
          Queue: !GetAtt NewAchievementQueue.Arn
          FunctionResponseTypes: [ReportBatchItemFailures]
```

生产端 [packages/api/src/services/game-events.ts](../../packages/api/src/services/game-events.ts) **零改动**;消费端 [apps/server/src/event-worker.ts](../../apps/server/src/event-worker.ts) 加一个 `if (eventType === "achievement.unlocked")` 分发(或者更干净——单独一个 worker 直接 `/achievement.*/` 路径配新的 SQS 走)。

> 这就是 SNS Topic **作为广播站的最大红利**:扩张不再需要回头改生产代码,只需注册新订阅者。

---

## 6. 运行特性(Event-driven 模型与量级账目)

这一节回答三个"为什么会这样"的问题:**Lambda 怎么知道消息来了、SQS 怎么表达"已处理"、这套架构各组件能扛到多大量级**。

### 6.1 Lambda 是被动触发的:EventSource Mapping 是"看不见的轮询"

x-game 的 Lambda **没有任何 polling 代码**,**甚至没有任何"启动器"**——它只是在被调用的时候执行一段代码。

真正的"Lambda 怎么知道消息到了"这件事由 **EventSource Mapping(ESM)** 完成,**它属于 AWS 后台托管资源**,不是用户的代码:

```
                  ┌──────────────────────────────────────┐
                  │ AWS 后端(托管,你看不见)              │
                  │                                      │
                  │  ┌────────────────────────────┐      │
                  │  │ EventSource Mapping(ESM)   │      │
                  │  │  - 持续 poll:SQS           │      │
                  │  │    ReceiveMessage          │      │
                  │  │  - 拉到一批 → Invoke Lambda│      │
                  │  │  - Lambda 成功/部分失败   │      │
                  │  │    → BatchDeleteMessage    │      │
                  │  │    / 让失败回退重投         │      │
                  │  └────────────────────────────┘      │
                  └────────────────┬─────────────────────┘
                                   │
                          SQSEvent 对象注入到 handler
                                   │
                                   ▼
   ┌───────────────────────────────────────────────────────┐
   │ 你的 Lambda                                           │
   │                                                       │
   │  export const handler = async (event: SQSEvent) => {   │
   │    for (const record of event.Records) { /* ... */    │
   │    return { batchItemFailures: [...] }                │
   │  }                                                    │
   └───────────────────────────────────────────────────────┘
```

ESM 的声明在 SAM 里只有这一段([template.yaml:792-800](../../template.yaml#L792-L800)):

```yaml
GameEventWorkerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: eventWorker.handler
    Events:
      GameEvents:
        Type: SQS                  # ← 这一行就是声明一个 ESM
        Properties:
          Queue: !GetAtt GameEventsQueue.Arn
          BatchSize: 10
          FunctionResponseTypes: [ReportBatchItemFailures]
```

`Events.GameEvents.Type: SQS` 那一句等同于"**AWS 帮我建一个 ESM**,参数全在 `Properties` 里";没有它,SQS 不会主动调起 Lambda,Lambda 也不会收到消息。

消费端的代码**完全没有任何 ReceiveMessage / DeleteMessage / start polling 的逻辑**——看 [apps/server/src/event-worker.ts:56-91](../../apps/server/src/event-worker.ts#L56-L91) 也只是处理 `event.Records`,**handler 只决定 ack 哪些**。

> **为什么不自己写一个 consumer(K8s Deployment / EC2 长跑进程)?** 因为 ESM 帮你**全部都解决了**——不用维护连接、不用配 Health check、不用 HPA/KEDA、不用写 ack;代价就是被 Lambda 1,000 并发 配额 **卡住**,冷启动有百毫秒级延迟。

### 6.2 SQS 的"ack"没有显式语句:靠"看不见"实现

SQS 与 Kafka / RabbitMQ 不同,**没有 `basicAck` 之类的 API**。它的"已消费"语义是**靠 VisibilityTimeout + DeleteMessage 隐式实现**的:

| Lambda 返回 | SQS 行为 |
| --- | --- |
| 同步成功返回(无 `batchItemFailures`) | **整批自动 ack**(ESM 后台调 `DeleteMessageBatch`) |
| 抛错 / Lambda 进程挂 | **整批不 ack** → 等 VisibilityTimeout(本项目 180s)到,自动重新可见,等价于 redrive |
| 返回 `{ batchItemFailures: ["msg-a", "msg-c"] }` | **只 ack 列外的部分**;msg-a、msg-c 计 1 次 receiveCount,按需重投,5 次后入 DLQ |

```ts
// 简化模型:同一条消息的"持有期"
ReceiveMessage → [invisible for VisibleTimeout)
                  ├─ Lambda 成功返回 → DeleteMessage → 真 ack
                  ├─ Lambda 抛错 → 计时不结束 → timeout → 重新可见
                  └─ Lambda 部分失败返回 → ReceiveCount += 1 → 重新投递
```

这就是 6.1 节 [event-worker.ts:90](../../apps/server/src/event-worker.ts#L90) 那句 `return { batchItemFailures: failures }` 的全部含义——**用一次返回值的列表来表达"消息级 ack/redo"**,不需要在代码里写 ack/reject。

### 6.3 量级账目(AWS 官方数字)

| 服务 / 能力 | 默认上限 | 软上限 / 备注 |
| --- | --- | --- |
| **SNS Topic**(标准) | 3,000 msg/s / 账号 默认配额 | 单 message 256 KB;**账号级软限制,可向 AWS 支持申请提升** |
| **SQS Queue** | **无 throughput 上限** | 自动扩展;单 message 256 KB;Retention 1 分 – 14 天 |
| **Lambda SQS EventSource** 单 mapping | **1,000 并发 invocation** | BatchSize 范围 2–10,000;账号级默认 1,000 并发可申请 |
| **Lambda 并发**(账号级) | **默认 1,000 concurrent** | reserved concurrency 可配 |
| **SQS VisibilityTimeout** | 最大 12 小时 | 本项目 180s |
| **SQS Redrive maxReceiveCount** | 1 – 1,000 | 本项目 5 |

**真正会卡住你的不是 SNS/SQS**,而是**下游**:

- **飞书 webhook 5 秒超时 + 单 API 自带 QPS 限速**(看 [analytics-alerts.ts:62](../../packages/api/src/services/analytics-alerts.ts#L62)) → 一批 `analytics.anomalies.detected` 进来,worker **必须串行挨个调飞书**,这一刻 Lambda 并发再多也空转。
- **RDS PostgreSQL 连接数** → Lambda 突发起来新容器容易耗尽 PG 连接池;DEPLOY.md 里提到 **RDS Proxy** 是为这一刻准备的——在 Lambda 与 RDS 之间架一个连接复用层。
- **账号下有 3 个 Lambda**(Server / Mcp / EventWorker)共享 1,000 并发,**满载时要互相挤**;用 reserved concurrency 给关键函数锁底层配额。

### 6.4 SNS 没有"并发处理"概念:并发都在消费者侧

SNS **不消费消息**,只做**1 → N 扇出**;**每条消息会被复制给每个订阅者**,所以 SNS 不存在"这条消息由谁处理":

```
                    ┌─→ Sub 1 (SQS-A) ── Worker A 消费    ← 同一个事件
SNS Topic →fan-out─┼─→ Sub 2 (SQS-B) ── Worker B 消费    ← 在每个订阅
                    └─→ Sub 3 (Lambda) ─ Lambda 直接处理   ← 里都有完整副本
```

如果你要的语义是**"同一条消息只被一个 worker 吃掉"(竞争消费)**——只能**挂在同一个 SQS 上**,然后让多个 Lambda instance 共享这一个队列:

```
                  ┌─→ Lambda instance 1 ─┐
SNS Topic →SQS ──→├─→ Lambda instance 2 ─┤   ← SQS 保证"一条消息同时刻
                  └─→ Lambda instance 3 ─┘     只对一个消费者可见"
```

SQS 自己是**队列**(**FIFO 仅在 FIFO Queue 下严格保证**;标准队列近似 best-effort),"同时刻一条消息只属于一个消费者"是它天然的模型——这才是"竞争消费"的本质,跟 SNS 的扇出是两件事。

### 6.5 几个有意思的边界细节

- **Disable Function 时**:SQS 消息不被消费、积压在队列里;因为 SQS 默认保留 4 天,消息**不会丢**,只是堆积——直到函数重新启用。
- **Min Pollers / Provisioned Concurrency**:消息频繁时 ESM 会"暖出"长驻 poller,避免每次都重建;正式的高 QPS 场景会用 `ProvisionedConcurrency` 把 worker 容器预先 heat 起来,**干的就是省 cold start**。
- **长轮询 0 成本等消息**:`ReceiveMessageWaitTimeSeconds: 20`(本项目就是设的 20s)使 ESM 在空队列上空挂,几乎不烧钱,不是 CPU 密集型轮询。

> 一句话压缩:**Lambda 不"等消息",Lambda 是被 AWS 后台的 EventSource Mapping "push 过来"的;x-game 里这一切在你代码里完全隐形,你只负责告诉 SAM `Events.Type: SQS`,再告诉 handler 在 event 里干什么;真正的瓶颈通常在 Lambda 1,000 并发配额 + 下游(飞书 / RDS),不在 SNS/SQS 本身。**
