# PLAN — 记忆翻牌 (Memory Match) 游戏化平台

> 实施计划。本文件由 `work-prd` 维护，与 `work-ai` 节点流水线（N1–N9）对齐。

---

## 0. 节点映射

| 工作流阶段 | work-ai 节点 | 本计划对应 |
| --- | --- | --- |
| 入口 / 上下文初始化 | N1 / N7 | `§1 准备` |
| 需求进入 | N2 | `§2 工作流泳道` |
| 任务执行 | N3 | `§3 任务拆解` |
| 评审 | N4 | `§4 评审 / 自检` |
| 标记完成 | N5 | `§5 完成准则` |
| QA 评估 | N6 | `§6 QA 矩阵` |
| 收尾 / 文档同步 | N8 / N9 | `§7 收尾` |

---

## 1. 准备（N1 / N7）

### 1.1 输入
- PRD：`docs/PRD.md`
- SPEC：`docs/SPEC.md`
- 既有工程：`apps/{web,server,docs}` + `packages/{ui,api,auth,db,env,config}`

### 1.2 约束
- 不破坏既有 `healthCheck` / `privateData` / `sign-in-form` / `sign-up-form` / `user-menu` / `header` / `dashboard`。
- 不引入新顶层依赖。
- 使用既有 `packages/ui` 的 shadcn 组件，不新建组件库。

### 1.3 假设
- PostgreSQL 已在 `apps/server/.env` 配置（既有 README 已要求）。
- `pnpm dev` 可启动；tRPC 链路通畅。

---

## 2. 工作流泳道（N2）

```
                         ┌─────────────┐
                         │  N1 准备     │
                         └──────┬──────┘
                                │
                                ▼
┌──────────────┐    ┌──────────────────────────┐    ┌──────────────┐
│  N2 进入      │──▶│  N3 任务执行（并行/串行） │──▶ │  N4 评审      │
└──────────────┘    └──────────────────────────┘    └──────┬───────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────┐
                                            │  N5 标记完成          │
                                            └──────────┬───────────┘
                                                       │
                                                       ▼
                                            ┌──────────────────────┐
                                            │  N6 QA 评估           │
                                            └──────────┬───────────┘
                                                       │
                                                       ▼
                                            ┌──────────────────────┐
                                            │  N8/N9 收尾 / 同步    │
                                            └──────────────────────┘
```

本计划假定执行环境已就绪，单轮 `N3` 内将按下列顺序提交任务。

---

## 3. 任务拆解（N3）

### 3.1 任务 T1 — DB schema + 迁移（database-engineer）
- **产出**：
  - `packages/db/src/schema/game.ts`
  - `packages/db/src/schema/index.ts`（re-export 新模块）
  - 更新 `packages/db/src/index.ts`（如需）
- **验收**：`pnpm run db:generate` 产出迁移；`pnpm run db:push` 成功；`game_record` 表存在且索引齐备。
- **风险**：迁移失败时回退到 `pnpm run db:studio` 手工核验。

### 3.2 任务 T2 — tRPC procedures（backend-engineer）
- **产出**：
  - `packages/api/src/routers/game.ts`（submit / myHistory / myBest）
  - `packages/api/src/routers/leaderboard.ts`（list）
  - `packages/api/src/routers/index.ts`（挂载新 router）
- **依赖**：T1 完成（否则 `db` 引用报类型错误）。
- **验收**：trpc 类型 `AppRouter` 新增 `game.*` / `leaderboard.*` 路径；用 `trpc-cli` 或浏览器手动调用三个 procedure 通过。

### 3.3 任务 T3 — 移植游戏为 React 组件（frontend-engineer）
- **产出**：
  - `apps/web/src/components/game/memory-match.tsx`
  - `apps/web/src/components/game/memory-match.css`（自 HTML 原样迁移）
  - `apps/web/src/components/game/theme-chips.tsx`
  - `apps/web/src/components/game/stat-bar.tsx`
  - `apps/web/src/components/game/result-modal.tsx`
  - `apps/web/src/hooks/use-game-state.ts`
  - `apps/web/src/hooks/use-game-submit.ts`
- **依赖**：T2 完成（mutation 依赖）。
- **验收**：本地起 `pnpm dev`，匿名态可玩（仅本地最佳，无入库）；登录态完成后弹结算 → 自动提交 → toast。

### 3.4 任务 T4 — 新增路由 + 导航（frontend-engineer）
- **产出**：
  - `apps/web/src/routes/_auth/game.tsx`
  - `apps/web/src/routes/_auth/stats.tsx`
  - `apps/web/src/routes/leaderboard.tsx`
  - `apps/web/src/components/stats/theme-card.tsx`
  - `apps/web/src/components/stats/history-table.tsx`
  - `apps/web/src/components/leaderboard/leaderboard-table.tsx`
  - 修改 `apps/web/src/components/header.tsx`（追加导航项）
- **依赖**：T3 完成。
- **验收**：手动跑通：未登录访问 `/stats` 跳 `/login`；登录后三条新路由均可访问；Header 显示 5 个入口。

### 3.5 任务 T5 — Home 升级 + 主页 CTA（frontend-engineer）
- **产出**：
  - 修改 `apps/web/src/routes/index.tsx`：增加「开始挑战」CTA 卡 + 简短介绍。
- **依赖**：T4 完成。
- **验收**：Home 页可见游戏入口；不破坏既有 `healthCheck` 区块。

### 3.6 任务 T6 — 质量与回归（qa-engineer）
- **产出**：QA 报告 `docs/QA-REPORT.md`。
- **覆盖**：AC-1 ~ AC-10。
- **工具**：Playwright（项目已有 `mcp__playwright__*` 工具）；必要时用 `curl` 验证 tRPC。

---

## 4. 评审（N4）

每个任务完成后由 `m-code-reviewer` 走一次 PR-style 评审：

| 维度 | 关注点 |
| --- | --- |
| 正确性 | tRPC 错误码、Zod 校验、SQL 索引覆盖 |
| 一致性 | 命名 / 目录 / 文件风格与 better-t-stack 模板一致 |
| 复用 | 是否复用 `packages/ui` 已有组件 |
| 安全 | 未登录访问 `/stats` 是否真被守卫拦截 |
| 性能 | 排行榜 SQL 是否命中 `theme_moves_seconds_idx` |
| 移动端 | 480px 视口下游戏与排行榜可用 |

---

## 5. 完成准则（N5）

- T1 ~ T6 全部通过 N4 评审。
- `pnpm run check-types` 通过。
- `pnpm run check`（Biome）通过。
- AC-1 ~ AC-10 全部勾选。
- `docs/PRD.md`、`docs/SPEC.md`、`docs/PLAN.md`、`docs/QA-REPORT.md` 同步至最新。

---

## 6. QA 矩阵（N6）

| 编号 | 场景 | 期望 | 工具 |
| --- | --- | --- | --- |
| AC-1 | 注册 → 登录 → 玩一局 → 入库 | `game_record` +1；toast「成绩已保存」 | Playwright + Drizzle Studio |
| AC-2 | 提交后排行榜自动刷新 | 不刷新页面，列表出现自己 | Playwright |
| AC-3 | 匿名试玩不入库 | `game_record` 不变 | Playwright |
| AC-4 | 排行榜排序正确 | 构造 3 条样本验证 moves asc → seconds asc | SQL 直查 |
| AC-5 | `/stats` 渲染 | 4 项统计 + 历史列表 | Playwright 截图 |
| AC-6 | 移动端 | 480px 不溢出，游戏可点 | Playwright 视口切换 |
| AC-7 | 现有功能无回归 | `healthCheck` 通过；登录链路正常 | Smoke |
| AC-8 | 切换主题重置 | moves/seconds → 0 | 单元/手动 |
| AC-9 | 重复 nonce 去重 | 第二次提交返回原记录 | 单元 |
| AC-10 | 登出访问 `/stats` | 跳 `/login` | Playwright |

---

## 7. 收尾（N8 / N9）

- **N8**：合并 feature 分支；生成 changelog。
- **N9**：更新 `README.md`「## Features」段，追加 G1/G2/G3 三条。
- **可选**：在 `apps/docs`（Starlight）追加「游戏」一页（本期可不做）。

---

## 8. 风险与回滚

| 风险 | 触发 | 回滚 |
| --- | --- | --- |
| 迁移失败 | T1 中 `db:push` 报错 | `drizzle` 移除迁移；保留本地 PG 备份 |
| tRPC 编译失败 | T2 中 schema 类型变更 | revert T1 |
| 移动端棋盘溢出 | T3 中断点未覆盖 | 在 `memory-match.css` 中加 `@media` |
| 排行榜排序慢 | 数据量大时 | 加 LIMIT / 命中索引；后续引入物化视图 |

---

## 9. 时间盒（参考）

| 任务 | 估时 |
| --- | --- |
| T1 schema | 30 min |
| T2 tRPC | 45 min |
| T3 游戏移植 | 90 min |
| T4 路由 + 导航 | 45 min |
| T5 Home 升级 | 15 min |
| T6 QA | 45 min |
| 总计 | ~4.5 h |

---

## 10. 变更日志

| 日期 | 变更 | 触发 |
| --- | --- | --- |
| 2026-06-30 | 初始化 PLAN：N1–N9 节点映射 + T1–T6 任务 | `work-prd-change` |