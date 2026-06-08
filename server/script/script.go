// Package script 是 piper 脚本扩展点（决策 D3：嵌入 Sobek ESM 引擎，GO-6 落地）。
//
// 规则文件中 `plugin.<name>://` operator 命中时，proxy 层把脚本路径写入 context，
// 然后调用 Manager.Resolve 获取 http.Handler。脚本以 ESM 写法
// (export onRequest/onResponse / export default fn) 通过 piper:* 内置模块
// 访问宿主能力（fs / http / crypto / url / buffer / log）。
package script

import (
	"context"
	"log/slog"
	"net/http"
)

// Manager 决定一个请求是否要交给某个脚本处理。
type Manager interface {
	// Resolve 返回能处理 r 的脚本 Handler；nil 表示无脚本接管（走正常 forward）。
	// 脚本路径由调用方通过 WithScriptPath 写入 ctx。
	Resolve(ctx context.Context, r *http.Request) http.Handler
}

// --- 上下文 key ---

type scriptPathKey struct{}

// WithScriptPath 把脚本文件绝对路径写入 context，供 Manager.Resolve 读取。
// proxy 层在命中 plugin 规则后调用此函数，再把 ctx 传给 Resolve。
func WithScriptPath(ctx context.Context, absPath string) context.Context {
	return context.WithValue(ctx, scriptPathKey{}, absPath)
}

func scriptPathFrom(ctx context.Context) string {
	v, _ := ctx.Value(scriptPathKey{}).(string)
	return v
}

// --- Nop 实现 ---

// Nop 永远返回 nil——表示无脚本可用（GO-1 占位）。
type Nop struct{}

func (Nop) Resolve(context.Context, *http.Request) http.Handler { return nil }

// --- 真实实现 ---

// RealManager 是 GO-6 落地的 Manager 实现。
// 每次 Resolve 从 context 中取脚本路径，加载（含缓存）并返回 scriptHandler。
type RealManager struct {
	e      *engine
	logger *slog.Logger
}

// NewManager 构造 RealManager。
//   - configDir：脚本文件所在目录（configDir/scripts/*.js），同时作为沙箱默认 base
//   - dataDir：脚本可读写的数据目录（白名单内）
//   - logger：脚本内 piper:log 输出
func NewManager(configDir, dataDir string, logger *slog.Logger) *RealManager {
	if logger == nil {
		logger = slog.Default()
	}
	sb := NewSandbox(configDir)
	if dataDir != "" && dataDir != configDir {
		sb.AllowDir(dataDir)
	}
	return &RealManager{
		e:      newEngine(sb, logger),
		logger: logger,
	}
}

// Resolve 实现 Manager 接口。
// ctx 必须包含 WithScriptPath 写入的脚本路径，否则返回 nil。
func (m *RealManager) Resolve(ctx context.Context, _ *http.Request) http.Handler {
	path := scriptPathFrom(ctx)
	if path == "" {
		return nil
	}

	module, err := m.e.resolver.loadUserScript(path)
	if err != nil {
		m.logger.Error("script: load failed", "path", path, "err", err)
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "script load error: "+err.Error(), http.StatusInternalServerError)
		})
	}

	return &scriptHandler{
		module:  module,
		e:       m.e,
		timeout: m.e.sandbox.ExecTimeout,
	}
}
