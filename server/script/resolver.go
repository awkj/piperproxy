package script

import (
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"

	"github.com/grafana/sobek"

	"github.com/awkj/piper/server/script/modules"
)

// resolver 处理 import 时的模块查找：
//   - "piper:<name>" → 内置 NativeModule
//   - "./relative.js" / "../up.js" → 沙箱内文件
//   - 其他 → 报错（禁止 npm 包 / node:* / http: URL 等）
type resolver struct {
	mu           sync.RWMutex
	builtins     map[string]sobek.ModuleRecord
	pathCache    map[string]*sobek.SourceTextModuleRecord
	reverseCache map[sobek.ModuleRecord]string // module record → 绝对路径
	sandbox      *Sandbox
}

func newResolver(sandbox *Sandbox, logger *slog.Logger) *resolver {
	return &resolver{
		builtins:     buildBuiltins(sandbox, logger),
		pathCache:    make(map[string]*sobek.SourceTextModuleRecord),
		reverseCache: make(map[sobek.ModuleRecord]string),
		sandbox:      sandbox,
	}
}

// buildBuiltins 构造 piper:* 内置模块映射。
func buildBuiltins(sandbox *Sandbox, logger *slog.Logger) map[string]sobek.ModuleRecord {
	return map[string]sobek.ModuleRecord{
		"piper:fs":     modules.NewFS(sandbox),
		"piper:http":   modules.NewHTTP(sandbox),
		"piper:crypto": modules.NewCrypto(),
		"piper:url":    modules.NewURL(),
		"piper:buffer": modules.NewBuffer(),
		"piper:log":    modules.NewLog(logger),
	}
}

// resolve 是 HostResolveImportedModuleFunc，在 ParseModule / CyclicModuleRecordEvaluate 里使用。
func (r *resolver) resolve(referencingScriptOrModule any, specifier string) (sobek.ModuleRecord, error) {
	// 内置模块
	if strings.HasPrefix(specifier, "piper:") {
		m, ok := r.builtins[specifier]
		if !ok {
			return nil, fmt.Errorf("script: unknown built-in module %q (available: piper:fs/http/crypto/url/buffer/log)", specifier)
		}
		return m, nil
	}

	// 只允许相对路径
	if !strings.HasPrefix(specifier, "./") && !strings.HasPrefix(specifier, "../") {
		return nil, fmt.Errorf("script: importing %q is not allowed; use piper:* modules or relative paths (./foo.js)", specifier)
	}

	// 计算绝对路径（相对于 referencing module 的目录）
	base := r.baseDir(referencingScriptOrModule)
	absPath := filepath.Join(base, specifier)

	return r.loadFile(absPath)
}

// loadUserScript 编译（并缓存）一个用户脚本文件，返回已 Link 的 SourceTextModuleRecord。
func (r *resolver) loadUserScript(absPath string) (*sobek.SourceTextModuleRecord, error) {
	r.mu.RLock()
	if m, ok := r.pathCache[absPath]; ok {
		r.mu.RUnlock()
		return m, nil
	}
	r.mu.RUnlock()
	return r.loadFile(absPath)
}

func (r *resolver) loadFile(absPath string) (*sobek.SourceTextModuleRecord, error) {
	r.mu.RLock()
	if m, ok := r.pathCache[absPath]; ok {
		r.mu.RUnlock()
		return m, nil
	}
	r.mu.RUnlock()

	source, err := r.sandbox.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("script: load %s: %w", absPath, err)
	}

	m, err := sobek.ParseModule(absPath, source, r.resolve)
	if err != nil {
		return nil, fmt.Errorf("script: parse %s: %w", absPath, err)
	}
	if err := m.Link(); err != nil {
		return nil, fmt.Errorf("script: link %s: %w", absPath, err)
	}

	r.mu.Lock()
	r.pathCache[absPath] = m
	r.reverseCache[m] = absPath
	r.mu.Unlock()

	return m, nil
}

// baseDir 根据 referencingScriptOrModule 返回 importer 所在目录；
// 找不到时回退到 sandbox DataDir。
func (r *resolver) baseDir(referencingScriptOrModule any) string {
	if ref, ok := referencingScriptOrModule.(sobek.ModuleRecord); ok {
		r.mu.RLock()
		path := r.reverseCache[ref]
		r.mu.RUnlock()
		if path != "" {
			return filepath.Dir(path)
		}
	}
	return r.sandbox.DataDir
}
