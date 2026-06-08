// Package event 实现 ECOSYSTEM-PLAN.md §4.2 中的 EventEmitter SPI。
//
// 默认行为是 Noop（不发任何事件）；
// 启动 piper 时传入 --event-webhook URL 切换为 WebhookEmitter，向 URL 推 JSON。
//
// 首版定义 3 种事件类型，schema 由发送方决定（扁平 map）：
//
//	rule.hit         { url, method, host, rules: [...] }
//	server.lifecycle { phase: "start"|"stop", addr }
//	server.health    { uptime_sec, captures_total }
//
// 不在此版本：事件持久化 / 重试 / 批量 / 订阅多端。
// piper-cloud 拿 webhook URL 做审计与抓包索引联动；公司插件可在 piper-cloud 那一侧
// 进一步聚合。
package event

import (
	"context"
	"time"
)

// 事件类型常量。新增类型直接在调用点写字符串即可，常量只方便高频引用。
const (
	TypeRuleHit         = "rule.hit"
	TypeServerLifecycle = "server.lifecycle"
	TypeServerHealth    = "server.health"
)

// Event 是发往订阅者的最小事件载荷。
// Type 决定 Payload 的具体 schema（见包注释）。
type Event struct {
	Type      string         `json:"type"`
	Timestamp time.Time      `json:"timestamp"`
	Payload   map[string]any `json:"payload,omitempty"`
}

// Emitter 是 EventEmitter SPI。
//
// 实现要求：Emit 必须不阻塞 hot path——慢/失败的下游应在内部 fire-and-forget。
// 返回 error 仅用于配置阶段错误（例如 URL 无效），不用作运行期失败信号。
type Emitter interface {
	Emit(ctx context.Context, evt Event) error
}

// Noop 是默认实现：丢弃所有事件。
type Noop struct{}

// Emit 实现 Emitter。
func (Noop) Emit(context.Context, Event) error { return nil }
