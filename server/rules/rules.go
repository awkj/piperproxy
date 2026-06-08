// Package rules 是 piper 规则引擎（GO-4）。
//
// 规则格式：每行 `pattern op://value [op2://value2 ...]`，# 注释，@ 远程包含。
// Engine.Match 返回命中的所有 Directive，让 proxy.Handler 按序执行改写。
package rules

import (
	"context"
	"net/http"
)

// Directive 是一个匹配命中的 operator-value 对。
// Op 为 §4.5 定义的 30 个核心 operator 名称，Value 为 `://` 之后的原始值字符串。
type Directive struct {
	Op      string // e.g. "host", "proxy", "resHeaders"
	Value   string // e.g. "1.2.3.4", "127.0.0.1:8080", "X-Foo=bar"
	Pattern string // 命中此 directive 的规则 pattern（用于 dir:// 前缀剥离等）
}

// Action 是规则匹配后给出的改写指令集。
// Directives 包含按规则文件顺序排列的所有命中 operator。
// 其余字段由 GO-5 proxy.Handler 从 Directives 展开，方便后续快路径访问。
type Action struct {
	// Directives 按文件顺序记录命中的所有 op-value 对，供 handler 顺序执行。
	Directives []Directive

	// ---- 以下字段由 proxy.Handler 从 Directives 展开 (GO-5) ----

	// RewriteURL 非空时把请求重写到这个绝对 URL（覆盖 host/path/scheme）。
	RewriteURL string

	// AddRequestHeaders / DelRequestHeaders 修改上游请求头。
	AddRequestHeaders http.Header
	DelRequestHeaders []string

	// AddResponseHeaders / DelResponseHeaders 修改回给客户端的响应头。
	AddResponseHeaders http.Header
	DelResponseHeaders []string

	// MockStatus 非 0 时短路，直接用这个 status + MockBody 回客户端，不走上游。
	MockStatus int
	MockBody   []byte

	// Tags 标识本次匹配命中的规则行，用于日志 / UI 展示。
	Tags []string
}

// Engine 给定请求返回应执行的 Action。返回的 Action 永远非 nil（无命中时是零值 Action）。
type Engine interface {
	Match(ctx context.Context, r *http.Request) *Action
}

// Nop 不做任何匹配。
type Nop struct{}

func (Nop) Match(context.Context, *http.Request) *Action { return &Action{} }
