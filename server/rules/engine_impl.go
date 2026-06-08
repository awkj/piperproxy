package rules

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// compiledRule 是一条已编译好 matchFunc 的规则行。
type compiledRule struct {
	match   matchFunc
	ops     []Op
	raw     string
	pattern string // 原始 URL pattern 字符串（用于 dir:// 等 prefix-stripping）
}

// engineImpl 是 Engine 的真实实现。
type engineImpl struct {
	rules []compiledRule
}

// New 从规则文本创建 Engine。解析错误（无效行）会被静默跳过。
func New(text string) Engine {
	lines := ParseText(text)
	compiled := make([]compiledRule, 0, len(lines))
	for _, rl := range lines {
		// remoteInclude 在此实现中跳过（不 fetch）
		if len(rl.Ops) == 1 && rl.Ops[0].Name == "remoteInclude" {
			continue
		}
		fn := compilePattern(rl.Pattern)
		compiled = append(compiled, compiledRule{
			match:   fn,
			ops:     rl.Ops,
			raw:     rl.Raw,
			pattern: rl.Pattern,
		})
	}
	return &engineImpl{rules: compiled}
}

// NewFromFile 从文件路径加载规则并创建 Engine。
func NewFromFile(path string) (Engine, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return New(string(data)), nil
}

// Match 遍历所有规则，将命中规则的 Op 追加到 Action.Directives。
// 多条规则可以命中同一个请求（累积语义）。
func (e *engineImpl) Match(_ context.Context, r *http.Request) *Action {
	u := requestURL(r)
	action := &Action{}
	for _, rule := range e.rules {
		if rule.match(u) {
			for _, op := range rule.ops {
				action.Directives = append(action.Directives, Directive{
					Op:      op.Name,
					Value:   op.Value,
					Pattern: rule.pattern,
				})
			}
			action.Tags = append(action.Tags, rule.raw)
		}
	}
	return action
}

// requestURL 从请求中重建完整 URL，包含 scheme（代理请求的 r.URL 已经是绝对路径）。
func requestURL(r *http.Request) *url.URL {
	if r.URL.IsAbs() {
		return r.URL
	}
	// 非代理模式下 r.URL 是相对路径，从 Host header 补全
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = r.URL.Host
	}
	return &url.URL{
		Scheme:   scheme,
		Host:     host,
		Path:     r.URL.Path,
		RawQuery: r.URL.RawQuery,
	}
}

// KnownOps 是 GO-4 §4.5 定义的 30 个核心 operator 集合，用于校验和文档。
var KnownOps = map[string]struct{}{
	// 转发
	"host": {}, "proxy": {}, "https-proxy": {}, "socks": {},
	// 请求改写
	"reqHeaders": {}, "reqCookies": {}, "reqBody": {}, "reqReplace": {},
	"method": {}, "urlReplace": {}, "urlParams": {}, "ua": {}, "referer": {},
	// 响应改写
	"resHeaders": {}, "resCookies": {}, "resBody": {}, "resReplace": {},
	"statusCode": {}, "replaceStatus": {}, "redirect": {}, "resCors": {},
	// 数据源
	"file": {}, "xfile": {}, "rawfile": {}, "tpl": {}, "jsonp": {},
	// 延迟/限速
	"reqDelay": {}, "resDelay": {}, "reqSpeed": {}, "resSpeed": {},
	// 控制
	"enable": {}, "disable": {}, "ignore": {}, "filter": {}, "pipe": {}, "log": {},
	// 扩展
	"plugin": {}, "autosave": {}, "dir": {}, "gql": {},
}

// IsKnownOp 报告 op 是否在 §4.5 子集内。
func IsKnownOp(op string) bool {
	_, ok := KnownOps[op]
	return ok
}

// DirectivesOf 从 Action 中筛选指定 op 名称的 Directives。
func DirectivesOf(a *Action, op string) []string {
	var vals []string
	for _, d := range a.Directives {
		if d.Op == op {
			vals = append(vals, d.Value)
		}
	}
	return vals
}

// HasOp 报告 Action 是否包含指定 op。
func HasOp(a *Action, op string) bool {
	for _, d := range a.Directives {
		if d.Op == op {
			return true
		}
	}
	return false
}

// FirstOp 返回 Action 中第一个指定 op 的 value，未命中时返回空字符串。
func FirstOp(a *Action, op string) string {
	for _, d := range a.Directives {
		if d.Op == op {
			return d.Value
		}
	}
	return ""
}

// SplitKV 把 `key=value` 格式的 op value 拆成 key 和 value。
// 如果没有 `=`，返回 (s, "")。
func SplitKV(s string) (string, string) {
	idx := strings.Index(s, "=")
	if idx == -1 {
		return s, ""
	}
	return s[:idx], s[idx+1:]
}
