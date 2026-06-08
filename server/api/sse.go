// Package api — sse.go：SSE 抓包流 + 相关端点（batch/clear）。
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// --------------------------------------------------------------------------
// GET /api/captures/stream — SSE 主流
// --------------------------------------------------------------------------

// handleCaptureStream 建立 SSE 长连接，将新抓包事件实时推送给前端。
// 每 30s 发 heartbeat 防止代理层断开连接。
func (r *Router) handleCaptureStream(w http.ResponseWriter, req *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// 连接建立时立即推一条 heartbeat，确保头部被 flush 到客户端。
	writeSSEEvent(w, "heartbeat", map[string]any{"ts": time.Now().UnixMilli()}, 0)
	flusher.Flush()

	done := req.Context().Done()
	filter := parseStreamFilter(req)
	events := r.capture.Subscribe(done, filter)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case ev, ok := <-events:
			if !ok {
				return
			}
			writeSSEEvent(w, "capture."+ev.Type, ev.Item, ev.Seq)
			flusher.Flush()
		case <-ticker.C:
			writeSSEEvent(w, "heartbeat", map[string]any{"ts": time.Now().UnixMilli()}, 0)
			flusher.Flush()
		}
	}
}

// writeSSEEvent 向 ResponseWriter 写一条格式规范的 SSE 消息。
// seq=0 时省略 id: 行（heartbeat 等不需要 replay 的事件）。
func writeSSEEvent(w http.ResponseWriter, event string, data any, seq int64) {
	if seq > 0 {
		fmt.Fprintf(w, "id: %d\n", seq)
	}
	fmt.Fprintf(w, "event: %s\n", event)
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "data: %s\n\n", b)
}

// --------------------------------------------------------------------------
// POST /api/captures/batch — 按 ID 批量拉取抓包快照
// --------------------------------------------------------------------------

func (r *Router) handleCaptureBatch(w http.ResponseWriter, req *http.Request) {
	var body BatchCaptureRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	result := make(map[string]any, len(body.IDs))
	for _, id := range body.IDs {
		if item := r.capture.GetByID(id); item != nil {
			result[id] = item
		} else {
			result[id] = nil
		}
	}
	writeJSON(w, result)
}

// --------------------------------------------------------------------------
// DELETE /api/captures — 清空全部抓包（stub）
// --------------------------------------------------------------------------

func (r *Router) handleClearCaptures(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

// --------------------------------------------------------------------------
// GET /api/captures/:id/frames — WebSocket 帧（重命名自 handleGetFrames）
// --------------------------------------------------------------------------

func (r *Router) handleGetFramesByID(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing id")
		return
	}
	sess := r.wsHook.Get(id)
	if sess == nil {
		writeJSON(w, GetFramesResponse{Frames: []any{}})
		return
	}
	frames := make([]any, 0, len(sess.Frames))
	for _, f := range sess.Frames {
		frames = append(frames, f)
	}
	writeJSON(w, GetFramesResponse{Frames: frames})
}

// --------------------------------------------------------------------------
// Track D · 单条抓包 + body 懒加载端点
// --------------------------------------------------------------------------

// GET /api/captures/:id — 返回单条完整快照（含 body）。
func (r *Router) handleGetCapture(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	item := r.capture.GetFull(id)
	if item == nil {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	writeJSON(w, item)
}

// GET /api/captures/:id/req/body — 返回请求 body 原始字节。
// 用 capture 抓到的 req Content-Type 回写响应头，让浏览器能直接渲染图片/视频等二进制类型。
func (r *Router) handleGetReqBody(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	item := r.capture.GetByID(id)
	reqBody, _, ok := r.capture.GetBody(id)
	if !ok || item == nil {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	writeCapturedBody(w, item.Req.Headers, []byte(reqBody))
}

// GET /api/captures/:id/res/body — 返回响应 body 原始字节（保留原 Content-Type）。
func (r *Router) handleGetResBody(w http.ResponseWriter, req *http.Request) {
	id := chi.URLParam(req, "id")
	item := r.capture.GetByID(id)
	_, resBody, ok := r.capture.GetBody(id)
	if !ok || item == nil {
		writeError(w, http.StatusNotFound, "capture not found")
		return
	}
	writeCapturedBody(w, item.Res.Headers, []byte(resBody))
}

// writeCapturedBody 把抓到的 body 写回浏览器，按抓包时的 Content-Type 决定渲染方式：
//   - 透传原 Content-Type（图片 / 视频 / json 等浏览器自然处理）
//   - 缺 charset 的 text/* 补上 utf-8，避免乱码
//   - 完全缺 Content-Type 时回退 application/octet-stream（不再硬塞 text/plain，
//     否则二进制图片会被前端按文本解码出乱码）
//   - Content-Disposition: inline，让浏览器内联展示而非下载
//
// 注意：抓包存的 body 已经是「解压后」的原始字节，所以不要回写 Content-Encoding。
func writeCapturedBody(w http.ResponseWriter, headers map[string]string, body []byte) {
	ct := lookupHeader(headers, "Content-Type")
	switch {
	case ct == "":
		ct = "application/octet-stream"
	case strings.HasPrefix(strings.ToLower(ct), "text/") && !strings.Contains(strings.ToLower(ct), "charset="):
		ct += "; charset=utf-8"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	_, _ = w.Write(body)
}

// lookupHeader 大小写不敏感查头。flattenHdrs 保留了原始 case，前端发的 fetch 也可能用 lower-case。
func lookupHeader(h map[string]string, key string) string {
	if v, ok := h[key]; ok {
		return v
	}
	lk := strings.ToLower(key)
	for k, v := range h {
		if strings.ToLower(k) == lk {
			return v
		}
	}
	return ""
}

// --------------------------------------------------------------------------
// Track E · parseStreamFilter — 从请求 query 解析过滤条件
// --------------------------------------------------------------------------

// parseStreamFilter 从 GET /api/captures/stream 的 query 参数解析过滤条件。
// 支持：method=GET,POST  host=*.example.com  status=2xx  urlPattern=*api*
func parseStreamFilter(req *http.Request) CaptureFilter {
	q := req.URL.Query()
	var methods []string
	if m := q.Get("method"); m != "" {
		for _, p := range strings.Split(m, ",") {
			if t := strings.TrimSpace(p); t != "" {
				methods = append(methods, t)
			}
		}
	}
	return CaptureFilter{
		Methods:    methods,
		Host:       q.Get("host"),
		Status:     q.Get("status"),
		URLPattern: q.Get("urlPattern"),
	}
}
