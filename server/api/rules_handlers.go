// Package api — rules_handlers.go：规则组 CRUD 端点。
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// --------------------------------------------------------------------------
// GET /api/rules — 规则组列表（ordered 格式）
// --------------------------------------------------------------------------

// handleRulesList 返回所有规则组，格式 [{name, value, selected?}]。
// 若 db 未注入则返回 mock 空列表。
func (r *Router) handleRulesList(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		writeJSON(w, []any{
			map[string]any{"name": "Default", "value": ""},
		})
		return
	}
	groups, err := r.db.ListRules(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]any, 0, len(groups))
	for _, g := range groups {
		out = append(out, map[string]any{
			"name":     g.Name,
			"value":    g.Value,
			"selected": g.Selected,
		})
	}
	writeJSON(w, out)
}

// --------------------------------------------------------------------------
// POST /api/rules — 新建规则组
// --------------------------------------------------------------------------

func (r *Router) handleRulesAdd(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	var body struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := r.db.AddRule(req.Context(), body.Name, body.Value); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// --------------------------------------------------------------------------
// DELETE /api/rules/:name — 删除规则组
// --------------------------------------------------------------------------

func (r *Router) handleRulesRemove(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.db.RemoveRule(req.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// PUT /api/rules/:name — 重命名（或保存内容）规则组
// --------------------------------------------------------------------------

func (r *Router) handleRulesUpdate(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	var body struct {
		NewName string `json:"newName"`
		Value   string `json:"value"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.NewName != "" && body.NewName != name {
		if err := r.db.RenameRule(req.Context(), name, body.NewName); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "rule not found")
			} else {
				writeError(w, http.StatusInternalServerError, err.Error())
			}
			return
		}
		name = body.NewName
	}
	if body.Value != "" || req.ContentLength > 2 {
		// 如果只有 newName 传过来，value 可能是空字符串；
		// 当用户确实要清空 value 时也允许
		if err := r.db.SaveRule(req.Context(), name, body.Value); err != nil && !errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// PUT /api/rules/:name/enable — 启用规则组
// --------------------------------------------------------------------------

func (r *Router) handleRulesEnable(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	settings, _ := r.db.GetRuleSettings(req.Context())
	if err := r.db.EnableRule(req.Context(), name, settings.AllowMultipleChoice); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "rule not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// PUT /api/rules/:name/disable — 禁用规则组
// --------------------------------------------------------------------------

func (r *Router) handleRulesDisable(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.db.DisableRule(req.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// PUT /api/rules/settings — 全局规则开关
// --------------------------------------------------------------------------

func (r *Router) handleRulesSettings(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	var body struct {
		DisabledAllRules    *int `json:"disabledAllRules"`
		AllowMultipleChoice *int `json:"allowMultipleChoice"`
		ToggleDefault       *int `json:"toggleDefault"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.DisabledAllRules != nil {
		_ = r.db.SetRuleSetting(req.Context(), "disabled_all_rules", *body.DisabledAllRules != 0)
	}
	if body.AllowMultipleChoice != nil {
		_ = r.db.SetRuleSetting(req.Context(), "allow_multiple_choice", *body.AllowMultipleChoice != 0)
	}
	if body.ToggleDefault != nil {
		s, _ := r.db.GetRuleSettings(req.Context())
		_ = r.db.SetRuleSetting(req.Context(), "default_rules_disabled", !s.DefaultDisabled)
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// POST /api/rules/import — 导入规则文件
// --------------------------------------------------------------------------

func (r *Router) handleRulesImport(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	body, err := io.ReadAll(io.LimitReader(req.Body, 10<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read body failed")
		return
	}
	// 简化：把整个上传内容存为 "Imported" 规则组
	if err := r.db.AddRule(req.Context(), "Imported", string(body)); err != nil {
		_ = r.db.SaveRule(req.Context(), "Imported", string(body))
	}
	w.WriteHeader(http.StatusCreated)
}

// --------------------------------------------------------------------------
// GET /api/rules/export — 导出所有规则为纯文本
// --------------------------------------------------------------------------

func (r *Router) handleRulesExport(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	groups, err := r.db.ListRules(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="piper-rules.txt"`)
	for _, g := range groups {
		if g.Value != "" {
			_, _ = w.Write([]byte("# " + g.Name + "\n" + g.Value + "\n\n"))
		}
	}
}
