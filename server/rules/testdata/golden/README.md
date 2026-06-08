# Rules Engine 黄金集 Fixture

## 用途

为 GO-4（`server/rules/` 规则引擎实现）提供行为规范：每组 fixture 定义了**规则文本 + HTTP 请求 → 期望 Action** 的三元组。  
GO-4 实现的 `golden_test.go` 应遍历本目录所有 `*_input.json`，调用 `Engine.Match`，与对应的 `*_expected.json` 做 diff。

## 文件命名

```
<name>_input.json     # 输入：rules 文本 + 请求描述
<name>_expected.json  # 输出：期望的 Action（仅含非零字段）
```

## Input JSON Schema

```json
{
  "comment": "本用例描述（可选）",
  "rules": "多行规则文本，原样传给 engine.Load()",
  "request": {
    "method": "GET",
    "url": "http://www.example.com/path?q=1",
    "headers": { "User-Agent": "TestAgent/1.0" },
    "body": "可选请求体（base64 or 明文字符串）"
  }
}
```

## Expected JSON Schema（Action 字段映射）

| 字段 | 类型 | 对应 operator | 说明 |
|---|---|---|---|
| `host` | string | `host://` | 覆盖目标 IP / hostname，不含端口 |
| `host_port` | string | `host://ip:port` | 覆盖目标端口（可选，仅当 host:// 含端口时出现） |
| `proxy_url` | string | `proxy://` `https-proxy://` `socks://` | 上游代理 URL，scheme 区分类型：`http://` / `https://` / `socks5://` |
| `req_method` | string | `method://` | 覆盖 HTTP 方法（大写） |
| `req_url` | string | `urlReplace://` | 完整 URL 替换 |
| `req_params` | {k:v} | `urlParams://` | 追加/覆盖 URL query 参数 |
| `req_ua` | string | `ua://` | 覆盖 User-Agent |
| `req_referer` | string | `referer://` | 覆盖 Referer |
| `add_req_headers` | {k:[v]} | `reqHeaders://` | 向上游请求追加/覆盖的 header（值为字符串数组） |
| `del_req_headers` | [string] | `reqHeaders://k=`（值为空） | 删除的请求 header 名列表 |
| `req_cookies` | {k:v} | `reqCookies://` | 设置请求 cookie |
| `set_req_body` | string | `reqBody://` | 替换请求体 |
| `req_replace` | [{pattern,replacement}] | `reqReplace://` | 请求体正则替换（有序） |
| `mock_status` | int | `statusCode://` | 直接返回该 status，不走上游（0 = 无 mock） |
| `replace_status` | int | `replaceStatus://` | 改写上游实际响应的 status code（0 = 不改） |
| `mock_body` | string | `resBody://` `file://(inline)` | 替换/注入响应体内容 |
| `mock_file` | string | `file://` `xfile://` `rawfile://` `tpl://` `jsonp://` | 以该文件路径作为响应体来源 |
| `redirect` | string | `redirect://` | 302/301 跳转目标 URL |
| `add_res_headers` | {k:[v]} | `resHeaders://` | 追加/覆盖响应 header |
| `del_res_headers` | [string] | `resHeaders://k=`（值为空） | 删除的响应 header 名列表 |
| `res_cookies` | {k:v} | `resCookies://` | 设置响应 Set-Cookie |
| `res_replace` | [{pattern,replacement}] | `resReplace://` | 响应体正则替换（有序） |
| `res_cors` | object | `resCors://` | CORS 配置（见下） |
| `req_delay_ms` | int | `reqDelay://` | 请求转发前延迟（毫秒） |
| `res_delay_ms` | int | `resDelay://` | 响应返回前延迟（毫秒） |
| `req_speed_kbps` | int | `reqSpeed://` | 请求体限速（kbps，0=不限） |
| `res_speed_kbps` | int | `resSpeed://` | 响应体限速（kbps，0=不限） |
| `enable` | [string] | `enable://` | 启用的特性列表（如 `capture`、`https`） |
| `disable` | [string] | `disable://` | 禁用的特性列表（如 `cache`、`gzip`） |
| `ignore` | bool | `ignore://` | true = 忽略本请求的其他匹配规则 |
| `filter` | string | `filter://` | 条件过滤表达式（原始值，引擎内部求值） |
| `pipe_url` | string | `pipe://` | 将请求管道转发到该代理 |
| `log` | bool | `log://` | true = 记录本请求到日志 |
| `script_ref` | string | `plugin://` | 脚本路径（piper: 命名空间或相对路径 .js） |
| `tags` | [string] | — | 命中规则的原始文本（用于日志/UI 展示） |

### res_cors 对象字段

```json
{
  "origin": "*",
  "methods": "GET, POST, OPTIONS",
  "headers": "Content-Type, Authorization",
  "credentials": false,
  "max_age": 86400
}
```

## 模式匹配语法（测试覆盖点）

| 模式 | 说明 | 示例 fixture |
|---|---|---|
| `example.com` | 精确域名匹配（含子路径） | `host_basic` |
| `example.com/api` | 域名+路径前缀 | `urlParams_path_prefix` |
| `$http://example.com/exact` | 精确 URL（`$` 前缀） | `pattern_exact_url` |
| `*.example.com` | 单级通配域名 | `pattern_wildcard_single` |
| `**.example.com` | 多级通配域名 | `pattern_wildcard_multi` |
| `/^regexp$/` | 正则模式 | `pattern_regex` |
| `!example.com` | 负向模式（不匹配） | `pattern_negative` |
| (无匹配) | 无规则命中，期望空 Action | `pattern_no_match` |

## Operator 白名单（GO-4 §4.5 共 37 个）

30 个核心 operator 的实际计数（§4.5 表格）：

| 类别 | operator 列表 |
|---|---|
| 转发 (4) | `host` `proxy` `https-proxy` `socks` |
| 请求改写 (9) | `reqHeaders` `reqCookies` `reqBody` `reqReplace` `method` `urlReplace` `urlParams` `ua` `referer` |
| 响应改写 (8) | `resHeaders` `resCookies` `resBody` `resReplace` `statusCode` `replaceStatus` `redirect` `resCors` |
| 数据源 (5) | `file` `xfile` `rawfile` `tpl` `jsonp` |
| 延迟/限速 (4) | `reqDelay` `resDelay` `reqSpeed` `resSpeed` |
| 控制 (6) | `enable` `disable` `ignore` `filter` `pipe` `log` |
| 扩展 (1) | `plugin` |

白名单之外的 operator 应返回 `"unsupported_op"` 错误，不静默忽略。

## Fixture 清单

### 转发
| 文件名 | 测试内容 |
|---|---|
| `host_basic` | `host://` IP 覆盖 |
| `host_with_port` | `host://` 带端口覆盖 |
| `proxy_http` | `proxy://` HTTP 上游代理 |
| `proxy_https` | `https-proxy://` HTTPS 上游代理 |
| `proxy_socks` | `socks://` SOCKS5 上游代理 |

### 请求改写
| 文件名 | 测试内容 |
|---|---|
| `reqHeaders_add` | `reqHeaders://` 追加请求头 |
| `reqHeaders_del` | `reqHeaders://` 删除请求头（值为空） |
| `reqCookies_set` | `reqCookies://` 设置请求 Cookie |
| `reqBody_inline` | `reqBody://` 替换请求体（inline 内容） |
| `reqReplace_text` | `reqReplace://` 请求体文本替换 |
| `method_change` | `method://` 改写 HTTP 方法 |
| `urlReplace_full` | `urlReplace://` 完整 URL 替换 |
| `urlParams_add` | `urlParams://` 追加 query 参数 |
| `ua_override` | `ua://` 覆盖 User-Agent |
| `referer_set` | `referer://` 设置 Referer |

### 响应改写
| 文件名 | 测试内容 |
|---|---|
| `resHeaders_add` | `resHeaders://` 追加响应头 |
| `resCookies_set` | `resCookies://` 设置 Set-Cookie |
| `resBody_inline` | `resBody://` 替换响应体（inline） |
| `resReplace_text` | `resReplace://` 响应体文本替换 |
| `statusCode_mock` | `statusCode://` mock 状态码 + 空 body |
| `replaceStatus_change` | `replaceStatus://` 改写上游响应状态码 |
| `redirect_302` | `redirect://` 302 跳转 |
| `resCors_enable` | `resCors://enable` 启用默认 CORS |

### 数据源
| 文件名 | 测试内容 |
|---|---|
| `file_path` | `file://` 文件路径响应 |
| `file_inline` | `file://(content)` inline 内容响应 |
| `xfile_path` | `xfile://` 路径响应（不改 Content-Type） |
| `rawfile_path` | `rawfile://` 原始二进制文件响应 |
| `tpl_path` | `tpl://` 模板文件响应 |
| `jsonp_path` | `jsonp://` JSONP 文件响应 |

### 延迟/限速
| 文件名 | 测试内容 |
|---|---|
| `reqDelay_ms` | `reqDelay://` 请求延迟（毫秒） |
| `resDelay_ms` | `resDelay://` 响应延迟（毫秒） |
| `reqSpeed_kbps` | `reqSpeed://` 请求限速 |
| `resSpeed_kbps` | `resSpeed://` 响应限速 |

### 控制
| 文件名 | 测试内容 |
|---|---|
| `enable_capture` | `enable://capture` 启用抓包 |
| `disable_cache` | `disable://cache` 禁用缓存 |
| `ignore_all` | `ignore://` 忽略其他匹配规则 |
| `filter_method` | `includeFilter://m:POST` + `file://` 条件过滤 |
| `pipe_forward` | `pipe://` 管道转发 |
| `log_enable` | `log://` 日志标记 |

### 扩展
| 文件名 | 测试内容 |
|---|---|
| `plugin_script` | `plugin://piper.myscript://` 脚本引用 |

### 模式匹配变体
| 文件名 | 测试内容 |
|---|---|
| `pattern_wildcard_single` | `*.example.com` 单级通配 |
| `pattern_wildcard_multi` | `**.example.com` 多级通配 |
| `pattern_regex` | `/^regexp$/` 正则模式 |
| `pattern_exact_url` | `$http://exact.example.com/path` 精确 URL |
| `pattern_path_prefix` | `example.com/api/` 路径前缀 |
| `pattern_no_match` | 无规则命中 |
| `pattern_negative` | `!excluded.example.com` 负向模式 |

### 组合用例
| 文件名 | 测试内容 |
|---|---|
| `combined_multi_op` | 同一 pattern 多个 operator |
| `combined_priority` | 两条规则同时命中，后者覆盖前者 |
