// Package api — values_handlers.go：Values CRUD 端点。
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// --------------------------------------------------------------------------
// GET /api/values — values 列表
// --------------------------------------------------------------------------

func (r *Router) handleValuesList(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	items, err := r.db.ListValues(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]any, 0, len(items))
	for _, v := range items {
		out = append(out, map[string]any{"name": v.Name, "value": v.Value})
	}
	writeJSON(w, out)
}

// --------------------------------------------------------------------------
// POST /api/values — 新建 value（name 已存在则更新）
// --------------------------------------------------------------------------

func (r *Router) handleValuesAdd(w http.ResponseWriter, req *http.Request) {
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
	if err := r.db.AddValue(req.Context(), body.Name, body.Value); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// --------------------------------------------------------------------------
// DELETE /api/values/:name — 删除 value（移入回收站）
// --------------------------------------------------------------------------

func (r *Router) handleValuesRemove(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.db.RemoveValue(req.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// PUT /api/values/:name — 重命名 value
// --------------------------------------------------------------------------

func (r *Router) handleValuesRename(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	var body struct {
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.NewName == "" {
		writeError(w, http.StatusBadRequest, "newName is required")
		return
	}
	if err := r.db.RenameValue(req.Context(), name, body.NewName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "value not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// GET /api/values/recycle — 回收站列表
// --------------------------------------------------------------------------

func (r *Router) handleValuesRecycleList(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	items, err := r.db.ListRecycle(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]any, 0, len(items))
	for _, v := range items {
		out = append(out, map[string]any{"filename": v.Name, "data": v.Value})
	}
	writeJSON(w, map[string]any{"list": out})
}

// --------------------------------------------------------------------------
// GET /api/values/recycle/:name — 查看回收站单条
// --------------------------------------------------------------------------

func (r *Router) handleValuesRecycleView(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	item, err := r.db.GetRecycleItem(req.Context(), name)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, map[string]any{"name": item.Name, "data": item.Value})
}

// --------------------------------------------------------------------------
// DELETE /api/values/recycle/:name — 从回收站彻底删除
// --------------------------------------------------------------------------

func (r *Router) handleValuesRecycleRemove(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	name := chi.URLParam(req, "name")
	if err := r.db.RemoveRecycleItem(req.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// POST /api/values/import — 批量导入 values（JSON 对象）
// --------------------------------------------------------------------------

func (r *Router) handleValuesImport(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	var data map[string]string
	if err := json.NewDecoder(req.Body).Decode(&data); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	for name, value := range data {
		if name == "" {
			continue
		}
		_ = r.db.AddValue(req.Context(), name, value)
	}
	w.WriteHeader(http.StatusCreated)
}

// --------------------------------------------------------------------------
// GET /api/values/export — 导出所有 values 为 JSON 文件
// --------------------------------------------------------------------------

func (r *Router) handleValuesExport(w http.ResponseWriter, req *http.Request) {
	if r.db == nil {
		notImplemented(w, req)
		return
	}
	items, err := r.db.ListValues(req.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	m := make(map[string]string, len(items))
	for _, v := range items {
		m[v.Name] = v.Value
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="piper-values.json"`)
	writeJSON(w, m)
}
