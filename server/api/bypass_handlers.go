package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// GET /api/bypass — 列出所有 bypass 规则 + 已启用预设
func (r *Router) handleBypassList(w http.ResponseWriter, _ *http.Request) {
	if r.bypass == nil {
		writeJSON(w, map[string]any{"rules": []any{}, "presets_enabled": []string{}})
		return
	}
	writeJSON(w, map[string]any{
		"rules":           r.bypass.List(),
		"presets_enabled": r.bypass.EnabledPresets(),
	})
}

// POST /api/bypass — 添加规则
func (r *Router) handleBypassAdd(w http.ResponseWriter, req *http.Request) {
	if r.bypass == nil {
		writeError(w, http.StatusServiceUnavailable, "bypass not available")
		return
	}
	var body BypassRuleItem
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Pattern == "" {
		writeError(w, http.StatusBadRequest, "invalid body: pattern required")
		return
	}
	if body.Tag == "" {
		body.Tag = "custom"
	}
	body.Enabled = true
	if err := r.bypass.Add(body); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, body)
}

// DELETE /api/bypass/{pattern} — 删除规则
func (r *Router) handleBypassRemove(w http.ResponseWriter, req *http.Request) {
	if r.bypass == nil {
		writeError(w, http.StatusServiceUnavailable, "bypass not available")
		return
	}
	pattern := chi.URLParam(req, "pattern")
	if pattern == "" {
		writeError(w, http.StatusBadRequest, "pattern required")
		return
	}
	if err := r.bypass.Remove(pattern); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"deleted": pattern})
}

// PUT /api/bypass/{pattern}/enable — 启用/禁用规则
func (r *Router) handleBypassSetEnabled(w http.ResponseWriter, req *http.Request) {
	if r.bypass == nil {
		writeError(w, http.StatusServiceUnavailable, "bypass not available")
		return
	}
	pattern := chi.URLParam(req, "pattern")
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := r.bypass.SetEnabled(pattern, body.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"pattern": pattern, "enabled": body.Enabled})
}

// POST /api/bypass/presets/{name}/enable — 启用预设包
func (r *Router) handleBypassEnablePreset(w http.ResponseWriter, req *http.Request) {
	if r.bypass == nil {
		writeError(w, http.StatusServiceUnavailable, "bypass not available")
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.bypass.EnablePreset(name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"preset": name, "enabled": true})
}

// POST /api/bypass/presets/{name}/disable — 禁用预设包
func (r *Router) handleBypassDisablePreset(w http.ResponseWriter, req *http.Request) {
	if r.bypass == nil {
		writeError(w, http.StatusServiceUnavailable, "bypass not available")
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.bypass.DisablePreset(name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"preset": name, "enabled": false})
}

// GET /api/bypass/pinned — 列出检测到的 pinned hosts
func (r *Router) handleBypassPinnedList(w http.ResponseWriter, _ *http.Request) {
	if r.pinning == nil {
		writeJSON(w, map[string]any{"hosts": []any{}})
		return
	}
	writeJSON(w, map[string]any{"hosts": r.pinning.DetectedHosts()})
}
