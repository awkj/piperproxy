package api_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/awkj/piper/server/api"
	"github.com/awkj/piper/server/ws"
)

func TestWSHook_SessionsCaptureFrames(t *testing.T) {
	h := api.NewWSHook(8, 100)

	r := &http.Request{URL: mustURL(t, "wss://chat.example.com/room/1")}
	sess := h.NewSession(r)
	sess.OnHandshake(r)
	sess.OnFrame(ws.Frame{FromClient: true, Opcode: ws.OpText, Payload: []byte("hi")})
	sess.OnFrame(ws.Frame{FromClient: false, Opcode: ws.OpBinary, Payload: []byte{1, 2, 3, 4}})
	sess.OnClose(nil)

	all := h.Sessions()
	if len(all) != 1 {
		t.Fatalf("Sessions len = %d", len(all))
	}
	got := all[0]
	if got.URL != "wss://chat.example.com/room/1" {
		t.Errorf("url = %q", got.URL)
	}
	if len(got.Frames) != 2 {
		t.Fatalf("frames = %d", len(got.Frames))
	}
	if got.Frames[0].Text != "hi" || !got.Frames[0].FromClient || got.Frames[0].Length != 2 {
		t.Errorf("frame 0 = %+v", got.Frames[0])
	}
	if got.Frames[1].Text != "" || got.Frames[1].FromClient || got.Frames[1].Length != 4 {
		t.Errorf("frame 1 = %+v", got.Frames[1])
	}
	if got.EndTime == 0 {
		t.Errorf("EndTime should be set after OnClose")
	}
}

func TestWSHook_PerSessionIsolation(t *testing.T) {
	h := api.NewWSHook(8, 100)
	a := h.NewSession(&http.Request{URL: mustURL(t, "wss://a.test/")})
	b := h.NewSession(&http.Request{URL: mustURL(t, "wss://b.test/")})

	a.OnFrame(ws.Frame{FromClient: true, Opcode: ws.OpText, Payload: []byte("apple")})
	b.OnFrame(ws.Frame{FromClient: true, Opcode: ws.OpText, Payload: []byte("banana")})
	b.OnFrame(ws.Frame{FromClient: false, Opcode: ws.OpText, Payload: []byte("blue")})

	all := h.Sessions()
	if len(all) != 2 {
		t.Fatalf("want 2 sessions, got %d", len(all))
	}
	// 顺序：先 a 后 b
	if got := h.Get(all[0].ID); got == nil || len(got.Frames) != 1 || got.Frames[0].Text != "apple" {
		t.Errorf("a session wrong: %+v", got)
	}
	if got := h.Get(all[1].ID); got == nil || len(got.Frames) != 2 {
		t.Errorf("b session wrong: %+v", got)
	}
}

func TestWSHook_FramesPerSessionLimitTruncates(t *testing.T) {
	h := api.NewWSHook(8, 3) // 每会话最多 3 帧
	s := h.NewSession(&http.Request{URL: mustURL(t, "wss://flood.test/")})
	for i := 0; i < 10; i++ {
		s.OnFrame(ws.Frame{Opcode: ws.OpText, Payload: []byte("x")})
	}
	got := h.Sessions()[0]
	if len(got.Frames) != 3 {
		t.Errorf("frames len = %d, want 3", len(got.Frames))
	}
	if !got.Truncated {
		t.Errorf("Truncated should be true")
	}
}

func TestWSHook_SessionCapEvictsOldest(t *testing.T) {
	h := api.NewWSHook(2, 16)
	h.NewSession(&http.Request{URL: mustURL(t, "wss://1.test/")})
	h.NewSession(&http.Request{URL: mustURL(t, "wss://2.test/")})
	h.NewSession(&http.Request{URL: mustURL(t, "wss://3.test/")})

	all := h.Sessions()
	if len(all) != 2 {
		t.Fatalf("want 2 surviving sessions, got %d", len(all))
	}
	if all[0].URL != "wss://2.test/" || all[1].URL != "wss://3.test/" {
		t.Errorf("eviction order wrong; got %q, %q", all[0].URL, all[1].URL)
	}
}

func TestWSHook_OnCloseRecordsError(t *testing.T) {
	h := api.NewWSHook(8, 100)
	s := h.NewSession(&http.Request{URL: mustURL(t, "wss://err.test/")})
	s.OnClose(errors.New("upstream RST"))
	got := h.Sessions()[0]
	if got.CloseErr != "upstream RST" {
		t.Errorf("CloseErr = %q", got.CloseErr)
	}
}

func TestRouter_GetFramesEndpoint(t *testing.T) {
	r := api.NewRouter("")
	hook := r.WSHook()

	// 先存 1 条会话 + 几帧
	sess := hook.NewSession(&http.Request{URL: mustURL(t, "wss://chat/")})
	sess.OnFrame(ws.Frame{FromClient: true, Opcode: ws.OpText, Payload: []byte("hello")})
	sess.OnClose(nil)

	// GET /api/ws/sessions → 会话概要列表
	resp := getJSON(t, r, "/api/ws/sessions")
	sessions, _ := resp["sessions"].([]any)
	if len(sessions) != 1 {
		t.Fatalf("session summary count = %d", len(sessions))
	}
	first, _ := sessions[0].(map[string]any)
	id, _ := first["id"].(string)
	if id == "" {
		t.Fatalf("session id empty")
	}

	// GET /api/captures/:id/frames → 帧详情
	resp2 := getJSON(t, r, "/api/captures/"+id+"/frames")
	got, _ := resp2["frames"].([]any)
	if len(got) != 1 {
		t.Fatalf("frames count = %d", len(got))
	}
	frame := got[0].(map[string]any)
	if frame["text"] != "hello" {
		t.Errorf("frame text = %v", frame["text"])
	}
}

// ---- helpers ----

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	return u
}

func getJSON(t *testing.T, h http.Handler, path string) map[string]any {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("%s status = %d body=%s", path, rr.Code, rr.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v body=%s", err, rr.Body.String())
	}
	return out
}
