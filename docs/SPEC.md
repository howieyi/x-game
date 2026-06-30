# SPEC — 记忆翻牌 (Memory Match) 游戏化平台

> 技术规格。本文件由 `work-prd` 维护。约束后续实现的目录、命名、数据结构、API 契约。

---

## 1. 架构概览

```
┌──────────────────────────── apps/web (React + TanStack Router) ────────────────────────────┐
│                                                                                            │
│  /login                  /game                /stats                  /leaderboard         │
│  ┌──────────┐            ┌──────────────┐     ┌──────────────┐        ┌──────────────┐    │
│  │sign-up/  │            │MemoryMatch   │     │MyStats       │        │Leaderboard   │    │
│  │sign-in   │            │Game (presenter│    │ThemeCard×7   │        │ThemeTabs×7   │    │
│  │form      │            │hooks:        │     │HistoryTable  │        │TopN Table    │    │
│  └────┬─────┘            │ useGame      │     └──────┬───────┘        └──────┬───────┘    │
│       │                  │ useGameSubmit│            │                     │             │
│       │                  └──────┬───────┘            │                     │             │
└───────┼─────────────────────────┼────────────────────┼─────────────────────┼─────────────┘
        │                         │                    │                     │
        │ better-auth            │ trpc.game.*         │ trpc.game.myHistory  │ trpc.leaderboard.*
        │                         │ trpc.game.myBest    │ trpc.game.myBest     │
        ▼                         ▼                    ▼                     ▼
┌─────────────────────────── apps/server (Hono) ──────────────────────────┐
│  POST /api/auth/*       POST /trpc/game.submit                          │
│  (better-auth)          POST /trpc/game.myHistory                       │
│                         POST /trpc/game.myBest                          │
│                         POST /trpc/leaderboard.list                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                          ┌──────────▼───────────┐
                          │ packages/api         │
                          │  routers/            │
                          │   ├─ game.ts         │
                          │   └─ leaderboard.ts  │
                          │  context (session)   │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │ packages/db (Drizzle)│
                          │  schema/             │
                          │   ├─ auth.ts         │
                          │   └─ game.ts (NEW)   │
                          └──────────┬───────────┘
                                     │
                              PostgreSQL
```

---

## 2. 数据模型

### 2.1 新增表 `game_record`

文件位置：`packages/db/src/schema/game.ts`，并在 `packages/db/src/schema/index.ts` 中 re-export。

```ts
import { relations } from "drizzle-orm";
import {
  pgTable, text, integer, boolean, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const THEMES = [
  "animals", "space", "food", "music", "ocean", "gems", "faces",
] as const;
export type Theme = (typeof THEMES)[number];

export const gameRecord = pgTable(
  "game_record",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    theme: text("theme", { enum: THEMES }).notNull(),
    moves: integer("moves").notNull(),
    seconds: integer("seconds").notNull(),
    stars: integer("stars").notNull(),            // 1 | 2 | 3
    isNewBest: boolean("is_new_best").notNull().default(false),
    clientNonce: text("client_nonce").notNull(),  // 前端生成，UUIDv4
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("game_record_user_nonce_uniq").on(t.userId, t.clientNonce),
    index("game_record_user_theme_idx").on(t.userId, t.theme),
    index("game_record_theme_moves_seconds_idx").on(t.theme, t.moves, t.seconds),
  ],
);

export const gameRecordRelations = relations(gameRecord, ({ one }) => ({
  user: one(user, { fields: [gameRecord.userId], references: [user.id] }),
}));
```

### 2.2 索引策略
- `user_nonce_uniq`：幂等去重（同 nonce 重复提交返回旧记录）。
- `user_theme_idx`：支撑"我的战绩"按用户+主题查询。
- `theme_moves_seconds_idx`：支撑排行榜排序。

### 2.3 迁移
- 复用 `pnpm run db:push`（Drizzle push）；CI 中显式声明 `pnpm run db:generate` 后再 push。

---

## 3. API 契约（tRPC）

新增文件 `packages/api/src/routers/game.ts` 与 `packages/api/src/routers/leaderboard.ts`，在 `routers/index.ts` 中挂载。

### 3.1 `game.submit`
- **类型**：`protectedProcedure.mutation`
- **Zod 输入**：
  ```ts
  z.object({
    theme: z.enum(THEMES),
    moves: z.number().int().min(8).max(99),
    seconds: z.number().int().min(1).max(60 * 60),
    stars: z.number().int().min(1).max(3),
    clientNonce: z.string().uuid(),
  })
  ```
- **行为**：
  1. 按 `(userId, clientNonce)` 查重；命中则直接返回旧记录。
  2. 按 `(userId, theme, moves asc, seconds asc)` 查询历史最佳（取前 1）。
  3. 写入新记录，`isNewBest = 优于历史最佳 || 无历史`。
  4. 返回 `{ record, isNewBest, prevBest }`。
- **错误码**：`UNAUTHORIZED` / `BAD_REQUEST`（校验失败） / `INTERNAL_SERVER_ERROR`。

### 3.2 `game.myHistory`
- **类型**：`protectedProcedure.query`
- **输入**：`{ theme?: Theme; cursor?: string; limit?: number (默认 20, 上限 50) }`
- **返回**：`{ items: GameRecord[], nextCursor?: string, total: number }`
- **排序**：`createdAt desc, id desc`。

### 3.3 `game.myBest`
- **类型**：`protectedProcedure.query`
- **输入**：`{ theme?: Theme }`（不传则聚合全部主题）
- **返回**：
  - 单主题：`{ best: GameRecord | null, total, threeStarCount }`
  - 多主题（不传 theme）：`Array<{ theme: Theme; best: GameRecord | null; total: number; threeStarCount: number }>`

### 3.4 `leaderboard.list`
- **类型**：`publicProcedure.query`
- **输入**：`{ theme: Theme; limit?: number (默认 10, 上限 50) }`
- **返回**：`{ items: Array<{ rank: number; user: { id: string; name: string }; record: GameRecord }> }`
- **排序**：`moves asc, seconds asc, createdAt asc, id asc`。
- **附加**：若调用方已登录且未入榜，附带 `myBest: GameRecord | null, myRank: number | null`。

### 3.5 错误处理统一规范
- 复用 `packages/api/src/index.ts` 的 `protectedProcedure` 抛 `UNAUTHORIZED`。
- 校验失败抛 `BAD_REQUEST` + `zodError.flatten()`。
- 持久化失败抛 `INTERNAL_SERVER_ERROR` 并 log。

---

## 4. 前端结构

### 4.1 路由
| 路径 | 组件 | 鉴权 |
| --- | --- | --- |
| `/` | `routes/index.tsx` | public（保留原样，扩展 CTA） |
| `/login` | `routes/login.tsx` | public |
| `/dashboard` | `routes/_auth/dashboard.tsx` | auth |
| `/game` | `routes/_auth/game.tsx`（新增） | public，登录态享额外能力 |
| `/stats` | `routes/_auth/stats.tsx`（新增） | auth |
| `/leaderboard` | `routes/leaderboard.tsx`（新增） | public |

> 备注：`_auth` 是 TanStack Router 的 pathless layout route，提供 `beforeLoad` 鉴权（参考 `routes/_auth/route.tsx`）。`/game` 与 `/leaderboard` 允许访客访问但限制能力。

### 4.2 组件清单
| 路径 | 用途 |
| --- | --- |
| `apps/web/src/components/game/memory-match.tsx` | 游戏主体（含棋盘 / 主题 / 计时 / 模态 / 音效） |
| `apps/web/src/components/game/theme-chips.tsx` | 主题选择 |
| `apps/web/src/components/game/stat-bar.tsx` | 顶部三宫格（用时/步数/最佳） |
| `apps/web/src/components/game/result-modal.tsx` | 结算弹窗（提交成绩、保存与否） |
| `apps/web/src/components/stats/theme-card.tsx` | 战绩主题卡片 |
| `apps/web/src/components/stats/history-table.tsx` | 历史列表 |
| `apps/web/src/components/leaderboard/leaderboard-table.tsx` | 排行榜表格 |

### 4.3 Hooks
| Hook | 职责 |
| --- | --- |
| `useGameState()` | 包装 `MemoryMatchGame` 内部 reducer，暴露 `{ state, flip, newGame, setTheme, setSound }` |
| `useGameSubmit()` | `trpc.game.submit.useMutation` + 提交策略（重试 3 次，指数退避） + 成功时 invalidate `game.myBest`、`game.myHistory`、`leaderboard.list` |

### 4.4 移植原则
- `docs/memory-match.html` 中的 CSS（`<style>` 标签）原样迁移到 `apps/web/src/components/game/memory-match.css`，使用 `@x-game/ui` 已有的 `cn` / `tailwind-merge` 工具做类名拼接。
- WebAudio 与 `localStorage` 兜底逻辑保留；登录态额外走云端。
- 不引入新 UI 库；用 `packages/ui` 已有的 `Button` `Card` `Tabs` `Table` `Skeleton` `Toast`（sonner）等。

---

## 5. 鉴权与权限矩阵

| 操作 | Guest | Player |
| --- | --- | --- |
| 玩游戏 | ✅ | ✅ |
| localStorage 记录个人最佳 | ✅ | ✅（双写） |
| `game.submit` 入库 | ❌ | ✅ |
| `game.myHistory` / `game.myBest` | ❌ | ✅ |
| 进入 `/stats` | 跳 `/login` | ✅ |
| `leaderboard.list` | ✅（只读） | ✅ |
| 上榜 | ❌ | ✅（自动） |

服务端强制：所有 `game.*` 写操作用 `protectedProcedure`；排行榜读用 `publicProcedure` 但在响应中按登录态附 `myBest`/`myRank`。

---

## 6. 配置 / 环境变量

无需新增环境变量。沿用：
- `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`CORS_ORIGIN`（`packages/env`）。
- DB 连接字符串（`packages/env/server.ts`）。

---

## 7. 错误处理与可观测性

- **客户端**：所有 tRPC 错误通过 `utils/trpc.ts` 中 `QueryCache.onError` toast；mutation 错误额外在 `useGameSubmit` 内 toast「成绩未保存」。
- **服务端**：在 `apps/server/src/index.ts` 加一条 `console.error('[game]', err)` 简单日志（不引入新依赖）。
- **重试策略**：`useGameSubmit` 内 3 次重试（300ms / 800ms / 2000ms），最终失败后保留按钮可手动重提。

---

## 8. 兼容与回归

- 不修改既有 `sign-in-form.tsx` / `sign-up-form.tsx` / `user-menu.tsx` / `header.tsx` 的对外 API。
- `header.tsx` 仅追加导航项，不改既有样式。
- `apps/docs`（Starlight）本次不动。
- `docs/memory-match.html` 保留，作为视觉/交互基线。

---

## 9. 变更日志

| 日期 | 变更 | 触发 |
| --- | --- | --- |
| 2026-06-30 | 初始化 SPEC：三件套首次入库 | `work-prd-change` |