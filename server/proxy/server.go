// Package proxy 是 piper 代理核心的入口包。
//
// 设计原则（GO-1）：
//   - HTTP 服务器走标准库 net/http（决策 D1，chi 仅 server/api/ 用）。
//   - Server 只负责生命周期管理，请求处理委托给 Handler。
//   - 子组件（ca / rules / script / api）以接口形式注入，便于后续阶段独立实现。
package proxy

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/awkj/piper/server/api"
	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/event"
	"github.com/awkj/piper/server/rules"
	"github.com/awkj/piper/server/script"
	"github.com/awkj/piper/server/tunnel"
	"github.com/awkj/piper/server/ws"
)

// Config 是 Server 的构造参数。零值的可选字段会在 New 里替换成各自的 Nop 实现。
type Config struct {
	Addr   string
	Logger *slog.Logger

	// ConfigDir 是配置目录（bypass.json / scripts/），用于 plugin://<name> 路径拼接。
	ConfigDir string
	// DataDir 是数据目录（certs / piper.db / mcp-handshake.json）。当前 proxy 内部
	// 暂未直接使用，留作未来扩展（脚本沙箱 / capture 文件等）。
	DataDir string
	// RulesDir 是规则文件所在目录，用于 plugin://(./rel.js) 相对路径解析。
	RulesDir string
	// ProxyAuth 是代理认证凭证，格式 "user:pass"；空字符串表示不启用认证。
	// 启用后所有请求必须携带 Proxy-Authorization: Basic <base64(user:pass)>，否则返回 407。
	ProxyAuth string
	// AutoSaveDir 是全局 autosave 目录；非空时所有转发请求都会异步写 JSON。
	// 优先级低于规则级别的 autosave://(/path) operator。
	AutoSaveDir string
	// Capture 接收代理流量的抓包数据；nil 时不抓。
	Capture api.Capturer
	// Bypass 是 SSL Pinning / bypass 规则存储；nil 时由 New 用 ConfigDir 初始化。
	Bypass *BypassStore
	// Pinning 是 SSL Pinning 检测器；nil 时由 New 创建。
	Pinning *PinningDetector

	// 可选依赖；nil 时由 New 注入 Nop 实现，保证 GO-1 单文件即可起服。
	CA      ca.Authority
	Rules   rules.Engine
	Scripts script.Manager
	API     api.Handler
	Tunnel  tunnel.Dialer
	WSHook  ws.Hook
	// Emitter 是 ECOSYSTEM-PLAN.md §4.2 的 EventEmitter SPI；nil → event.Noop{}。
	Emitter event.Emitter
}

// Server 封装一个 *http.Server + 它的所有协作者。
type Server struct {
	cfg     Config
	http    *http.Server
	handler *Handler
}

// New 用 cfg 构造一个未启动的 Server。
func New(cfg Config) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.CA == nil {
		cfg.CA = ca.Nop{}
	}
	if cfg.Rules == nil {
		cfg.Rules = rules.Nop{}
	}
	if cfg.Scripts == nil {
		cfg.Scripts = script.Nop{}
	}
	if cfg.API == nil {
		cfg.API = api.NotImplemented{}
	}
	if cfg.Tunnel == nil {
		cfg.Tunnel = tunnel.Direct{}
	}
	if cfg.WSHook == nil {
		cfg.WSHook = ws.NopHook{}
	}
	if cfg.Emitter == nil {
		cfg.Emitter = event.Noop{}
	}

	proxyAuth := ""
	if cfg.ProxyAuth != "" {
		proxyAuth = base64.StdEncoding.EncodeToString([]byte(cfg.ProxyAuth))
	}

	_, listenPort := splitHostPort(cfg.Addr)

	bypass := cfg.Bypass
	if bypass == nil && cfg.ConfigDir != "" {
		bypass = NewBypassStore(cfg.ConfigDir)
	}
	pinning := cfg.Pinning
	if pinning == nil {
		pinning = NewPinningDetector()
	}

	h := &Handler{
		logger:      cfg.Logger,
		ca:          cfg.CA,
		rules:       cfg.Rules,
		scripts:     cfg.Scripts,
		api:         cfg.API,
		tunnel:      cfg.Tunnel,
		wsHook:      cfg.WSHook,
		capture:     cfg.Capture,
		emitter:     cfg.Emitter,
		configDir:   cfg.ConfigDir,
		rulesDir:    cfg.RulesDir,
		proxyAuth:   proxyAuth,
		autoSaveDir: cfg.AutoSaveDir,
		listenPort:  listenPort,
		bypass:      bypass,
		pinning:     pinning,
		transport: &http.Transport{
			Proxy: nil,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:          100,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			ForceAttemptHTTP2:     true,
		},
	}

	return &Server{
		cfg:     cfg,
		handler: h,
		http: &http.Server{
			Addr:              cfg.Addr,
			Handler:           h,
			ReadHeaderTimeout: 30 * time.Second,
			// 不设 WriteTimeout：代理需要支持长流（SSE、下载、WebSocket）。
		},
	}
}

// Start 阻塞监听直到 server 退出。
func (s *Server) Start() error {
	err := s.http.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// Stop 优雅关闭，等待 in-flight 请求结束或 ctx 超时。
func (s *Server) Stop(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}
