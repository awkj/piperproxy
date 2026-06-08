package proxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"

	"github.com/awkj/piper/server/ws"
)

// handleUpgrade 处理 WebSocket（或其他 Upgrade 协议）的升级请求。
//
// 流程：
//  1. Hijack 客户端连接，取得原始 TCP（已在 MITM 路径下是 TLS）
//  2. 拨连上游（HTTPS 路径需再包一层 TLS Client）
//  3. 转发 HTTP Upgrade 握手，写 101 回客户端
//  4. 调 ProxyFrames 双向代理 WS 帧
func (h *Handler) handleUpgrade(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Host
	if target == "" {
		target = r.Host
	}
	if target == "" {
		http.Error(w, "piper: missing target host for WebSocket upgrade", http.StatusBadRequest)
		return
	}

	// 补全默认端口（普通代理请求有时不带端口）
	if _, _, err := net.SplitHostPort(target); err != nil {
		switch r.URL.Scheme {
		case "https", "wss":
			target = target + ":443"
		default:
			target = target + ":80"
		}
	}

	// Hijack 客户端连接
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "piper: hijacking not supported", http.StatusInternalServerError)
		return
	}
	clientConn, clientBuf, err := hj.Hijack()
	if err != nil {
		h.logger.Warn("ws: hijack failed", "target", target, "err", err)
		return
	}
	defer clientConn.Close()

	// 拨连上游 TCP
	raw, err := h.tunnel.Dial(r.Context(), "tcp", target)
	if err != nil {
		h.logger.Warn("ws: dial failed", "target", target, "err", err)
		_, _ = io.WriteString(clientConn, "HTTP/1.1 502 Bad Gateway\r\n\r\n")
		return
	}
	defer raw.Close()

	// 若从 HTTPS MITM 路径进来，需对上游再做 TLS Client 握手
	var upstream net.Conn = raw
	if needUpstreamTLS(r) {
		tlsConn, err := h.tlsClientConn(r.Context(), raw, target)
		if err != nil {
			h.logger.Warn("ws: upstream tls handshake failed", "target", target, "err", err)
			_, _ = io.WriteString(clientConn, "HTTP/1.1 502 Bad Gateway\r\n\r\n")
			return
		}
		upstream = tlsConn
		defer upstream.Close()
	}

	// 转发 WS 握手（向上游发 Upgrade 请求，读 101，写 101 回客户端）
	upBuf, err := ws.ForwardHandshake(r, clientBuf, upstream)
	if err != nil {
		h.logger.Warn("ws: handshake failed", "target", target, "err", err)
		_, _ = fmt.Fprintf(clientConn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
		return
	}

	// 如果注入的 wsHook 实现了 NewSession 工厂，给本次连接拿一个独立 hook
	// （per-session 抓帧；api 包的 WSHook 用此机制把帧按 sessionID 分桶）。
	hook := h.wsHook
	if factory, ok := h.wsHook.(interface {
		NewSession(*http.Request) ws.Hook
	}); ok {
		hook = factory.NewSession(r)
	}
	hook.OnHandshake(r)

	// 双向帧代理（阻塞直到连接关闭）
	ws.ProxyFrames(clientBuf.Reader, clientConn, upBuf, upstream, hook)
}

// needUpstreamTLS 判断是否需要对上游建 TLS 连接。
// MITM 路径进来的请求 scheme 已被设为 "https"，wss:// 直连同理。
func needUpstreamTLS(r *http.Request) bool {
	return r.URL.Scheme == "https" || r.URL.Scheme == "wss"
}

// tlsClientConn 把 raw 包装成指向 target 的 TLS Client 连接并完成握手。
func (h *Handler) tlsClientConn(ctx context.Context, raw net.Conn, target string) (*tls.Conn, error) {
	host, _, _ := net.SplitHostPort(target)
	if host == "" {
		host = target
	}
	tlsConn := tls.Client(raw, &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	})
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		return nil, err
	}
	return tlsConn, nil
}
