package proxy

import (
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

// handleMITM 在 clientConn 上做 TLS server 握手（用 h.ca 签发的 SNI 证书），
// 然后在解密后的明文流上跑一个临时 http.Server，把每个请求按 https://target 转发到上游。
//
// target 形如 "example.com:443"——CONNECT 请求的目标，在 h.handleConnect 里已剥过空。
func (h *Handler) handleMITM(clientConn net.Conn, target string) {
	defer clientConn.Close()

	targetHost := target
	if host, _, err := net.SplitHostPort(target); err == nil {
		targetHost = host
	}

	tlsConf := &tls.Config{
		MinVersion: tls.VersionTLS12,
		GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
			sni := hello.ServerName
			if sni == "" {
				sni = targetHost
			}
			return h.ca.CertFor(hello.Context(), sni)
		},
		// NextProtos 让客户端能 ALPN 协商 h2，但下游能否 h2 取决于 transport。
		// GO-1 的 http.Transport 已开 ForceAttemptHTTP2，让上游先尝试 h2。
		NextProtos: []string{"h2", "http/1.1"},
	}

	tlsConn := tls.Server(clientConn, tlsConf)
	if err := tlsConn.Handshake(); err != nil {
		h.logger.Debug("mitm tls handshake failed", "target", target, "err", err)
		// 通知 PinningDetector 记录失败
		if h.pinning != nil {
			if newDetected := h.pinning.RecordFailure(targetHost); newDetected {
				h.logger.Info("ssl pinning detected", "host", targetHost,
					"hint", "use bypass API to add this host to bypass list")
			}
		}
		return
	}

	ln := newSingleConnListener(tlsConn)
	defer ln.Close()

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.URL.Scheme = "https"
			r.URL.Host = target
			if isWebSocketUpgrade(r) {
				h.handleUpgrade(w, r)
			} else {
				h.handleForward(w, r)
			}
		}),
		ReadHeaderTimeout: 30 * time.Second,
	}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) && !errors.Is(err, io.EOF) {
		h.logger.Debug("mitm serve ended", "target", target, "err", err)
	}
}

// singleConnListener 把一个已建好的 net.Conn 包装成 net.Listener，让 http.Server.Serve 跑一次后就结束。
type singleConnListener struct {
	conn   net.Conn
	once   sync.Once
	closed chan struct{}
}

func newSingleConnListener(c net.Conn) *singleConnListener {
	return &singleConnListener{conn: c, closed: make(chan struct{})}
}

func (l *singleConnListener) Accept() (net.Conn, error) {
	var c net.Conn
	l.once.Do(func() { c = l.conn })
	if c != nil {
		return c, nil
	}
	<-l.closed
	return nil, io.EOF
}

func (l *singleConnListener) Close() error {
	select {
	case <-l.closed:
	default:
		close(l.closed)
	}
	return nil
}

func (l *singleConnListener) Addr() net.Addr { return l.conn.LocalAddr() }
