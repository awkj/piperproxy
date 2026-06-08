// Package api — codegen_handlers.go：把抓包翻译成客户端代码片段（v1 仅 curl）。
//
// 详见 docs/competitive/specs/p1-code-generator.md。
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/awkj/piper/server/internal/codegen"
)

// CodegenCurlResponse 是 GET /api/captures/{id}/curl 的响应体。
type CodegenCurlResponse struct {
	Command string `json:"command"`
}

// GET /api/captures/{id}/curl — 把单条抓包转成 macOS / Linux POSIX shell 可粘 curl 命令。
func (r *Router) handleGetCaptureCurl(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	item := r.capture.GetFull(id)
	if item == nil {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	cmd := codegen.BuildCurl(codegen.Request{
		Method:  item.Method,
		URL:     item.URL,
		Headers: item.Req.Headers,
		Body:    item.Req.Body,
	})
	writeJSON(w, CodegenCurlResponse{Command: cmd})
}
