package proxy

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"

	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/tunnel"
)

// handleConnect 处理 CONNECT 请求。
//
// 流程：
//  1. 用 rules.Engine 决定是否强制透传（disable://capture）
//  2. Hijack 客户端连接 + 回 200 Connection Established
//  3. 强制透传 → 直接 splice
//  4. 否则 sniff 首字节：TLS + 有可用 CA → MITM；非 TLS 或无 CA → 透传
//
// rules 在 CONNECT 没有 path 可用，因此用 `https://<target>/` 合成伪请求做匹配——
// 域名级 pattern（`example.com`、`*.example.com`、`/regex/`）都能正常工作。
func (h *Handler) handleConnect(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Host
	if target == "" {
		target = r.Host
	}

	forcePassthrough := h.connectForcePassthrough(r, target)

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "piper: hijacking not supported", http.StatusInternalServerError)
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		http.Error(w, "piper: hijack: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		_ = client.Close()
		return
	}

	if forcePassthrough {
		h.passthrough(client, target)
		return
	}

	first, peeked, err := tunnel.PeekFirstByte(client)
	if err != nil {
		_ = client.Close()
		h.logger.Debug("connect peek failed", "target", target, "err", err)
		return
	}

	if tunnel.IsTLSClientHello(first) && h.canMITM() {
		h.handleMITM(peeked, target)
		return
	}
	h.passthrough(peeked, target)
}

// connectForcePassthrough 决定是否对该 CONNECT 目标强制透传（不 MITM）。
// 优先级：1. bypass store 命中 → 透传；2. rules disable://capture → 透传。
func (h *Handler) connectForcePassthrough(r *http.Request, target string) bool {
	// 取 hostname 用于 bypass 匹配
	host := target
	if h, _, err := net.SplitHostPort(target); err == nil {
		host = h
	}
	if h.bypass != nil && h.bypass.Matches(host) {
		return true
	}
	if h.rules == nil {
		return false
	}
	fakeReq := r.Clone(r.Context())
	fakeReq.URL = &url.URL{Scheme: "https", Host: target, Path: "/"}
	fakeReq.Host = target
	return shouldDisableCapture(h.rules.Match(r.Context(), fakeReq))
}

// canMITM 判断当前是否注入了真实可用的 CA。Nop 实现的 RootPEM 会返回 ErrCANotConfigured。
func (h *Handler) canMITM() bool {
	if h.ca == nil {
		return false
	}
	_, err := h.ca.RootPEM()
	return err == nil && !errors.Is(err, ca.ErrCANotConfigured)
}

// passthrough 是非 MITM 路径——直接把客户端流和上游连接对拷。
func (h *Handler) passthrough(client net.Conn, target string) {
	upstream, err := h.tunnel.Dial(context.Background(), "tcp", target)
	if err != nil {
		_ = client.Close()
		h.logger.Warn("connect dial failed", "target", target, "err", err)
		return
	}
	go splice(upstream, client)
	splice(client, upstream)
}

func splice(dst, src net.Conn) {
	defer dst.Close()
	defer src.Close()
	_, _ = io.Copy(dst, src)
}
