// Package api — router.go：GO-5 UI HTTP API handler 实现。
//
// 决策 D1：路由用 go-chi/chi/v5，底层 net/http。
// Track A（API-MODERNIZATION-PLAN.md）：/cgi-bin/ 全部替换为 /api/ + RESTful 动词。
// 未实现的端点返回 501 Not Implemented。
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/store"
)

const (
	piperVersion = "go-0.1.0"
	piperName    = "piper"
)

// Option 是 NewRouter 的可选配置函数。
type Option func(*Router)

// WithCA 注入 CA 管理器，用于 /api/certs/* 端点的自定义证书 CRUD。
func WithCA(auth ca.Authority) Option {
	return func(r *Router) { r.ca = auth }
}

// WithStore 注入 SQLite 存储层，用于规则组 / Values 持久化。
func WithStore(db *store.DB) Option {
	return func(r *Router) { r.db = db }
}

// WithListenAddr 注入代理监听地址（host:port 形式），供 /api/network/interfaces 回显。
// 不传时端点会回退到 ":8899" 占位。
func WithListenAddr(addr string) Option {
	return func(r *Router) { r.listenAddr = addr }
}

// WithMCPToken 注入 MCP Bearer token，用于 /api/mcp/* 端点鉴权。
// 空字符串表示不启用（仅本地开发用）。
func WithMCPToken(token string) Option {
	return func(r *Router) { r.mcpToken = token }
}

// WithBypass 注入 bypass 规则管理器，用于 /api/bypass/* 端点。
func WithBypass(bm BypassManager) Option {
	return func(r *Router) { r.bypass = bm }
}

// WithPinning 注入 SSL Pinning 检测器，用于 /api/bypass/pinned 端点。
func WithPinning(pm PinningManager) Option {
	return func(r *Router) { r.pinning = pm }
}

// WithIdentity 注入"本进程归属用户"标识，piper-cloud 编排时用 /piper-cgi/identify
// 反查 user_id。空字符串表示未配置（identify 端点回 ""）。
// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3。
func WithIdentity(id string) Option {
	return func(r *Router) { r.identity = id }
}

// Reloader 是一次"重新加载远端配置"的动作；通常由 main.go 闭包封装
// fetchRemoteConfig + rules.Swappable.Swap。返回 error 时 reload endpoint 回 500。
type Reloader func() error

// WithReload 注入热重载回调，启用 POST /piper-cgi/reload-config。
// 不注入时该端点回 501 Not Implemented（单机模式 piper 没有远端配置可拉）。
// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3 + piper-cloud P6.2。
func WithReload(fn Reloader) Option {
	return func(r *Router) { r.reload = fn }
}

// Router 是 Web 控制台 HTTP 服务的具体实现，导出便于 main.go 取出 WSHook 注入到 proxy.Config.WSHook。
type Router struct {
	capture    *CaptureStore
	wsHook     *WSHook
	ca         ca.Authority
	db         *store.DB      // 持久化层；nil = 不启用（退化为 mock）
	listenAddr string         // 代理 host:port，仅用于 /api/network/interfaces 回显
	mcpToken   string         // MCP Bearer token；空 = 不校验（仅开发用）
	bypass     BypassManager  // bypass 规则管理；nil = 不可用
	pinning    PinningManager // SSL Pinning 检测；nil = 不可用
	identity   string         // /piper-cgi/identify 回值；空 = 未配置
	reload     Reloader       // /piper-cgi/reload-config 触发回调；nil = 501
	mux        chi.Router
}

// NewRouter 返回已注册全部 /api/ 端点的 *Router；它实现 Handler，可直接注入 proxy.Config.API。
// uiAuth 格式为 "user:pass"；空字符串表示不启用 UI 认证。
func NewRouter(uiAuth string, opts ...Option) *Router {
	r := &Router{
		capture: NewCaptureStore(1000),
		wsHook:  NewWSHook(64, 1024),
		ca:      ca.Nop{},
	}
	for _, opt := range opts {
		opt(r)
	}
	r.mux = r.build(uiAuth)
	return r
}

// WSHook 返回 router 内置的 ws.Hook 工厂，main.go 应把它注入 proxy.Config.WSHook。
func (r *Router) WSHook() *WSHook { return r.wsHook }

// CaptureStore 返回内置的抓包存储，main.go 应把它注入 proxy.Config.Capture。
func (r *Router) CaptureStore() *CaptureStore { return r.capture }

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mux.ServeHTTP(w, req)
}

// --------------------------------------------------------------------------
// 路由注册
// --------------------------------------------------------------------------

func (r *Router) build(uiAuth string) chi.Router {
	mux := chi.NewRouter()
	mux.Use(middleware.Recoverer)
	mux.Use(middleware.RealIP)

	if uiAuth != "" {
		user, pass, _ := strings.Cut(uiAuth, ":")
		mux.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				// /piper-cgi/* 是 piper-cloud 编排接口（healthz/identify），不受 uiAuth 保护。
				// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3。
				if strings.HasPrefix(req.URL.Path, "/piper-cgi/") {
					next.ServeHTTP(w, req)
					return
				}
				u, p, ok := req.BasicAuth()
				if !ok || u != user || p != pass {
					w.Header().Set("WWW-Authenticate", `Basic realm="piper ui"`)
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				next.ServeHTTP(w, req)
			})
		})
	}

	// 编排端点（不受 uiAuth 保护，见上面 middleware 内的前缀短路）。
	// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3。
	mux.Get("/piper-cgi/healthz", r.handleHealthz)
	mux.Get("/piper-cgi/identify", r.handleIdentify)
	mux.Post("/piper-cgi/reload-config", r.handleReloadConfig)

	// 静态资源 / SPA fallback（GO-9 接管）
	mux.Get("/", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><body><h1>piper (Go " + piperVersion + ")</h1></body></html>"))
	})

	mux.Route("/api", func(m chi.Router) {
		// 核心
		m.Get("/init", r.handleInit)
		m.Get("/status", r.handleStatus)
		m.Get("/version", r.handleVersion)
		m.Get("/logs", r.handleLogs)
		m.Post("/composer", r.handleComposer)

		// HTTPS 控制
		m.Route("/https", func(m chi.Router) {
			m.Get("/status", r.handleHTTPSStatus)
			m.Put("/intercept", notImplemented)
			m.Put("/http2", notImplemented)
		})

		// 证书
		m.Route("/certs", func(m chi.Router) {
			m.Get("/root.pem", r.handleCertsRootPEM)
			m.Get("/", r.handleCertsList)
			m.Post("/", r.handleCertsAdd)
			m.Delete("/{hostname}", r.handleCertsRemove)
			m.Put("/{filename}", notImplemented)
		})

		// Trust Wizard（CA 信任引导）
		m.Route("/ca", func(m chi.Router) {
			m.Get("/info", r.handleCAInfo)
			m.Post("/install", r.handleCAInstall)
			m.Post("/rotate", r.handleCARotate)
			m.Post("/reset", r.handleCAReset)
		})

		// 抓包（Track B/C/D）
		m.Route("/captures", func(m chi.Router) {
			m.Get("/stream", r.handleCaptureStream)
			m.Post("/batch", r.handleCaptureBatch)
			m.Delete("/", r.handleClearCaptures)
			m.Get("/export.har", r.handleExportHAR)         // Track C
			m.Get("/{id}", r.handleGetCapture)              // Track D：单条（含 body）
			m.Get("/{id}/frames", r.handleGetFramesByID)
			m.Get("/{id}/req/body", r.handleGetReqBody)     // Track D
			m.Get("/{id}/res/body", r.handleGetResBody)     // Track D
			m.Post("/{id}/highlight", r.handleSetHighlight) // P0
			m.Post("/{id}/comment", r.handleSetComment)     // P0
			m.Get("/{id}/curl", r.handleGetCaptureCurl)     // P1：Code Generator (curl)
			m.Post("/replay", r.handleReplay)               // P1：Edit & Repeat
		})

		// WebSocket 会话列表
		m.Get("/ws/sessions", r.handleWSSessionList)

		// 网卡列表（用于「系统代理」面板展示本机 LAN IP）
		m.Get("/network/interfaces", r.handleNetworkInterfaces)

		// 规则（rules_handlers.go）
		m.Route("/rules", func(m chi.Router) {
			m.Get("/", r.handleRulesList)
			m.Post("/", r.handleRulesAdd)
			m.Get("/enabled", r.handleRulesEnabled)
			m.Put("/settings", r.handleRulesSettings)
			m.Post("/import", r.handleRulesImport)
			m.Get("/export", r.handleRulesExport)
			m.Delete("/{name}", r.handleRulesRemove)
			m.Put("/{name}", r.handleRulesUpdate)
			m.Put("/{name}/enable", r.handleRulesEnable)
			m.Put("/{name}/disable", r.handleRulesDisable)
		})

		// 插件（P2，暂 notImplemented）
		m.Route("/plugins", func(m chi.Router) {
			m.Get("/", notImplemented)
			m.Post("/", notImplemented)
			m.Put("/settings", notImplemented)
			m.Route("/registries", func(m chi.Router) {
				m.Get("/", notImplemented)
				m.Post("/", notImplemented)
			})
			m.Put("/{name}", notImplemented)
			m.Delete("/{name}", notImplemented)
		})

		// Values（values_handlers.go）
		m.Route("/values", func(m chi.Router) {
			m.Get("/", r.handleValuesList)
			m.Post("/", r.handleValuesAdd)
			m.Post("/import", r.handleValuesImport)
			m.Get("/export", r.handleValuesExport)
			m.Route("/recycle", func(m chi.Router) {
				m.Get("/", r.handleValuesRecycleList)
				m.Get("/{name}", r.handleValuesRecycleView)
				m.Delete("/{name}", r.handleValuesRecycleRemove)
			})
			m.Delete("/{name}", r.handleValuesRemove)
			m.Put("/{name}", r.handleValuesRename)
		})

		// Developer Setup Hub
		m.Route("/setup", func(m chi.Router) {
			m.Get("/targets", r.handleSetupList)
			m.Get("/snippet", r.handleSetupSnippet)
			m.Post("/test", r.handleSetupTest)
			m.Get("/diagnose", r.handleSetupDiagnose)
		})

		// Bypass Proxy / SSL Pinning
		m.Route("/bypass", func(m chi.Router) {
			m.Get("/", r.handleBypassList)
			m.Post("/", r.handleBypassAdd)
			m.Delete("/{pattern}", r.handleBypassRemove)
			m.Put("/{pattern}/enable", r.handleBypassSetEnabled)
			m.Post("/presets/{name}/enable", r.handleBypassEnablePreset)
			m.Post("/presets/{name}/disable", r.handleBypassDisablePreset)
			m.Get("/pinned", r.handleBypassPinnedList)
		})

		// 弱网模拟
		m.Get("/throttle", r.handleThrottleGet)
		m.Put("/throttle", r.handleThrottleSet)

		// MCP 专用端点（Bearer token 鉴权）
		m.Route("/mcp", func(m chi.Router) {
			if r.mcpToken != "" {
				m.Use(r.mcpBearerAuth)
			}
			m.Get("/flows", r.handleMCPListFlows)
			m.Post("/recording/toggle", r.handleMCPToggleRecording)
		})
	})

	return mux
}

// --------------------------------------------------------------------------
// 响应工具
// --------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "json encode error", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorResponse{Error: msg})
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotImplemented, "not implemented")
}

// --------------------------------------------------------------------------
// mock 数据桩
// --------------------------------------------------------------------------

func mockRulesList() RulesListResponse {
	return RulesListResponse{
		EnabledCount:           0,
		DefaultRulesIsDisabled: false,
		DefaultRules:           "",
		AllowMultipleChoice:    false,
		BackRulesFirst:         false,
		List:                   []any{},
	}
}

// --------------------------------------------------------------------------
// 端点实现
// --------------------------------------------------------------------------

// GET /api/init — 前端启动时拉取的初始化数据包。
func (r *Router) handleInit(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, InitResponse{
		WName:                  piperName,
		Version:                piperVersion,
		ClientID:               "go-client",
		ClientIP:               req.RemoteAddr,
		LastDataID:             r.capture.LastSeq(),
		LastSvrLogID:           0,
		InterceptHTTPSConnects: false,
		EnableHTTP2:            false,
		ProxyAddr:              r.listenAddr,
		Server: ServerInfo{
			Hostname: req.Host,
			Go:       runtime.Version(),
			Platform: runtime.GOOS + "/" + runtime.GOARCH,
		},
		Rules:           mockRulesList(),
		Values:          ValuesResponse{List: []any{}},
		Plugins:         map[string]any{},
		DisabledPlugins: map[string]any{},
	})
}

// GET /api/status — 简单状态探针。
func (r *Router) handleStatus(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, StatusResponse{
		Storage:   "",
		PiperName: piperName,
		Name:      piperName,
		Version:   piperVersion,
		Uptime:    time.Since(startTime).Seconds(),
	})
}

// GET /piper-cgi/healthz — 编排器探活（ECOSYSTEM-PLAN.md §4 T-piper-3）。
// 故意走简单 JSON，不复用 StatusResponse，避免和 UI 端 schema 耦合。
func (r *Router) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"ok":         true,
		"version":    piperVersion,
		"uptime_sec": int(time.Since(startTime).Seconds()),
		"proxy_addr": r.listenAddr,
	})
}

// GET /piper-cgi/identify — 编排器查"这个 piper 实例归属哪个 user"。
// identity 由 main.go 通过 WithIdentity 注入，未配置时回空字符串。
func (r *Router) handleIdentify(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"identity": r.identity,
	})
}

// POST /piper-cgi/reload-config — 编排器通知本实例重新拉远端配置 + 热重载规则。
// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3 + piper-cloud TASKS.md P6.2。
//
// 行为：
//   - 未注入 WithReload（单机模式）→ 501 Not Implemented
//   - reload 函数报错 → 500，body 是 {"error": "..."}（便于排查 cloud 端日志）
//   - 成功 → 204 No Content
//
// 这是一个推送端点，piper-cloud 端是 fire-and-forget；本端不要做长任务。
// 当前实现里 reload 走 5 秒 HTTP fetch，理论上够快；如果以后 reload 变重需要考虑异步。
func (r *Router) handleReloadConfig(w http.ResponseWriter, _ *http.Request) {
	if r.reload == nil {
		writeError(w, http.StatusNotImplemented, "reload not configured (this piper has no --config-url)")
		return
	}
	if err := r.reload(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/version — 版本检查（mock）。
func (r *Router) handleVersion(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"version":       piperVersion,
		"showUpdate":    false,
		"hasNewVersion": false,
	})
}

// GET /api/logs — 控制台日志（stub）。
func (r *Router) handleLogs(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, map[string]any{
		"log":      []any{},
		"curLogId": 0,
	})
}

// POST /api/composer — Composer 请求代发（stub）。
func (r *Router) handleComposer(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotImplemented, "composer not implemented")
}

// GET /api/https/status — HTTPS 拦截（MITM）开关状态。GO-2 实现前固定返回 false。
func (r *Router) handleHTTPSStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, HTTPSStatusResponse{
		EnableCapture: false,
		EnableHTTP2:   false,
	})
}

// GET /api/rules/enabled — 已启用规则（mock）。
func (r *Router) handleRulesEnabled(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, RulesEnabledResponse{MFlag: "", List: []any{}})
}

// GET /api/network/interfaces — 列出本机可用作代理客户端连接的 IPv4 地址。
// 始终包含 127.0.0.1，再追加 net.Interfaces() 中所有 up + 非 loopback 的 IPv4。
// proxyHost/proxyPort 取自 listenAddr，前端用 proxyPort 拼实际代理端口（不要拿 window.location.port，
// 因为 dev 模式下那是 Vite 端口 5173）。
func (r *Router) handleNetworkInterfaces(w http.ResponseWriter, _ *http.Request) {
	host, port := splitListenAddr(r.listenAddr)

	out := NetworkInterfacesResponse{
		ProxyHost: host,
		ProxyPort: port,
		Interfaces: []NetworkInterface{
			{Name: "loopback", IP: "127.0.0.1", Kind: "loopback"},
		},
	}

	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, a := range addrs {
				var ip net.IP
				switch v := a.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				ip4 := ip.To4()
				if ip4 == nil || ip4.IsLinkLocalUnicast() {
					continue
				}
				out.Interfaces = append(out.Interfaces, NetworkInterface{
					Name: iface.Name,
					IP:   ip4.String(),
					Kind: "lan",
				})
			}
		}
	}

	writeJSON(w, out)
}

// splitListenAddr 把 "host:port" / ":port" 拆成 host + 端口。
// 空 host 视作 "0.0.0.0"（全网卡）；端口解析失败时回退到 8899。
func splitListenAddr(addr string) (string, int) {
	if addr == "" {
		return "0.0.0.0", 8899
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return "0.0.0.0", 8899
	}
	if host == "" {
		host = "0.0.0.0"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 8899
	}
	return host, port
}

// GET /api/ws/sessions — 列出全部 WebSocket 会话概要。
func (r *Router) handleWSSessionList(w http.ResponseWriter, _ *http.Request) {
	out := make([]any, 0)
	for _, s := range r.wsHook.Sessions() {
		out = append(out, map[string]any{
			"id":        s.ID,
			"url":       s.URL,
			"startTime": s.StartTime,
			"endTime":   s.EndTime,
			"count":     len(s.Frames),
			"truncated": s.Truncated,
		})
	}
	writeJSON(w, map[string]any{"sessions": out})
}

// --------------------------------------------------------------------------
// MCP 专用中间件 + 端点
// --------------------------------------------------------------------------

// mcpBearerAuth 校验 Authorization: Bearer <token>。
func (r *Router) mcpBearerAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		auth := req.Header.Get("Authorization")
		prefix := "Bearer "
		if !strings.HasPrefix(auth, prefix) || auth[len(prefix):] != r.mcpToken {
			writeError(w, http.StatusUnauthorized, "invalid or missing Bearer token")
			return
		}
		next.ServeHTTP(w, req)
	})
}

// GET /api/mcp/flows — 供 `piper mcp` 子命令调用，列出抓包列表并支持过滤。
func (r *Router) handleMCPListFlows(w http.ResponseWriter, req *http.Request) {
	q := req.URL.Query()
	limit := 50
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	host := q.Get("host")
	method := q.Get("method")
	status := q.Get("status")

	all := r.capture.List(limit)
	type flowSummary struct {
		ID       string `json:"id"`
		Method   string `json:"method"`
		URL      string `json:"url"`
		Status   int    `json:"status"`
		Duration int64  `json:"duration_ms"`
		Host     string `json:"host"`
	}
	result := make([]flowSummary, 0, len(all.IDs))
	for _, id := range all.IDs {
		item := all.Data[id]
		if item == nil {
			continue
		}
		if host != "" {
			matched, _ := filepath.Match(strings.ToLower(host), strings.ToLower(item.Hostname))
			if !matched {
				continue
			}
		}
		if method != "" && !strings.EqualFold(item.Method, method) {
			continue
		}
		if status != "" && item.Res.StatusCode > 0 && !matchStatus(status, item.Res.StatusCode) {
			continue
		}
		dur := int64(0)
		if item.EndTime > 0 && item.StartTime > 0 {
			dur = item.EndTime - item.StartTime
		}
		result = append(result, flowSummary{
			ID:       item.ID,
			Method:   item.Method,
			URL:      item.URL,
			Status:   item.Res.StatusCode,
			Duration: dur,
			Host:     item.Hostname,
		})
	}
	writeJSON(w, map[string]any{"flows": result, "total": len(result)})
}

// POST /api/mcp/recording/toggle — 录制开关切换（stub：目前录制默认开启，无独立开关）。
func (r *Router) handleMCPToggleRecording(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"recording": true,
		"message":   "录制开关切换成功（当前版本录制默认开启）",
	})
}

// POST /api/captures/{id}/highlight — 设置/清除单条抓包的高亮标志。
// body: {"value": true/false}  省略 value 字段时视为 toggle。
func (r *Router) handleSetHighlight(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	var body struct {
		Value *bool `json:"value"`
	}
	_ = json.NewDecoder(req.Body).Decode(&body)

	item := r.capture.GetByID(id)
	if item == nil {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	newVal := !item.Highlighted
	if body.Value != nil {
		newVal = *body.Value
	}
	r.capture.SetHighlight(id, newVal)
	writeJSON(w, map[string]any{"id": id, "highlighted": newVal})
}

// POST /api/captures/{id}/comment — 设置/清空单条抓包的备注。
// body: {"value": "注释文本"}  空字符串表示清除。
func (r *Router) handleSetComment(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	var body struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if !r.capture.SetComment(id, body.Value) {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	writeJSON(w, map[string]any{"id": id, "comment": body.Value})
}

// --------------------------------------------------------------------------
// 内部工具
// --------------------------------------------------------------------------

var startTime = time.Now()

// --------------------------------------------------------------------------
// Edit & Repeat — replay endpoint
// --------------------------------------------------------------------------

// ReplayRequest 是 POST /api/captures/replay 的请求体。
type ReplayRequest struct {
	// 原始 flow ID（可选，用于回溯 metadata）
	OriginalID string `json:"originalId,omitempty"`
	// 以下字段描述要重新发送的请求规格
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	// replay 轮次（前端可用来标记"第几次 edit & repeat"）
	Iteration int `json:"iteration,omitempty"`
}

// POST /api/captures/replay — 以 piper 自身名义重放一个请求，结果写入 capture 流。
func (r *Router) handleReplay(w http.ResponseWriter, req *http.Request) {
	var body ReplayRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.Method == "" || body.URL == "" {
		writeError(w, http.StatusBadRequest, "method and url are required")
		return
	}

	go func() {
		ctx := req.Context()
		var bodyR io.Reader
		if body.Body != "" {
			bodyR = strings.NewReader(body.Body)
		}
		httpReq, err := http.NewRequestWithContext(ctx, body.Method, body.URL, bodyR)
		if err != nil {
			return
		}
		if bodyR != nil {
			httpReq.ContentLength = int64(len(body.Body))
		}
		for k, v := range body.Headers {
			httpReq.Header.Set(k, v)
		}

		start := time.Now()
		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(httpReq)
		end := time.Now()

		if err != nil {
			if r.capture != nil {
				item := &CaptureItem{
					ID:        fmt.Sprintf("replay-%d", time.Now().UnixNano()),
					URL:       body.URL,
					Method:    body.Method,
					StartTime: start.UnixMilli(),
					EndTime:   end.UnixMilli(),
					ResError:  true,
					Req: CaptureReq{
						Method:  body.Method,
						Headers: body.Headers,
						Body:    body.Body,
					},
				}
				if body.OriginalID != "" {
					item.AppName = "replay:" + body.OriginalID
				}
				r.capture.Add(item)
			}
			return
		}
		defer resp.Body.Close()

		const limit = 1 << 20
		resBytes, _ := io.ReadAll(io.LimitReader(resp.Body, limit))
		resHeaders := make(map[string]string, len(resp.Header))
		for k, vs := range resp.Header {
			resHeaders[k] = strings.Join(vs, ", ")
		}

		if r.capture != nil {
			item := &CaptureItem{
				ID:        fmt.Sprintf("replay-%d", time.Now().UnixNano()),
				URL:       body.URL,
				Method:    body.Method,
				StartTime: start.UnixMilli(),
				EndTime:   end.UnixMilli(),
				Req: CaptureReq{
					Method:  body.Method,
					Headers: body.Headers,
					Body:    body.Body,
					Size:    len(body.Body),
				},
				Res: CaptureRes{
					StatusCode:    resp.StatusCode,
					StatusMessage: resp.Status,
					Headers:       resHeaders,
					Body:          string(resBytes),
					Size:          len(resBytes),
				},
			}
			if body.OriginalID != "" {
				item.AppName = "replay:" + body.OriginalID
			}
			r.capture.Add(item)
		}
	}()

	writeJSON(w, map[string]any{"queued": true})
}
