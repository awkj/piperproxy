# Prompt 06：Rules 完整化（分组 CRUD + 启用切换 + 导入导出）

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。

## 背景

`features/rules/RulesPanel.tsx` 现已具备：
- 列表展示 + 选中切换
- CodeMirror 6 + whistle DSL 高亮（cm-whistle.ts）
- 单组保存（`cgi-bin/rules/select`）+ 脏状态提示

缺：分组的新建/重命名/删除、启用/禁用单条或全部、导入/导出。

老前端散落在 `biz/webui/htdocs/src/js/{rules.js,rules-list.js,rules-dialog.js,enabled-rules.js}`。

## 后端接口（已存在）

```
cgi-bin/rules/add          { name, value? }
cgi-bin/rules/remove       { list: [name] }
cgi-bin/rules/rename       { name, newName }
cgi-bin/rules/enabled      { name }            （单条启用）
cgi-bin/rules/select       { name, value }     （单条更新内容）
cgi-bin/rules/unselect     { name }            （取消启用）
cgi-bin/rules/disable-all-rules    { disabledAllRules: 0|1 }
cgi-bin/rules/disable-default      { disabledDefault: 0|1 }
cgi-bin/rules/allow-multiple-choice { allowMultipleChoice: 0|1 }
cgi-bin/rules/import       multipart 上传（看老 import-dialog.js）
cgi-bin/rules/export       GET 直接下载
cgi-bin/rules/list2?order=1   （已用，返回数组 [{name, value}]）
```

**实施前**先 `cat biz/webui/cgi-bin/rules/<endpoint>.js` 验证 body 字段名（prompt 04 已有过 body 形状不一致的踩坑，agent 主动核对就好）。

## 目标

### A. 分组 CRUD

`RulesPanel.tsx` 左侧列表：
- 顶部 `+` 按钮（已有占位）：弹 Radix Dialog 输入名字 → POST `cgi-bin/rules/add` → `mutate()`
- 每行 hover 出现"重命名" / "删除"图标按钮（lucide `Pencil`、`Trash2`）
  - 删除走 Radix `AlertDialog` 二次确认（依赖 `@radix-ui/react-alert-dialog`，已装）
  - "Default" 这条特殊：不允许重命名/删除，按钮置灰
- 每条名字旁加 checkbox，控制启用/禁用：
  - 选中调 `cgi-bin/rules/enabled`，取消调 `cgi-bin/rules/unselect`
  - 状态来自 `list2` 响应里 `selectedList` —— 注意，`list2?order=1` 的当前响应只返回 `[{name,value}]`，但实际后端在 `cgi-bin/rules/list2.js` 里还有 selected 信息，**先看一眼这个 cgi 源**确认是否需要换接口或换参数。如果要换，更新 `src/api/rules.ts` 的 `RulesListResp` 类型。

### B. 全局开关

顶栏右侧加两个开关（Radix `Switch`，已装）：
- "禁用所有规则" → `disable-all-rules`
- "允许多选" → `allow-multiple-choice`

状态从哪来？老前端通过 `cgi-bin/get-data` 拿（字段 `disabledAllRules`、`allowMultipleChoice`）。新前端没引这个轮询，可以独立调 `cgi-bin/rules/list2` 或新增 `cgi-bin/get-data` 的轻量调用——为简化，**给 RulesPanel 自己 SWR 一次 `cgi-bin/get-data`**（refreshInterval=0，按需 mutate）拿全局状态。

### C. 导入 / 导出

顶栏 / 三点菜单加：
- "导入"：`<input type="file">` 选 .json 或 .txt → POST `multipart` 到 `cgi-bin/rules/import`
- "导出"：`window.open('cgi-bin/rules/export')` 触发浏览器下载

### D. 启用一条规则后，编辑器自动切到那条（保持当前 RulesPanel 行为不变即可）

## 文件改动范围

- `src/api/rules.ts`：补 6-8 个 mutation 函数 + 一个 `fetchRulesGlobalState` 辅助
- `src/features/rules/RulesPanel.tsx`：扩展 UI
- 可拆出 `src/features/rules/RuleListItem.tsx` 让 RulesPanel 不爆字数
- `src/features/rules/NewGroupDialog.tsx` / `RenameDialog.tsx`：复用 Radix Dialog
- `src/features/rules/RulesToolbar.tsx`：顶栏开关 + 导入导出
- `src/i18n/locales/{en-US,zh-CN}.json` 同步加 key（namespace `rules.*`，**不要碰其它命名空间**）
- 复用 `src/lib/mutate.ts` 的 `runMutation`（HTTPS/Plugins/Values 都在用）

## 不要做

- 不要碰 `features/{network,frames,composer,plugins,values,https}/` 里的任何文件
- 不要碰 `cgi-bin/`、`lib/`、`bin/`、根 `package.json`
- 不要改主仓 `package.json` 或 `pnpm-workspace.yaml`（每次 pnpm 命令记得用 `--ignore-workspace`）

## 验收

```sh
cd biz/webui/htdocs-next
./node_modules/.bin/tsc -b --noEmit   # 必须干净
./node_modules/.bin/vite build         # 必须通过
```

手动验收（启动后端 + `pnpm dev` 后）：
1. 新建一个分组 → 列表增加 → 写两条规则 → 保存 → 启用 checkbox → 抓包能命中
2. 重命名 → 名字更新 → 编辑器仍指向那条
3. 删除 → 二次确认 → 列表减少
4. "禁用所有规则"打开 → 抓包不再命中任何规则
5. 导出 → 下载 .txt；改个名字再导入 → 列表多一条

## 提交

按 4 个独立 commit 粒度（CRUD / 启用切换 / 全局开关 / 导入导出），中文 message。

输出格式：4 个 commit hash + 每块"已完成 / 有 caveat / skip" 简短说明，250 字内。
