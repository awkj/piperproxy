package event

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

// webhookTimeout 单次 POST 上限。超时后请求被丢弃；不重试。
const webhookTimeout = 1 * time.Second

// WebhookEmitter 把每个 Event 异步 POST 成 JSON 到固定 URL。
// 失败只 log，不阻塞 hot path（fire-and-forget）。
type WebhookEmitter struct {
	url    string
	client *http.Client
	logger *slog.Logger
}

// NewWebhook 构造一个向 rawURL 推送 JSON 的 Emitter。
// rawURL 必须是 http:// 或 https:// 的绝对 URL。
func NewWebhook(rawURL string, logger *slog.Logger) (*WebhookEmitter, error) {
	if rawURL == "" {
		return nil, errors.New("event: webhook url is empty")
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("event: webhook url must be http(s)")
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &WebhookEmitter{
		url:    rawURL,
		client: &http.Client{Timeout: webhookTimeout},
		logger: logger,
	}, nil
}

// Emit 序列化 evt 后异步 POST 到目标 URL。
// 调用方的 ctx 只用于序列化前的取消；HTTP 请求自带 webhookTimeout，与 ctx 解耦
// 是为了避免 hot path 的短 ctx（例如已 done 的请求 ctx）连带丢事件。
func (e *WebhookEmitter) Emit(ctx context.Context, evt Event) error {
	if evt.Timestamp.IsZero() {
		evt.Timestamp = time.Now()
	}
	body, err := json.Marshal(evt)
	if err != nil {
		return err
	}
	go e.post(body, evt.Type)
	return nil
}

func (e *WebhookEmitter) post(body []byte, evtType string) {
	ctx, cancel := context.WithTimeout(context.Background(), webhookTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.url, bytes.NewReader(body))
	if err != nil {
		e.logger.Warn("event webhook build request failed", "type", evtType, "err", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		e.logger.Warn("event webhook post failed", "type", evtType, "err", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		e.logger.Warn("event webhook returned error status",
			"type", evtType, "status", resp.StatusCode)
	}
}
