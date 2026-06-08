# Prompt 02：Whistle Rules DSL 语法高亮（CodeMirror 6）

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。

## 背景

`biz/webui/htdocs-next/src/features/rules/RulesPanel.tsx` 已经接好了规则列表 + 编辑器 + 保存，但 `<CodeView>` 用的是 `language="text"`——whistle 规则有自己的 DSL（`#`/`//` 注释、协议前缀如 `127.0.0.1 example.com`、内置 RuleName 如 `host://`、`req://`、`resBody://` 等），需要高亮才能用得舒服。

老前端用 CodeMirror 5 的自定义 mode，源在：
- `biz/webui/htdocs/src/js/cm-rules.js`
- `lib/rules/syntax.js`（如果存在）
- 其它 `cm-*.js`、`mode-*.js` 文件

## 目标

把老的 whistle 规则高亮规则用 CodeMirror 6 `StreamLanguage` 重写，作为新前端的一个 language 选项。

## 落地步骤

1. **Read 老 mode 源码**：
   ```sh
   ls biz/webui/htdocs/src/js/cm-*.js
   grep -rn "defineMode.*rules\|whistle.*mode" biz/webui/htdocs/
   ```
   看清楚老 mode 都识别哪些 token（注释、协议、规则名、URL、IP、变量 `${var}`、紧跟在 `://` 后的值）。

2. **新建 CM6 StreamLanguage**：
   `htdocs-next/src/lib/cm-whistle.ts`
   ```ts
   import { StreamLanguage, StreamParser } from '@codemirror/language';

   const parser: StreamParser<unknown> = {
     token(stream) {
       // 1. 行注释 # 或 //
       if (stream.match(/^\s*#.*/) || stream.match(/^\s*\/\/.*/)) return 'comment';
       // 2. 协议规则 xxx://...
       if (stream.match(/[a-zA-Z][a-zA-Z0-9_-]*:\/\//)) return 'keyword';
       // 3. ${variable}
       if (stream.match(/\$\{[^}]+\}/)) return 'variableName';
       // 4. URL/host
       if (stream.match(/[\w.-]+(?:\.[a-z]{2,})/)) return 'string';
       // 5. 数字
       if (stream.match(/\d+/)) return 'number';
       stream.next();
       return null;
     },
   };

   export const whistleLang = StreamLanguage.define(parser);
   ```
   把上面的正则按老 mode 实际识别的 token 表**重写完整**——别照抄我这个示例。

3. **接入 `<CodeView>`**：
   修改 `htdocs-next/src/components/CodeView.tsx`，加 `'whistle'` 到 `CodeLang` 类型和 `EXT_MAP`，引入 `whistleLang`。

4. **RulesPanel 用上**：
   `htdocs-next/src/features/rules/RulesPanel.tsx` 把 `<CodeView language="text" ...>` 改成 `language="whistle"`。

5. **可选：内置 RuleName 自动补全**——whistle 规则名是固定一组（`host`, `req`, `res`, `reqBody`, `resBody`, `reqHeaders` 等几十个）。如果时间充裕，加一个 CM6 `autocompletion` 扩展，把 `lib/rules/util.js` 或类似文件里枚举的规则名做成补全候选。如果不做，文档里写 TODO 即可。

## 验收

- `cd biz/webui/htdocs-next && pnpm build` 通过。
- 启动 `pnpm dev`，进入 Rules tab：
  - 注释行变灰。
  - `host://example.com` 这种规则前缀有颜色。
  - `${var}` 高亮。
- 与老前端 `localhost:5175` 同一段规则做颜色对比（不必像素一致，达到"语义可分"即可）。

## 提交

`feat(rules): CodeMirror 6 whistle DSL 语法高亮`
