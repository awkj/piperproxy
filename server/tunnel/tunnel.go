// Package tunnel 负责 CONNECT 后的上游连接建立。
//
// 抽象出 Dialer 是为了让 GO-2 能在这里挂：
//   - 直连 vs 走二级代理（http/socks5）
//   - SNI sniff → 决定是 MITM 还是透传
//   - 规则命中的特殊处理（hosts 改写、目标重定向等）
package tunnel

import (
	"context"
	"net"
	"time"
)

// Dialer 接受 target（host:port）并返回到上游的 TCP 连接。
type Dialer interface {
	Dial(ctx context.Context, network, address string) (net.Conn, error)
}

// Direct 是最朴素的直连实现，用作 GO-1 默认值。
type Direct struct{}

func (Direct) Dial(ctx context.Context, network, address string) (net.Conn, error) {
	d := net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	return d.DialContext(ctx, network, address)
}
