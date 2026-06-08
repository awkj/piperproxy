package proxy

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// autosaveRecord 是写到磁盘的 JSON 结构。
type autosaveRecord struct {
	TS  int64         `json:"ts"`
	Req autosaveReq   `json:"req"`
	Res autosaveRes   `json:"res"`
}

type autosaveReq struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type autosaveRes struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

// saveAutosave 把请求/响应序列化成 JSON 写入 dir/<ts>_<rand>.json。
// 设计为在 goroutine 里调用——失败只打日志，不影响主流程。
func saveAutosave(dir string, req *http.Request, reqBody []byte, statusCode int, resHeaders http.Header, resBody []byte) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}

	reqHeaders := make(map[string]string, len(req.Header))
	for k, vs := range req.Header {
		if len(vs) > 0 {
			reqHeaders[k] = vs[0]
		}
	}
	resH := make(map[string]string, len(resHeaders))
	for k, vs := range resHeaders {
		if len(vs) > 0 {
			resH[k] = vs[0]
		}
	}

	record := autosaveRecord{
		TS: time.Now().UnixMilli(),
		Req: autosaveReq{
			Method:  req.Method,
			URL:     req.URL.String(),
			Headers: reqHeaders,
			Body:    string(reqBody),
		},
		Res: autosaveRes{
			Status:  statusCode,
			Headers: resH,
			Body:    string(resBody),
		},
	}

	data, err := json.Marshal(record)
	if err != nil {
		return
	}

	var suffix [4]byte
	_, _ = rand.Read(suffix[:])
	fname := fmt.Sprintf("%d_%x.json", record.TS, suffix)
	_ = os.WriteFile(filepath.Join(dir, fname), data, 0o644)
}
