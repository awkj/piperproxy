package rules

import (
	"context"
	"net/http"
	"sync/atomic"
)

// Swappable 是一个可在运行时原子替换内层 Engine 的包装器。
//
// 使用场景：piper 由 piper-cloud 编排时，规则文本来自 --config-url 远端 JSON 字段。
// 编排器切换环境后会调 /piper-cgi/reload-config 触发本端重新 fetch + Swap，
// 已 in-flight 的请求继续用旧 engine（atomic load 是 wait-free），后续请求看到新 engine。
//
// 本身实现 Engine 接口，可以无缝替代 main.go 里的 rules.Engine 注入位置。
type Swappable struct {
	inner atomic.Pointer[Engine]
}

// NewSwappable 用 initial 构造一个可替换 engine；initial nil 时退化为 Nop。
func NewSwappable(initial Engine) *Swappable {
	if initial == nil {
		initial = Nop{}
	}
	s := &Swappable{}
	s.inner.Store(&initial)
	return s
}

// Match 转发给当前内层 engine。Load 是 wait-free，热路径零开销。
func (s *Swappable) Match(ctx context.Context, r *http.Request) *Action {
	return (*s.inner.Load()).Match(ctx, r)
}

// Swap 原子替换内层 engine。nil 等价于 Nop。
func (s *Swappable) Swap(next Engine) {
	if next == nil {
		next = Nop{}
	}
	s.inner.Store(&next)
}
