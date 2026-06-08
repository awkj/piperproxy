# Rules SPEC Checklist

源自 Node 时代 `test/units/*.test.ts` 的覆盖项。每一项对应 piper/whistle 规则语义的一个维度，作为 Go 引擎补 table-driven 测试时的对照清单。

不是"必须全部覆盖"——前端/插件相关项（plugin、weinre、ui、fm）在 Go 端可能不再适用；按 server 当前职责取用。

## 协议 / 转发拓扑

- [ ] connect — CONNECT 隧道建立
- [ ] tunnel — `tunnel://` 直通
- [ ] tunnelPolicy — 隧道策略
- [ ] forward — `127.0.0.1:port` / 上游转发
- [ ] proxy — `proxy://` `http-proxy://` `https-proxy://`
- [ ] socks — `socks://`
- [ ] pac — PAC 文件代理选择
- [ ] redirect — `redirect://`
- [ ] host — `host` 直接 IP 改写
- [ ] https — HTTPS 拦截 / `filter://https`
- [ ] ws — WebSocket
- [ ] xfile — `xfile://` / `xtpl://`

## 匹配 / 选择

- [ ] rule — 规则匹配基础
- [ ] filter — `filter://`、否定匹配
- [ ] ignore — `ignore://`
- [ ] disable — `disable://`
- [ ] wildcard — 通配符 / 域名匹配
- [ ] keys — 命名捕获
- [ ] var — 变量替换
- [ ] urlParams / params — query 匹配
- [ ] urlReplace — URL 改写
- [ ] referer — Referer 匹配
- [ ] method — 方法匹配
- [ ] statusCode / replaceStatus — 状态码匹配 / 改写
- [ ] options — OPTIONS 预检

## 请求改写

- [ ] reqHeaders / reqAppend / reqPrepend / reqReplace — header 增删改
- [ ] reqBody / req.prepend.body.append — body 改写
- [ ] reqCookies — cookie
- [ ] reqCors — CORS 请求
- [ ] reqType / reqCharset — content-type / 编码
- [ ] reqDelay / reqSpeed — 节流
- [ ] reqScript — 见 script

## 响应改写

- [ ] resHeaders / resAppend / resPrepend / resReplace — header 增删改
- [ ] resBody / res.prepend.body.append — body 改写
- [ ] resCookies — cookie
- [ ] resCors — CORS 响应
- [ ] resType / resCharset — content-type / 编码
- [ ] resDelay / resSpeed — 节流
- [ ] resScript — 见 script

## 内容来源

- [ ] file / rawfile / xfile — 文件替换
- [ ] insertFile — 内容插入
- [ ] html / css / js — MIME 化替换
- [ ] tpl / tplStr — 模板
- [ ] values — `{key}` 值文件引用
- [ ] rulesFile — 嵌套规则文件
- [ ] ssi-include — SSI 包含
- [ ] range — Range 请求
- [ ] script — 动态规则 / `reqScript` / `resScript`

## 杂项

- [ ] attachment — Content-Disposition
- [ ] cache — 缓存策略
- [ ] auth — Basic/Bearer 注入
- [ ] delete — 字段删除
- [ ] log — 日志规则
- [ ] tps — TPS / 限速
- [ ] ua — User-Agent
- [ ] write — 写副本
- [ ] common / others / utils — 杂项 / 工具
- [ ] composer — Composer 重放
- [ ] _normalizeConnectArgs — CONNECT 参数归一化

## 不计划在 Go server 端覆盖

- plugin / plugins — whistle 插件运行时（Go 重写后不再支持）
- weinre — 远程调试桥
- fm — 文件管理 UI
- ui — Node UI 进程

---

参考语料：[testdata/legacy/](./testdata/legacy/)（rules.txt + assets/{rules,files,values}）。
