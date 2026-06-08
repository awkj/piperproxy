# 子任务 Prompt 包

每个 prompt 自带完整上下文，可以直接复制到一个全新（`/clear` 后）的 Claude Code session 里运行。

## 怎么用

1. 在新 session 第一条消息里**先粘贴 `00-shared-context.md`**，让 Claude 拿到通用约束。
2. 然后粘贴下面任意一个 prompt（01–04），Claude 会按里面的步骤干活并产出 commit。

或者一次性粘贴：「读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md` 和 `biz/webui/htdocs-next/PROMPTS/03-network-polish.md`，然后开始。」

## 任务清单

| 编号 | 任务 | 估时 | 风险 | 依赖 |
|---|---|---|---|---|
| 01 | W2_NEXT_UI 灰度开关 + 静态资源同步 | 1h | 低 | 无 |
| 02 | Rules CodeMirror 6 whistle 语法高亮 | 半天 | 中（需读老 mode 实现） | 无 |
| 03 | Network 列定制 + Timeline + 右键菜单 | 1 天 | 中 | 无 |
| 04 | Plugins/Values/HTTPS mutations | 1 天 | 中 | 无 |

任务之间**完全独立**，可以并行（用 `git worktree` 各自一个分支）也可以串行。

## 没有列入这里的工作

- 17 个老 `*-dialog.js` 的逐个迁移：建议每个对话框单独开 prompt，模板基于 `01-htdocs-gating.md` 的格式。
- Frame Composer（WebSocket 帧重放）。
- 切流量（默认开 W2_NEXT_UI=1，删老前端）：等所有功能对齐后单独做，0.5 天。
