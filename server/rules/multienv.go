package rules

import (
	"context"
	"net/http"
	"sync/atomic"
)

// EnvConfig 描述 remoteConfig 里单个环境的配置。
type EnvConfig struct {
	Name      string `json:"name"`
	Rules     string `json:"rules"`
	IsDefault bool   `json:"is_default"`
}

// multiEnvState 是 MultiEnv 原子替换的内部状态。
type multiEnvState struct {
	envs      map[string]Engine // name → engine
	defaultEn Engine            // is_default=true 的 engine；nil 退化到 Nop
}

// MultiEnv 是一个多环境规则分发器。
//
// 每个请求通过 X-Piper-Env header 选择对应环境的 Engine；
// 无 header → 使用 is_default=true 的环境；无 default → Nop。
// 整个状态可通过 Swap 原子替换（热重载场景）。
type MultiEnv struct {
	state atomic.Pointer[multiEnvState]
}

// NewMultiEnv 从 []EnvConfig 创建 MultiEnv。
// envs 为空时行为等同于 Nop。
func NewMultiEnv(envs []EnvConfig) *MultiEnv {
	m := &MultiEnv{}
	m.Swap(envs)
	return m
}

// Swap 原子替换所有环境的规则引擎（热重载时调用）。
func (m *MultiEnv) Swap(envs []EnvConfig) {
	engines := make(map[string]Engine, len(envs))
	var def Engine
	for _, e := range envs {
		var eng Engine
		if e.Rules == "" {
			eng = Nop{}
		} else {
			eng = New(e.Rules)
		}
		engines[e.Name] = eng
		if e.IsDefault {
			def = eng
		}
	}
	if def == nil {
		def = Nop{}
	}
	m.state.Store(&multiEnvState{envs: engines, defaultEn: def})
}

// Match 从请求 header 读 X-Piper-Env 分派到对应 engine；无 header 或找不到时用默认 engine。
func (m *MultiEnv) Match(ctx context.Context, r *http.Request) *Action {
	st := m.state.Load()
	if st == nil {
		return &Action{}
	}
	envName := r.Header.Get("X-Piper-Env")
	if envName == "" {
		return st.defaultEn.Match(ctx, r)
	}
	if eng, ok := st.envs[envName]; ok {
		return eng.Match(ctx, r)
	}
	// 找不到指定 env → fallback 默认
	return st.defaultEn.Match(ctx, r)
}
