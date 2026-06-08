// Package api — ws_hook.go：把 ws.Hook 接到 cgi-bin 抓包后端。
//
// 设计：
//   - WSHook 同时实现 ws.Hook（全局占位，永远 no-op）和 NewSession(r) 工厂方法。
//   - proxy/upgrade.go 通过 type-assert 检测到 NewSession 后，每条 WS 连接拿一个独立 Hook，
//     这样不同连接的帧能按 sessionID 区分。
//   - sessions 是固定容量的 LRU——超出后按起始时间踢最老的——避免长跑泄漏。
//   - 每个 session 的帧也带上限（FramesPerSession），超出后丢弃后续帧并打 truncated 标记。
package api

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/awkj/piper/server/ws"
)

// FrameItem 是一帧 WebSocket 数据的快照，对齐 Node 前端 useFrameSocket.ts 期望的字段名。
type FrameItem struct {
	Time       int64  `json:"time"`       // unix ms
	FromClient bool   `json:"fromClient"` // true = client→server
	Opcode     byte   `json:"opcode"`     // RFC 6455 §5.2
	Length     int    `json:"length"`     // payload 字节数
	Text       string `json:"text,omitempty"` // OpText 时的解码文本；其它类型为空
}

// WSSession 表示一条 WebSocket 连接的抓包会话。
type WSSession struct {
	ID        string      `json:"id"`
	URL       string      `json:"url"`
	StartTime int64       `json:"startTime"`
	EndTime   int64       `json:"endTime,omitempty"`
	Frames    []FrameItem `json:"frames"`
	Truncated bool        `json:"truncated,omitempty"` // 超过 FramesPerSession 限制时为 true
	CloseErr  string      `json:"closeErr,omitempty"`
}

// WSHook 是 ws.Hook 的 cgi-bin 实现 + per-session 工厂。
type WSHook struct {
	sessionCap       int // 最多保留多少条会话
	framesPerSession int // 每条会话最多保留多少帧

	mu       sync.RWMutex
	sessions map[string]*WSSession
	order    []string // 写入顺序，evict 用
	seq      atomic.Int64
}

// NewWSHook 返回新 hook。零值 sessionCap / framesPerSession 各退化为 64 / 1024。
func NewWSHook(sessionCap, framesPerSession int) *WSHook {
	if sessionCap <= 0 {
		sessionCap = 64
	}
	if framesPerSession <= 0 {
		framesPerSession = 1024
	}
	return &WSHook{
		sessionCap:       sessionCap,
		framesPerSession: framesPerSession,
		sessions:         make(map[string]*WSSession),
	}
}

// ws.Hook 全局接口实现——用作 fallback；per-request 走 NewSession 返回的子 hook。
func (*WSHook) OnHandshake(*http.Request) {}
func (*WSHook) OnFrame(ws.Frame)          {}
func (*WSHook) OnClose(error)             {}

// NewSession 给一个新 WS 升级请求开会话，返回该会话专用的 ws.Hook。
// proxy/upgrade.go 通过 type-assert 调用本方法。
func (h *WSHook) NewSession(r *http.Request) ws.Hook {
	id := fmt.Sprintf("ws_%d", h.seq.Add(1))
	url := ""
	if r != nil && r.URL != nil {
		url = r.URL.String()
	}
	sess := &WSSession{
		ID:        id,
		URL:       url,
		StartTime: time.Now().UnixMilli(),
	}

	h.mu.Lock()
	if len(h.sessions) >= h.sessionCap && len(h.order) > 0 {
		oldest := h.order[0]
		h.order = h.order[1:]
		delete(h.sessions, oldest)
	}
	h.sessions[id] = sess
	h.order = append(h.order, id)
	h.mu.Unlock()

	return &wsSessionHook{owner: h, sess: sess}
}

// Sessions 返回当前持有的会话列表，按写入顺序。
func (h *WSHook) Sessions() []*WSSession {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*WSSession, 0, len(h.order))
	for _, id := range h.order {
		if s, ok := h.sessions[id]; ok {
			out = append(out, s)
		}
	}
	return out
}

// Get 按 sessionID 查询；找不到返回 nil。
func (h *WSHook) Get(id string) *WSSession {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.sessions[id]
}

// wsSessionHook 是 NewSession 返回的子 hook——闭包绑定到一个 WSSession。
type wsSessionHook struct {
	owner *WSHook
	sess  *WSSession
}

func (s *wsSessionHook) OnHandshake(*http.Request) {
	// 会话在 NewSession 时已记录；此处保持空实现以满足 ws.Hook。
}

func (s *wsSessionHook) OnFrame(f ws.Frame) {
	item := FrameItem{
		Time:       time.Now().UnixMilli(),
		FromClient: f.FromClient,
		Opcode:     f.Opcode,
		Length:     len(f.Payload),
	}
	if f.Opcode == ws.OpText {
		item.Text = string(f.Payload)
	}

	s.owner.mu.Lock()
	if len(s.sess.Frames) >= s.owner.framesPerSession {
		s.sess.Truncated = true
	} else {
		s.sess.Frames = append(s.sess.Frames, item)
	}
	s.owner.mu.Unlock()
}

func (s *wsSessionHook) OnClose(err error) {
	s.owner.mu.Lock()
	s.sess.EndTime = time.Now().UnixMilli()
	if err != nil {
		s.sess.CloseErr = err.Error()
	}
	s.owner.mu.Unlock()
}
