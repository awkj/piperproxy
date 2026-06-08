package rules

import (
	"net/url"
	"regexp"
	"strings"
)

// matchFunc 判断 URL 是否命中某个模式。
type matchFunc func(u *url.URL) bool

// compilePattern 把规则文本中的 pattern 字符串编译为 matchFunc。
//
// 支持的模式类型（按检测顺序）：
//  1. `!pattern`  — 负向：对内部模式取反
//  2. `$pattern`  — 精确：URL 字符串完全匹配（去掉协议后缀也行）
//  3. `/re/[i]`   — 正则：直接作为 regexp 匹配完整 URL
//  4. 含 `*` 或 `.domain` 开头 — 通配符：转为 regexp
//  5. 其他        — 前缀：domain 前缀或 URL 前缀匹配
func compilePattern(pattern string) matchFunc {
	// 负向
	if strings.HasPrefix(pattern, "!") {
		inner := compilePattern(pattern[1:])
		return func(u *url.URL) bool { return !inner(u) }
	}
	// 精确
	if strings.HasPrefix(pattern, "$") {
		exact := pattern[1:]
		return exactMatch(exact)
	}
	// 正则 /re/ 或 /re/i
	if re, ok := parseRegexpPattern(pattern); ok {
		return func(u *url.URL) bool { return re.MatchString(u.String()) }
	}
	// 通配符（含 * 或 ~ 或以 . 开头的域名）
	if strings.ContainsAny(pattern, "*~") || strings.HasPrefix(pattern, ".") {
		return wildcardMatch(pattern)
	}
	// 默认：前缀匹配
	return prefixMatch(pattern)
}

// ---- 精确匹配 ----

func exactMatch(exact string) matchFunc {
	// 如果 exact 不含 ://，则匹配时忽略协议
	hasProto := strings.Contains(exact, "://")
	return func(u *url.URL) bool {
		full := u.String()
		if full == exact {
			return true
		}
		if !hasProto {
			// 去掉 scheme:// 再比较
			stripped := stripScheme(full)
			return stripped == exact
		}
		return false
	}
}

func stripScheme(rawURL string) string {
	if idx := strings.Index(rawURL, "://"); idx != -1 {
		return rawURL[idx+3:]
	}
	return rawURL
}

// ---- 正则匹配 ----

// parseRegexpPattern 解析 /pattern/ 或 /pattern/i 语法。
func parseRegexpPattern(s string) (*regexp.Regexp, bool) {
	if !strings.HasPrefix(s, "/") {
		return nil, false
	}
	s = s[1:]
	flags := ""
	if strings.HasSuffix(s, "/i") {
		s = s[:len(s)-2]
		flags = "(?i)"
	} else if strings.HasSuffix(s, "/") {
		s = s[:len(s)-1]
	} else {
		return nil, false
	}
	re, err := regexp.Compile(flags + s)
	if err != nil {
		return nil, false
	}
	return re, true
}

// ---- 通配符匹配 ----

func wildcardMatch(pattern string) matchFunc {
	// 以 . 开头：.example.com 匹配 example.com 及其所有子域名
	if strings.HasPrefix(pattern, ".") {
		domain := pattern[1:] // e.g. "example.com"
		return func(u *url.URL) bool {
			host := hostOnly(u.Host)
			return host == domain || strings.HasSuffix(host, "."+domain)
		}
	}
	re := wildcardToRegexp(pattern)
	if re == nil {
		return func(*url.URL) bool { return false }
	}
	return func(u *url.URL) bool { return re.MatchString(normalizeURL(u)) }
}

// wildcardToRegexp 把通配符 pattern 转为正则。
// `*`  → 匹配单段（不含 / 和 ?）
// `**` → 匹配任意字符（含 /）
// `~`  → 等同 `*`（piper 兼容）
func wildcardToRegexp(pattern string) *regexp.Regexp {
	// 先确定 pattern 是否含协议，若无则前缀加 [a-z]+://
	hasProto := strings.Contains(pattern, "://")

	// 转义特殊字符，然后把 \*\* 和 \* 替换回 regexp
	escaped := regexp.QuoteMeta(pattern)
	// QuoteMeta 把 * 变成 \*，把 ~ 变成 \~
	escaped = strings.ReplaceAll(escaped, `\*\*`, `DOUBLESTAR`)
	escaped = strings.ReplaceAll(escaped, `\*`, `[^/?]*`)
	escaped = strings.ReplaceAll(escaped, `DOUBLESTAR`, `.*`)
	escaped = strings.ReplaceAll(escaped, `\~`, `[^/?]*`)

	var reStr string
	if hasProto {
		reStr = `^` + escaped
	} else {
		reStr = `^[a-z]+://` + escaped
	}

	re, err := regexp.Compile(`(?i)` + reStr)
	if err != nil {
		return nil
	}
	return re
}

// ---- 前缀匹配 ----

// prefixMatch 实现 piper 的域名/路径前缀语义：
//   - `example.com` 匹配 http(s)://example.com/ 及其所有路径，忽略端口
//   - `example.com/path` 匹配 http(s)://example.com/path 及子路径
//   - `http://example.com` 仅匹配 http 协议
func prefixMatch(pattern string) matchFunc {
	// 判断 pattern 是否带协议
	hasProto := strings.Contains(pattern, "://")
	// 判断是否带路径
	var proto, host, path string
	if hasProto {
		idx := strings.Index(pattern, "://")
		proto = pattern[:idx]
		rest := pattern[idx+3:]
		if slashIdx := strings.Index(rest, "/"); slashIdx != -1 {
			host = rest[:slashIdx]
			path = rest[slashIdx:]
		} else {
			host = rest
		}
	} else {
		if slashIdx := strings.Index(pattern, "/"); slashIdx != -1 {
			host = pattern[:slashIdx]
			path = pattern[slashIdx:]
		} else {
			host = pattern
		}
	}
	// 去掉 host 的端口部分（domain-level 匹配忽略端口）
	domainOnly := host
	if portIdx := strings.LastIndex(host, ":"); portIdx != -1 {
		domainOnly = host[:portIdx]
	}

	return func(u *url.URL) bool {
		// 协议检查
		if hasProto && proto != u.Scheme {
			return false
		}
		// 域名检查（去端口后比较）
		uHost := hostOnly(u.Host)
		if uHost != domainOnly {
			return false
		}
		// 路径检查
		if path == "" {
			return true
		}
		uPath := u.Path
		if uPath == "" {
			uPath = "/"
		}
		return uPath == path || strings.HasPrefix(uPath, path+"/") || strings.HasPrefix(uPath, path+"?")
	}
}

// ---- 工具函数 ----

// hostOnly 从 host[:port] 中提取纯 hostname。
func hostOnly(hostport string) string {
	// 处理 IPv6 [::1]:port
	if strings.HasPrefix(hostport, "[") {
		end := strings.Index(hostport, "]")
		if end != -1 {
			return hostport[:end+1]
		}
		return hostport
	}
	if idx := strings.LastIndex(hostport, ":"); idx != -1 {
		return hostport[:idx]
	}
	return hostport
}

// normalizeURL 返回用于 pattern 匹配的规范化 URL 字符串（小写 scheme + host）。
func normalizeURL(u *url.URL) string {
	cp := *u
	cp.Scheme = strings.ToLower(cp.Scheme)
	cp.Host = strings.ToLower(cp.Host)
	return cp.String()
}
