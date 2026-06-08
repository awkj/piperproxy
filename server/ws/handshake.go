package ws

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
)

// wsProxyHopHeaders 是转发 WS 握手时应剥除的代理专有 header。
// Connection/Upgrade 不在此列——WS 握手必须保留它们。
var wsProxyHopHeaders = []string{
	"Proxy-Authorization",
	"Proxy-Authenticate",
	"Proxy-Connection",
}

// ForwardHandshake 向上游转发 WebSocket HTTP Upgrade 握手，并将 101 响应写回客户端。
//
// 参数：
//   - r：来自客户端的 HTTP Upgrade 请求（已由 http.Server 解析）
//   - clientBuf：客户端的 bufio.ReadWriter（Hijack 所得）
//   - upstream：已建立的上游 TCP 或 TLS 连接
//
// 返回的 *bufio.Reader 是读取上游 WS 帧的起始 reader——
// 它可能含读取 101 响应时缓冲的字节，ProxyFrames 必须用它而非直接读 upstream。
func ForwardHandshake(r *http.Request, clientBuf *bufio.ReadWriter, upstream net.Conn) (*bufio.Reader, error) {
	// 克隆请求并剥去代理专有 header
	outReq := r.Clone(r.Context())
	outReq.RequestURI = "" // Request.Write 用 URL.RequestURI() 重建请求行
	for _, h := range wsProxyHopHeaders {
		outReq.Header.Del(h)
	}

	// 向上游写 HTTP/1.1 Upgrade 请求
	if err := outReq.Write(upstream); err != nil {
		return nil, fmt.Errorf("ws: write handshake request: %w", err)
	}

	// 读取上游 101 响应
	// 用 bufio 包裹，避免上游在 101 后立即发帧时数据被读走
	upBuf := bufio.NewReader(upstream)
	resp, err := http.ReadResponse(upBuf, outReq)
	if err != nil {
		return nil, fmt.Errorf("ws: read upstream response: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		return nil, fmt.Errorf("ws: upstream returned %d, expected 101 Switching Protocols", resp.StatusCode)
	}

	// 将 101 响应写回客户端（含全部握手 header，如 Sec-WebSocket-Accept）
	if err := resp.Write(clientBuf); err != nil {
		return nil, fmt.Errorf("ws: write 101 to client: %w", err)
	}
	if err := clientBuf.Flush(); err != nil {
		return nil, fmt.Errorf("ws: flush 101 to client: %w", err)
	}

	return upBuf, nil
}
