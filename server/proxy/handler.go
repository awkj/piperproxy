package proxy

import (
	"log/slog"
	"net"
	"net/http"
	"strings"

	"github.com/awkj/piper/server/api"
	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/event"
	"github.com/awkj/piper/server/rules"
	"github.com/awkj/piper/server/script"
	"github.com/awkj/piper/server/tunnel"
	"github.com/awkj/piper/server/ws"
)

// Handler 是 piper 代理的统一入口，负责分发：
//   - CONNECT  → tunnel（HTTPS / 任意 TCP）
//   - Upgrade  → ws（WebSocket 等协议升级）
//   - 其它     → 转发 HTTP 或本地 API（local.piper.test）
type Handler struct {
	logger    *slog.Logger
	ca        ca.Authority
	rules     rules.Engine
	scripts   script.Manager
	api       api.Handler
	tunnel    tunnel.Dialer
	wsHook    ws.Hook
	capture   api.Capturer  // 抓包存储；nil = 不抓
	emitter   event.Emitter // EventEmitter SPI；不会为 nil，由 proxy.New 兜底成 event.Noop。
	transport *http.Transport
	configDir   string // plugin://<name> → <configDir>/scripts/<name>.js
	rulesDir    string // plugin://(./rel.js) 相对路径基准目录
	proxyAuth   string // base64(user:pass)；空 = 不启用代理认证
	autoSaveDir string // 全局 autosave 目录；空 = 不启用
	listenPort  string // piper 自己的监听端口；isLocalAPI 用它区分 webui 请求 vs 转发到 127.0.0.1 上游
	bypass      *BypassStore      // bypass 规则存储；nil = 不启用
	pinning     *PinningDetector  // SSL Pinning 检测器；nil = 不启用
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.proxyAuth != "" {
		scheme, creds, found := strings.Cut(r.Header.Get("Proxy-Authorization"), " ")
		if !found || !strings.EqualFold(scheme, "Basic") || creds != h.proxyAuth {
			w.Header().Set("Proxy-Authenticate", `Basic realm="piper"`)
			w.Header().Set("Content-Length", "0")
			w.WriteHeader(http.StatusProxyAuthRequired)
			return
		}
	}

	switch {
	case r.Method == http.MethodConnect:
		h.handleConnect(w, r)
	case isWebSocketUpgrade(r):
		h.handleUpgrade(w, r)
	case h.isLocalAPI(r):
		h.api.ServeHTTP(w, r)
	default:
		h.handleForward(w, r)
	}
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Connection"), "upgrade") &&
		strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

// isLocalAPI 判断请求是否打向内置 UI 后端。
// 命中条件：
//   - Host 是 local.piper.test（原版 whistle 约定，端口任意）
//   - Host 是 127.0.0.1 / ::1 / localhost 且端口 == piper 的监听端口
//     （这样既支持浏览器直接 http://127.0.0.1:<port> 访问 webui，
//      也支持 Vite dev server changeOrigin 转发；
//      但走 piper 代理访问 127.0.0.1:<其它端口> 的上游服务仍然正常 forward。）
//
// 不命中即视为代理请求走 handleForward。
func (h *Handler) isLocalAPI(r *http.Request) bool {
	host, port := splitHostPort(r.Host)
	if host == "local.piper.test" {
		return true
	}
	switch host {
	case "127.0.0.1", "::1", "localhost":
		// 没明确端口时（rare：HTTP/1.0 / 显式 80）视作 webui，否则必须匹配监听端口
		return port == "" || port == h.listenPort
	}
	return false
}

// splitHostPort 容错版 net.SplitHostPort：缺端口返回 port=""，IPv6 字面量去掉中括号。
func splitHostPort(hostPort string) (host, port string) {
	if hostPort == "" {
		return "", ""
	}
	if h, p, err := net.SplitHostPort(hostPort); err == nil {
		return strings.TrimPrefix(strings.TrimSuffix(h, "]"), "["), p
	}
	return hostPort, ""
}
