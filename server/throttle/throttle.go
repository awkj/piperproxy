// Package throttle 实现弱网模拟：token-bucket 限速 + 固定延迟。
//
// 使用方式：
//  1. 调用 Global.Set(preset) 设置全局档位（线程安全）。
//  2. 在请求转发管道里调用 Global.WrapReader / WrapWriter 包装 io.Reader/Writer。
package throttle

import (
	"context"
	"io"
	"math/rand/v2"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"
)

// Preset 是预设档位名。
type Preset string

const (
	PresetOff     Preset = "off"
	PresetOffline Preset = "offline"
	PresetGPRS    Preset = "gprs"
	PresetEDGE    Preset = "edge"
	Preset3G      Preset = "3g"
	Preset4G      Preset = "4g"
	PresetDSL     Preset = "dsl"
	PresetWiFi    Preset = "wifi"
	PresetCustom  Preset = "custom"
)

// Profile 是一个档位的完整参数。
type Profile struct {
	UpBPS   int64         // 上行字节/秒，0 = 无限制
	DownBPS int64         // 下行字节/秒，0 = 无限制
	Latency time.Duration // 每 chunk 前的固定延迟（0 = 无）
	Jitter  time.Duration // 抖动（随机 [0, Jitter) 加到 Latency 上）
	Offline bool          // true = 立即拒绝所有连接
}

var presets = map[Preset]Profile{
	PresetOff:     {},
	PresetOffline: {Offline: true},
	PresetGPRS:    {UpBPS: 6_250, DownBPS: 6_250, Latency: 500 * time.Millisecond},
	PresetEDGE:    {UpBPS: 31_250, DownBPS: 31_250, Latency: 300 * time.Millisecond},
	Preset3G:      {UpBPS: 93_750, DownBPS: 187_500, Latency: 100 * time.Millisecond},
	Preset4G:      {UpBPS: 1_125_000, DownBPS: 1_125_000, Latency: 50 * time.Millisecond},
	PresetDSL:     {UpBPS: 48_000, DownBPS: 250_000, Latency: 50 * time.Millisecond},
	PresetWiFi:    {UpBPS: 0, DownBPS: 0, Latency: 10 * time.Millisecond},
	PresetCustom:  {},
}

// Config 是 API 层读写的完整配置。
type Config struct {
	Preset  Preset  `json:"preset"`
	Profile Profile `json:"profile"` // Custom 档位时生效；其他档位由后端填充
}

// Manager 持有当前弱网配置，线程安全。
type Manager struct {
	mu      sync.RWMutex
	current Config
	enabled atomic.Bool // preset != "off"
}

// Global 是进程级单例。
var Global = &Manager{current: Config{Preset: PresetOff}}

// Get 返回当前配置（深拷贝）。
func (m *Manager) Get() Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

// Set 更新当前档位；custom 时以 cfg.Profile 为准，其他档位用预设值覆盖。
func (m *Manager) Set(cfg Config) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cfg.Preset != PresetCustom {
		if p, ok := presets[cfg.Preset]; ok {
			cfg.Profile = p
		}
	}
	m.current = cfg
	m.enabled.Store(cfg.Preset != PresetOff)
}

// IsOffline 返回当前是否为 Offline 档位。
func (m *Manager) IsOffline() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current.Profile.Offline
}

// Enabled 返回是否已开启弱网模拟。
func (m *Manager) Enabled() bool {
	return m.enabled.Load()
}

// WrapReader 用下行限速包装 r；不限速时直接返回 r。
func (m *Manager) WrapReader(ctx context.Context, r io.Reader) io.Reader {
	m.mu.RLock()
	prof := m.current.Profile
	m.mu.RUnlock()
	if prof.Offline || (prof.DownBPS == 0 && prof.Latency == 0) {
		return r
	}
	var lim *rate.Limiter
	if prof.DownBPS > 0 {
		lim = rate.NewLimiter(rate.Limit(prof.DownBPS), int(prof.DownBPS))
	}
	return &throttledReader{ctx: ctx, r: r, limiter: lim, latency: prof.Latency, jitter: prof.Jitter}
}

// WrapWriter 用上行限速包装 w；不限速时直接返回 w。
func (m *Manager) WrapWriter(ctx context.Context, w io.Writer) io.Writer {
	m.mu.RLock()
	prof := m.current.Profile
	m.mu.RUnlock()
	if prof.Offline || (prof.UpBPS == 0 && prof.Latency == 0) {
		return w
	}
	var lim *rate.Limiter
	if prof.UpBPS > 0 {
		lim = rate.NewLimiter(rate.Limit(prof.UpBPS), int(prof.UpBPS))
	}
	return &throttledWriter{ctx: ctx, w: w, limiter: lim, latency: prof.Latency, jitter: prof.Jitter}
}

// --------------------------------------------------------------------------
// throttledReader
// --------------------------------------------------------------------------

const chunkSize = 4096

type throttledReader struct {
	ctx     context.Context
	r       io.Reader
	limiter *rate.Limiter
	latency time.Duration
	jitter  time.Duration
	first   bool
}

func (t *throttledReader) Read(p []byte) (int, error) {
	if !t.first {
		t.first = true
		if d := t.delay(); d > 0 {
			select {
			case <-time.After(d):
			case <-t.ctx.Done():
				return 0, t.ctx.Err()
			}
		}
	}
	if len(p) > chunkSize {
		p = p[:chunkSize]
	}
	n, err := t.r.Read(p)
	if n > 0 && t.limiter != nil {
		if werr := t.limiter.WaitN(t.ctx, n); werr != nil {
			return n, werr
		}
	}
	return n, err
}

func (t *throttledReader) delay() time.Duration {
	d := t.latency
	if t.jitter > 0 {
		d += time.Duration(rand.Int64N(int64(t.jitter)))
	}
	return d
}

// --------------------------------------------------------------------------
// throttledWriter
// --------------------------------------------------------------------------

type throttledWriter struct {
	ctx     context.Context
	w       io.Writer
	limiter *rate.Limiter
	latency time.Duration
	jitter  time.Duration
	first   bool
}

func (t *throttledWriter) Write(p []byte) (int, error) {
	if !t.first {
		t.first = true
		if d := t.delay(); d > 0 {
			select {
			case <-time.After(d):
			case <-t.ctx.Done():
				return 0, t.ctx.Err()
			}
		}
	}
	total := 0
	for len(p) > 0 {
		chunk := p
		if len(chunk) > chunkSize {
			chunk = p[:chunkSize]
		}
		if t.limiter != nil {
			if err := t.limiter.WaitN(t.ctx, len(chunk)); err != nil {
				return total, err
			}
		}
		n, err := t.w.Write(chunk)
		total += n
		if err != nil {
			return total, err
		}
		p = p[n:]
	}
	return total, nil
}

func (t *throttledWriter) delay() time.Duration {
	d := t.latency
	if t.jitter > 0 {
		d += time.Duration(rand.Int64N(int64(t.jitter)))
	}
	return d
}

// PresetProfiles 返回所有预设档位信息（供 API 回显）。
func PresetProfiles() map[Preset]Profile {
	result := make(map[Preset]Profile, len(presets))
	for k, v := range presets {
		result[k] = v
	}
	return result
}
