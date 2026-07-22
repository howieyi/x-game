# learn — 学习笔记

> 个人学习向的笔记目录。**和 [PRD](../PRD.md) / [SPEC](../SPEC.md) / [PLAN](../PLAN.md) 不属于一类文档**,那些是项目的"事实表"(Requirement / Architecture / Plan),而这里是"我读完代码/踩到坑之后的理解与推导"。

## 当前收录

| 主题 | 文档 | 关键词 | 状态 |
| --- | --- | --- | --- |
| AWS SNS + SQS 在 x-game 中的使用 | [aws-sns-sqs.md](./aws-sns-sqs.md) | pub/sub、消息总线、扇出、DLQ、KMS、partial batch failure、EventSource Mapping、ack、量级账目 | ✅ 已整理 |

## 写作约定(给以后自己/任何想往里添笔记的人)

### 文件命名

- 一篇主题一个文件,**用主题本身的名字**,而不是日期 / 任务号。
- 文件名全小写、连字符分隔,例如 `aws-sqs-vs-kafka.md`、`trpc-vs-rest.md`。

### Frontmatter

每篇笔记顶部带 YAML frontmatter,给以后做静态站点/索引用:

```yaml
---
title: AWS SNS + SQS 在 x-game 中的使用
slug: aws-sns-sqs
tags: [aws, sns, sqs, serverless, event-driven]
project: x-game        # 关联的项目,跨项目知识标记为 "meta"
status: active        # active / draft / superseded
created: 2026-07-22   # 首次成稿日期
updated: 2026-07-22
sources: []           # 可选:外部参考资料 URL
---
```

### 章节结构

最低限度按下面 5 段写,**每段都有存在的理由**,不是凑数:

1. **TL;DR** — 3–5 句话,讲清楚"这个主题用一句话怎么讲"。
2. **本项目里的现状** — 落到 [template.yaml](../../template.yaml) / `packages/` / `apps/` 的具体文件和行号。不要"全凭印象"。
3. **底层原理 / 关键概念** — 把用到的服务、参数、机制讲明白。即使以后离开这个项目也能读懂。
4. **设计权衡** — 为什么这里这么选?用表格列出"选项 + 缺点"。
5. **心智图 / 一句话压缩** — 给一张 ASCII 图或一句"如果只能记住一句话"。

### 引用代码

- 引用文件用相对链接 `[/path/to/file.ts:42](/path/to/file.ts#L42)`,让其能在编辑器里点开。
- 引用时**给出行号**;如果代码片段比较长,贴 5–15 行 + 一句"为什么看这段"的注释。
- 不要粘贴整段无关代码。

### 与"现状"漂移的问题

时间久了笔记会和代码不一致。两个选择:
- 在 frontmatter `status: superseded` 并写一行接替者;
- 或者直接改文档,在 frontmatter 改 `updated` 即可。

不要让笔记变成"半真半假"的化石。

---

## 新增一篇笔记的最小流程

1. 选文件名,确定 slug(例如 `aws-sns-sqs`)。
2. 复制 frontmatter + 5 段骨架,先把目录填上。
3. 填"现状"段,**真正打开编辑器去 grep / Read**,不要凭印象。
4. 填"原理"段,讲人话 + 用一张图。
5. 填"权衡"段,这是学习笔记最有价值的部分。
6. 把链接加到本 README 的"当前收录"表格。
