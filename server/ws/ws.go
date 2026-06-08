// Package ws 处理 WebSocket（及任意 Upgrade 协议）的握手、抓包与转发。
//
// GO-3 落地：握手转发（ForwardHandshake）+ 双向帧 splice（ProxyFrames）+ Hook 回调。
// 行为参照 apps/proxy/lib/upgrade.ts。
package ws

import "net/http"

// Opcode 常量（RFC 6455 §5.2）。
const (
	OpContinuation byte = 0
	OpText         byte = 1
	OpBinary       byte = 2
	OpClose        byte = 8
	OpPing         byte = 9
	OpPong         byte = 10
)

// Frame 是一帧 WS 数据（RFC 6455 §5.2）。
type Frame struct {
	FromClient bool   // true = client→server
	Fin        bool   // FIN bit（最后一帧则为 true）
	Opcode     byte   // 操作码
	Payload    []byte // 已解掩的有效载荷
}

// Hook 是抓包回调接口；GO-1 仅作为接口占位，GO-3 正式接入。
type Hook interface {
	OnHandshake(r *http.Request)
	OnFrame(f Frame)
	OnClose(err error)
}

// NopHook 不做任何事。
type NopHook struct{}

func (NopHook) OnHandshake(*http.Request) {}
func (NopHook) OnFrame(Frame)              {}
func (NopHook) OnClose(error)              {}
