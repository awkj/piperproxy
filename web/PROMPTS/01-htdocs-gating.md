# Prompt 01：恢复 W2_NEXT_UI 灰度开关 + 静态资源迁移

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md` 了解项目共识。

## 背景

`biz/webui/htdocs.js` 之前被改成支持 `W2_NEXT_UI=1` 切换新旧 UI，但被回滚（用户主动撤回）。需要换一种**侵入更小、更安全**的方式重做：不直接改 `htdocs.js`，而是用一个 wrapper。

同时，新 UI 需要老前端 `biz/webui/htdocs/img/` 下的所有图片（应用图标 `img/app/*.png`、协议图标等）才能正常显示，目前 `htdocs-next/public/img/` 只有 `whistle.png` 和 `favicon.ico`。

## 目标

1. 提供一种**不修改 `biz/webui/htdocs.js` 文件本身**的方式启用新 UI，避免污染老链路。
2. 新 UI 启动时（开发态和构建态）能访问所有需要的图片。

## 落地方案

### A. 静态资源同步

在 `htdocs-next/` 写一个小脚本 `scripts/sync-assets.mjs`：
- 把 `../htdocs/img/` 整体 `cp -R` 到 `public/img/`（覆盖式）。
- 注意保留新 UI 已有的 `whistle.png` `favicon.ico`（老仓库里也有同名文件，覆盖也无所谓）。

接到 `package.json` 的 `predev` 和 `prebuild`：
```json
"predev": "node ./scripts/sync-assets.mjs",
"prebuild": "node ./scripts/sync-assets.mjs",
```

把 `public/img/` 加到 `.gitignore`（避免把老仓图片二次提交进新前端）。

### B. 灰度切换（不改 htdocs.js）

新建 `biz/webui/htdocs.next.js`（与 `htdocs.js` 同目录、同导出形状），内容指向 `htdocs-next/dist`：

```js
var path = require('path');
var ROOT = path.join(__dirname, 'htdocs-next', 'dist');

exports.getHtmlFile = function(file) { return path.join(ROOT, file || ''); };
exports.getImgFile  = function(file) { return path.join(ROOT, 'img', file || ''); };
exports.getJsFile   = function(file) { return path.join(ROOT, 'assets', file || ''); };
```

然后**找到引用 `./htdocs`（require('./htdocs')）的入口文件**——多半在 `biz/webui/lib/index.js` 或类似——加一行环境变量分支：

```js
var htdocs = process.env.W2_NEXT_UI === '1'
  ? require('./htdocs.next')
  : require('./htdocs');
```

这样 `htdocs.js` 文件本身不动。

> ⚠️ 实施前先 `grep -rn "require.*htdocs[^.]" biz/webui/ | head` 确认到底在哪儿被 require，再决定那一行加在哪。如果调用点超过 3 处，方案改成：在 `htdocs.js` 顶部加一行 `if (process.env.W2_NEXT_UI === '1') return module.exports = require('./htdocs.next');`——这是对老文件最小侵入的改法。

## 验收

1. 默认（无 env 变量）启动 `npm run start`，老 UI 正常。
2. `W2_NEXT_UI=1 npm run start`，浏览器加载新 UI，图标全显示（特别是 Network 面板列表里的 APP 列图标，如果未来加了的话）。
3. `cd biz/webui/htdocs-next && pnpm build` 通过。
4. `git diff biz/webui/htdocs.js` 改动 ≤ 1 行（甚至 0 行）。

## 提交

`feat(webui): W2_NEXT_UI 灰度切换 + 静态资源同步`
