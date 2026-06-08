// Package codegen 把 piper 抓到的 HTTP 流量翻译成可粘到终端复现的客户端代码。
//
// v1 范围：仅 curl，仅 macOS / Linux POSIX shell（zsh / bash）。
// 详见 docs/competitive/specs/p1-code-generator.md。
//
// 包内不直接依赖 api.CaptureItem——避免与 server/api 形成 import 环。
// 调用方（api handler）负责把 CaptureItem 拍平到 Request 结构再传进来。
package codegen

import (
	"maps"
	"net/url"
	"slices"
	"strings"
)

// Request 是 codegen 唯一接受的输入：从一条抓包里抽出 curl 关心的字段。
type Request struct {
	Method  string
	URL     string
	Headers map[string]string
	Body    string
}

// BuildCurl 把一次 HTTP 请求转成可粘到 zsh / bash 直接跑的 curl 命令。
//
// 输出约定：
//   - URL、header value、body 一律用单引号包裹；body 内 ' 转为 '\''
//   - 多 header 每条独立 -H，行尾 ` \` 续行
//   - JSON / 文本 body → --data-raw
//   - application/x-www-form-urlencoded → 多条 --data-urlencode
//   - multipart/form-data → 保留原始 body + Content-Type（含 boundary），让用户按需自己改 -F
//   - cookies 合并到单条 -b
//   - 自动剔除 Host / Content-Length / Connection；Accept-Encoding 含 gzip/br/deflate 时改成 --compressed
func BuildCurl(req Request) string {
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	var lines []string
	lines = append(lines, "curl "+shellSingleQuote(req.URL))
	if method != "GET" {
		lines = append(lines, "-X "+method)
	}

	headers := req.Headers
	contentTypeRaw := headerValue(headers, "Content-Type")
	mediaType := mediaTypeOf(contentTypeRaw)

	skip := map[string]bool{
		"host":           true,
		"content-length": true,
		"connection":     true,
	}
	addCompressed := false
	if ae := strings.ToLower(headerValue(headers, "Accept-Encoding")); strings.Contains(ae, "gzip") || strings.Contains(ae, "deflate") || strings.Contains(ae, "br") {
		addCompressed = true
		skip["accept-encoding"] = true
	}
	cookieValue := headerValue(headers, "Cookie")
	if cookieValue != "" {
		skip["cookie"] = true
	}

	keys := slices.Sorted(maps.Keys(headers))
	for _, k := range keys {
		if skip[strings.ToLower(k)] {
			continue
		}
		lines = append(lines, "-H "+shellSingleQuote(k+": "+headers[k]))
	}
	if cookieValue != "" {
		lines = append(lines, "-b "+shellSingleQuote(cookieValue))
	}
	if addCompressed {
		lines = append(lines, "--compressed")
	}

	lines = append(lines, bodyFlags(mediaType, req.Body)...)

	return joinWithContinuation(lines)
}

// shellSingleQuote 用 POSIX 标准做法把任意字符串包成单引号字面量。
// 内部 ' 字符替换成 '\''（关闭引号、转义引号、重开引号）。
func shellSingleQuote(s string) string {
	if s == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// headerValue 大小写不敏感地查头。命中返回原值（大小写保留），未命中返回 ""。
func headerValue(headers map[string]string, name string) string {
	lower := strings.ToLower(name)
	for k, v := range headers {
		if strings.ToLower(k) == lower {
			return v
		}
	}
	return ""
}

// mediaTypeOf 从完整 Content-Type 抽出 lowercased media type，丢掉 parameters。
//
//	"application/json; charset=utf-8" → "application/json"
func mediaTypeOf(ct string) string {
	if ct == "" {
		return ""
	}
	mt := ct
	if i := strings.Index(mt, ";"); i >= 0 {
		mt = mt[:i]
	}
	return strings.ToLower(strings.TrimSpace(mt))
}

// bodyFlags 按 mediaType 选合适的 curl body 选项。空 body 返回 nil。
func bodyFlags(mediaType, body string) []string {
	if body == "" {
		return nil
	}
	switch {
	case mediaType == "application/x-www-form-urlencoded":
		// 解析 a=1&b=2，每条转成一个 --data-urlencode 'k=v'
		// 解析失败时回退 --data-raw 原 body
		pairs, err := url.ParseQuery(body)
		if err != nil || len(pairs) == 0 {
			return []string{"--data-raw " + shellSingleQuote(body)}
		}
		keys := slices.Sorted(maps.Keys(pairs))
		out := make([]string, 0, len(pairs))
		for _, k := range keys {
			for _, v := range pairs[k] {
				out = append(out, "--data-urlencode "+shellSingleQuote(k+"="+v))
			}
		}
		return out
	case strings.HasPrefix(mediaType, "multipart/form-data"):
		// 不重建 boundary —— 直接保留 body + Content-Type；
		// 想逐字段编辑，让用户自己改成 -F 'key=value' / -F 'file=@/path'。
		return []string{
			"--data-raw " + shellSingleQuote(body),
		}
	default:
		// JSON / text / 其他：原样塞 --data-raw
		// 调用方仍然保留 Content-Type 头，所以服务端能正确识别
		return []string{"--data-raw " + shellSingleQuote(body)}
	}
}

// joinWithContinuation 把多行用 " \\\n  " 拼起来，第一行不缩进，续行 2 空格缩进。
func joinWithContinuation(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	if len(lines) == 1 {
		return lines[0]
	}
	var sb strings.Builder
	for i, l := range lines {
		if i > 0 {
			sb.WriteString("  ")
		}
		sb.WriteString(l)
		if i < len(lines)-1 {
			sb.WriteString(" \\\n")
		}
	}
	return sb.String()
}
