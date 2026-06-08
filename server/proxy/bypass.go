package proxy

import (
	"encoding/json"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/awkj/piper/server/api"
)

// bypassFile 是 configDir/bypass.json 的持久化结构。
type bypassFile struct {
	Rules          []api.BypassRuleItem `json:"rules"`
	PresetsEnabled []string             `json:"presets_enabled"`
}

// BypassStore 管理 bypass 规则列表和预设，线程安全。
// 实现 api.BypassManager 接口。
type BypassStore struct {
	mu       sync.RWMutex
	rules    []api.BypassRuleItem
	presets  map[string]bool
	filePath string
}

// NewBypassStore 从 configDir/bypass.json 加载（不存在则初始化默认预设）。
func NewBypassStore(configDir string) *BypassStore {
	bs := &BypassStore{
		filePath: filepath.Join(configDir, "bypass.json"),
		presets:  map[string]bool{},
	}
	bs.load()
	return bs
}

func (bs *BypassStore) load() {
	data, err := os.ReadFile(bs.filePath)
	if err != nil {
		// 首次启动：写入默认预设
		bs.applyPreset("apple_telemetry", true)
		_ = bs.persist()
		return
	}
	var f bypassFile
	if err := json.Unmarshal(data, &f); err != nil {
		return
	}
	bs.rules = f.Rules
	for _, p := range f.PresetsEnabled {
		bs.presets[p] = true
	}
}

func (bs *BypassStore) persist() error {
	_ = os.MkdirAll(filepath.Dir(bs.filePath), 0o700)
	var enabled []string
	for k, v := range bs.presets {
		if v {
			enabled = append(enabled, k)
		}
	}
	f := bypassFile{Rules: bs.rules, PresetsEnabled: enabled}
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(bs.filePath, data, 0o600)
}

// Matches 检查 host 是否命中任何已启用的 bypass 规则（glob 语义）。
func (bs *BypassStore) Matches(host string) bool {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	for _, r := range bs.rules {
		if !r.Enabled {
			continue
		}
		if globMatch(r.Pattern, host) {
			return true
		}
	}
	return false
}

// List 返回全部规则副本（实现 api.BypassManager）。
func (bs *BypassStore) List() []api.BypassRuleItem {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	out := make([]api.BypassRuleItem, len(bs.rules))
	copy(out, bs.rules)
	return out
}

// Add 追加规则，自动去重（实现 api.BypassManager）。
func (bs *BypassStore) Add(r api.BypassRuleItem) error {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	for _, existing := range bs.rules {
		if existing.Pattern == r.Pattern {
			return nil
		}
	}
	bs.rules = append(bs.rules, r)
	return bs.persist()
}

// Remove 按 pattern 删除（实现 api.BypassManager）。
func (bs *BypassStore) Remove(pattern string) error {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	out := bs.rules[:0]
	for _, r := range bs.rules {
		if r.Pattern != pattern {
			out = append(out, r)
		}
	}
	bs.rules = out
	return bs.persist()
}

// SetEnabled 启用/禁用某 pattern（实现 api.BypassManager）。
func (bs *BypassStore) SetEnabled(pattern string, enabled bool) error {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	for i := range bs.rules {
		if bs.rules[i].Pattern == pattern {
			bs.rules[i].Enabled = enabled
			return bs.persist()
		}
	}
	return nil
}

// EnablePreset 启用预设包（实现 api.BypassManager）。
func (bs *BypassStore) EnablePreset(name string) error {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	bs.applyPreset(name, true)
	return bs.persist()
}

// DisablePreset 禁用预设包（实现 api.BypassManager）。
func (bs *BypassStore) DisablePreset(name string) error {
	bs.mu.Lock()
	defer bs.mu.Unlock()
	bs.presets[name] = false
	for _, p := range presetDefs[name] {
		for i := range bs.rules {
			if bs.rules[i].Pattern == p && bs.rules[i].Tag == name {
				bs.rules[i].Enabled = false
			}
		}
	}
	return bs.persist()
}

// EnabledPresets 返回已启用的预设名称列表（实现 api.BypassManager）。
func (bs *BypassStore) EnabledPresets() []string {
	bs.mu.RLock()
	defer bs.mu.RUnlock()
	var out []string
	for k, v := range bs.presets {
		if v {
			out = append(out, k)
		}
	}
	return out
}

// applyPreset 内部（无锁）写入预设规则。
func (bs *BypassStore) applyPreset(name string, markEnabled bool) {
	patterns, ok := presetDefs[name]
	if !ok {
		return
	}
	bs.presets[name] = markEnabled
	for _, p := range patterns {
		if !slices.ContainsFunc(bs.rules, func(r api.BypassRuleItem) bool {
			return r.Pattern == p
		}) {
			bs.rules = append(bs.rules, api.BypassRuleItem{
				Pattern: p,
				Tag:     name,
				Enabled: markEnabled,
			})
		}
	}
}

// presetDefs 预设包定义。
var presetDefs = map[string][]string{
	"apple_telemetry": {
		"*.apple.com",
		"*.icloud.com",
		"*.itunes.apple.com",
		"gateway.push.apple.com",
	},
	"apple_push": {
		"gateway.push.apple.com",
		"*.push.apple.com",
	},
	"google_services": {
		"*.googleapis.com",
		"*.gstatic.com",
		"accounts.google.com",
	},
	"microsoft": {
		"*.microsoft.com",
		"*.windows.com",
		"*.windowsupdate.com",
	},
	"cert_pinned_cn": {
		"*.alipay.com",
		"*.weixin.qq.com",
		"*.bankcomm.com",
		"*.icbc.com.cn",
		"*.ccb.com",
	},
	"cert_pinned_us": {
		"*.bankofamerica.com",
		"*.chase.com",
		"*.wellsfargo.com",
		"*.citi.com",
	},
}

// PresetNames 返回所有预设名称列表。
func PresetNames() []string {
	return slices.Sorted(maps.Keys(presetDefs))
}

// PresetPatterns 返回指定预设的 pattern 列表。
func PresetPatterns(name string) []string {
	return presetDefs[name]
}

// globMatch 支持 *.example.com 风格 glob（仅 * 通配符）。
func globMatch(pattern, host string) bool {
	if pattern == host {
		return true
	}
	if len(pattern) == 0 {
		return false
	}
	if pattern[0] == '*' {
		suffix := pattern[1:]
		if len(suffix) == 0 {
			return true
		}
		return len(host) >= len(suffix) && host[len(host)-len(suffix):] == suffix
	}
	return false
}

// --------------------------------------------------------------------------
// PinningDetector — 检测 SSL Pinning 导致的握手失败
// --------------------------------------------------------------------------

const (
	pinningThreshold = 3
	pinningWindow    = 60 * time.Second
)

// PinningDetector 统计每个 host 的 TLS 握手失败次数，超阈值后视为 SSL Pinning。
// 实现 api.PinningManager 接口。
type PinningDetector struct {
	mu       sync.Mutex
	signals  map[string]*pinningSignal
	detected map[string]*api.DetectedHostItem
}

type pinningSignal struct {
	failures    int
	lastFailure time.Time
}

// NewPinningDetector 创建检测器实例。
func NewPinningDetector() *PinningDetector {
	return &PinningDetector{
		signals:  map[string]*pinningSignal{},
		detected: map[string]*api.DetectedHostItem{},
	}
}

// RecordFailure 记录一次握手失败。
// 如果这次记录导致 host 首次被标记为 pinned，返回 true。
func (pd *PinningDetector) RecordFailure(host string) bool {
	pd.mu.Lock()
	defer pd.mu.Unlock()

	now := time.Now()
	sig := pd.signals[host]
	if sig == nil {
		sig = &pinningSignal{}
		pd.signals[host] = sig
	}

	if now.Sub(sig.lastFailure) > pinningWindow {
		sig.failures = 0
	}
	sig.failures++
	sig.lastFailure = now

	if sig.failures >= pinningThreshold {
		if _, already := pd.detected[host]; !already {
			pd.detected[host] = &api.DetectedHostItem{
				Host:        host,
				Failures:    sig.failures,
				LastFailure: now.Format(time.RFC3339),
			}
			return true
		}
		pd.detected[host].Failures = sig.failures
		pd.detected[host].LastFailure = now.Format(time.RFC3339)
	}
	return false
}

// DetectedHosts 返回所有已检测到的 pinned host 快照（实现 api.PinningManager）。
func (pd *PinningDetector) DetectedHosts() []api.DetectedHostItem {
	pd.mu.Lock()
	defer pd.mu.Unlock()
	out := make([]api.DetectedHostItem, 0, len(pd.detected))
	for _, d := range pd.detected {
		out = append(out, *d)
	}
	return out
}

// IsPinned 判断某 host 是否已确认 pinning（实现 api.PinningManager）。
func (pd *PinningDetector) IsPinned(host string) bool {
	pd.mu.Lock()
	defer pd.mu.Unlock()
	_, ok := pd.detected[host]
	return ok
}
