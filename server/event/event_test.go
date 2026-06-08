package event

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNoopEmit(t *testing.T) {
	if err := (Noop{}).Emit(context.Background(), Event{Type: "x"}); err != nil {
		t.Fatalf("noop emit returned error: %v", err)
	}
}

func TestNewWebhook_RejectsBadURL(t *testing.T) {
	cases := []string{"", "not a url", "ftp://example.com", "/relative"}
	for _, raw := range cases {
		if _, err := NewWebhook(raw, nil); err == nil {
			t.Errorf("expected error for url %q", raw)
		}
	}
}

func TestWebhookEmitter_PostsJSON(t *testing.T) {
	type received struct {
		ContentType string
		Body        Event
	}
	ch := make(chan received, 1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var evt Event
		if err := json.Unmarshal(body, &evt); err != nil {
			t.Errorf("server got invalid json: %v", err)
		}
		ch <- received{ContentType: r.Header.Get("Content-Type"), Body: evt}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	em, err := NewWebhook(srv.URL, nil)
	if err != nil {
		t.Fatalf("new webhook: %v", err)
	}

	if err := em.Emit(context.Background(), Event{
		Type:    TypeRuleHit,
		Payload: map[string]any{"url": "http://example.com"},
	}); err != nil {
		t.Fatalf("emit: %v", err)
	}

	select {
	case got := <-ch:
		if got.ContentType != "application/json" {
			t.Errorf("content-type = %q, want application/json", got.ContentType)
		}
		if got.Body.Type != TypeRuleHit {
			t.Errorf("type = %q, want %q", got.Body.Type, TypeRuleHit)
		}
		if got.Body.Timestamp.IsZero() {
			t.Errorf("timestamp not auto-filled")
		}
		if got.Body.Payload["url"] != "http://example.com" {
			t.Errorf("payload missing url, got %v", got.Body.Payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("webhook did not receive event within 2s")
	}
}

// 慢/挂掉的 webhook 不能阻塞调用方。
func TestWebhookEmitter_DoesNotBlockOnSlowServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 比 webhookTimeout (1s) 久，让客户端那边超时
		time.Sleep(3 * time.Second)
	}))
	defer srv.Close()

	em, err := NewWebhook(srv.URL, nil)
	if err != nil {
		t.Fatalf("new webhook: %v", err)
	}

	start := time.Now()
	for range 5 {
		if err := em.Emit(context.Background(), Event{Type: "x"}); err != nil {
			t.Fatalf("emit: %v", err)
		}
	}
	elapsed := time.Since(start)
	if elapsed > 200*time.Millisecond {
		t.Errorf("Emit blocked the caller: %v elapsed for 5 calls", elapsed)
	}
}
