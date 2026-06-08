// Package api — har.go：HAR 1.2 导出（GET /api/captures/export.har）。
package api

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// --------------------------------------------------------------------------
// HAR 1.2 数据结构（最小合规子集）
// --------------------------------------------------------------------------

type harLog struct {
	Version string     `json:"version"`
	Creator harCreator `json:"creator"`
	Entries []harEntry `json:"entries"`
}

type harCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type harEntry struct {
	StartedDateTime string     `json:"startedDateTime"`
	Time            int64      `json:"time"`
	Request         harRequest `json:"request"`
	Response        harResp    `json:"response"`
	Cache           struct{}   `json:"cache"`
	Timings         harTimings `json:"timings"`
}

type harRequest struct {
	Method      string       `json:"method"`
	URL         string       `json:"url"`
	HTTPVersion string       `json:"httpVersion"`
	Headers     []harNVPair  `json:"headers"`
	QueryString []harNVPair  `json:"queryString"`
	Cookies     []struct{}   `json:"cookies"`
	HeadersSize int          `json:"headersSize"`
	BodySize    int          `json:"bodySize"`
	PostData    *harPostData `json:"postData,omitempty"`
}

type harResp struct {
	Status      int          `json:"status"`
	StatusText  string       `json:"statusText"`
	HTTPVersion string       `json:"httpVersion"`
	Headers     []harNVPair  `json:"headers"`
	Cookies     []struct{}   `json:"cookies"`
	Content     harContent   `json:"content"`
	RedirectURL string       `json:"redirectURL"`
	HeadersSize int          `json:"headersSize"`
	BodySize    int          `json:"bodySize"`
}

type harContent struct {
	Size     int    `json:"size"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text,omitempty"`
}

type harPostData struct {
	MimeType string `json:"mimeType"`
	Text     string `json:"text"`
}

type harNVPair struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type harTimings struct {
	Send    int64 `json:"send"`
	Wait    int64 `json:"wait"`
	Receive int64 `json:"receive"`
}

// --------------------------------------------------------------------------
// 转换
// --------------------------------------------------------------------------

func headersToHAR(h map[string]string) []harNVPair {
	pairs := make([]harNVPair, 0, len(h))
	for k, v := range h {
		pairs = append(pairs, harNVPair{Name: k, Value: v})
	}
	return pairs
}

func queryToHAR(rawURL string) []harNVPair {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	pairs := make([]harNVPair, 0)
	for k, vals := range u.Query() {
		for _, v := range vals {
			pairs = append(pairs, harNVPair{Name: k, Value: v})
		}
	}
	return pairs
}

func mimeType(headers map[string]string) string {
	for k, v := range headers {
		if strings.EqualFold(k, "content-type") {
			if idx := strings.Index(v, ";"); idx >= 0 {
				return strings.TrimSpace(v[:idx])
			}
			return v
		}
	}
	return "application/octet-stream"
}

// captureItemToHAREntry 把一条抓包快照转换为 HAR entry。
func captureItemToHAREntry(item *CaptureItem) harEntry {
	startMS := item.StartTime
	endMS := item.EndTime
	duration := int64(-1)
	if endMS > 0 && endMS >= startMS {
		duration = endMS - startMS
	}

	startTime := time.UnixMilli(startMS).UTC().Format(time.RFC3339Nano)

	reqMime := mimeType(item.Req.Headers)
	var postData *harPostData
	if item.Req.Body != "" {
		postData = &harPostData{MimeType: reqMime, Text: item.Req.Body}
	}

	resMime := mimeType(item.Res.Headers)

	httpVer := "HTTP/1.1"
	if item.Protocol != "" {
		httpVer = item.Protocol
	}

	return harEntry{
		StartedDateTime: startTime,
		Time:            duration,
		Request: harRequest{
			Method:      item.Method,
			URL:         item.URL,
			HTTPVersion: httpVer,
			Headers:     headersToHAR(item.Req.Headers),
			QueryString: queryToHAR(item.URL),
			Cookies:     []struct{}{},
			HeadersSize: -1,
			BodySize:    item.Req.Size,
			PostData:    postData,
		},
		Response: harResp{
			Status:      item.Res.StatusCode,
			StatusText:  item.Res.StatusMessage,
			HTTPVersion: httpVer,
			Headers:     headersToHAR(item.Res.Headers),
			Cookies:     []struct{}{},
			Content: harContent{
				Size:     item.Res.Size,
				MimeType: resMime,
				Text:     item.Res.Body,
			},
			RedirectURL: "",
			HeadersSize: -1,
			BodySize:    item.Res.Size,
		},
		Timings: harTimings{Send: 0, Wait: duration, Receive: -1},
	}
}

// --------------------------------------------------------------------------
// GET /api/captures/export.har
// --------------------------------------------------------------------------

func (r *Router) handleExportHAR(w http.ResponseWriter, req *http.Request) {
	// 选中导出：?ids=id1,id2,id3
	var items []*CaptureItem
	if idsParam := req.URL.Query().Get("ids"); idsParam != "" {
		for _, id := range strings.Split(idsParam, ",") {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if item := r.capture.GetByID(id); item != nil {
				items = append(items, item)
			}
		}
	} else {
		// 全量导出
		cd := r.capture.List(0)
		for _, id := range cd.IDs {
			if item := cd.Data[id]; item != nil {
				items = append(items, item)
			}
		}
	}

	entries := make([]harEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, captureItemToHAREntry(item))
	}

	har := struct {
		Log harLog `json:"log"`
	}{
		Log: harLog{
			Version: "1.2",
			Creator: harCreator{Name: piperName, Version: piperVersion},
			Entries: entries,
		},
	}

	filename := fmt.Sprintf("piper-%s.har", time.Now().UTC().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	writeJSON(w, har)
}
