package proxy

import (
	"bufio"
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/awkj/piper/server/api"
	"github.com/awkj/piper/server/event"
	"github.com/awkj/piper/server/internal/procattr"
	"github.com/awkj/piper/server/rules"
	"github.com/awkj/piper/server/script"
	"github.com/awkj/piper/server/throttle"
	"github.com/klauspost/compress/zstd"
)

// decompressForCapture 按 Content-Encoding 解压 body，仅用于抓包快照。
// 转发给客户端的 body 不动（保留原压缩字节，浏览器会自己解压）。
// 解压失败 / 不识别的编码 → 原样返回，避免静默吃掉数据。
// brotli/zstd 暂不支持（需要额外依赖），返回原样并由前端按需提示。
func decompressForCapture(buf []byte, encoding string) []byte {
	if len(buf) == 0 {
		return buf
	}
	enc := strings.ToLower(strings.TrimSpace(encoding))
	// 多重编码取最后一层（一般只有一层）
	if i := strings.LastIndex(enc, ","); i >= 0 {
		enc = strings.TrimSpace(enc[i+1:])
	}
	switch enc {
	case "", "identity":
		return buf
	case "gzip", "x-gzip":
		gr, err := gzip.NewReader(bytes.NewReader(buf))
		if err != nil {
			return buf
		}
		defer gr.Close()
		// 不能用 io.ReadAll —— 一旦尾部 EOF/CRC 校验出错就丢掉所有已解出的数据。
		// 改用 ReadFull-style 增量读：只要解出过任何字节，错就算，部分数据仍然返回。
		var out bytes.Buffer
		_, err = io.Copy(&out, io.LimitReader(gr, captureBodyLimit+1))
		if out.Len() == 0 {
			return buf
		}
		_ = err // 容忍尾部错误（截断 / CRC 不匹配）
		return out.Bytes()
	case "deflate":
		// HTTP 历史问题：deflate 既可能是 raw flate 也可能是 zlib。
		// 先按 zlib 试一次（更常见）；失败再按 raw flate。
		if zr, err := zlib.NewReader(bytes.NewReader(buf)); err == nil {
			defer zr.Close()
			var out bytes.Buffer
			_, _ = io.Copy(&out, io.LimitReader(zr, captureBodyLimit+1))
			if out.Len() > 0 {
				return out.Bytes()
			}
		}
		fr := flate.NewReader(bytes.NewReader(buf))
		defer fr.Close()
		var out bytes.Buffer
		_, _ = io.Copy(&out, io.LimitReader(fr, captureBodyLimit+1))
		if out.Len() > 0 {
			return out.Bytes()
		}
		return buf
	case "br":
		br := brotli.NewReader(bytes.NewReader(buf))
		var out bytes.Buffer
		_, _ = io.Copy(&out, io.LimitReader(br, captureBodyLimit+1))
		if out.Len() == 0 {
			return buf
		}
		return out.Bytes()
	case "zstd":
		zr, err := zstd.NewReader(bytes.NewReader(buf))
		if err != nil {
			return buf
		}
		defer zr.Close()
		var out bytes.Buffer
		_, _ = io.Copy(&out, io.LimitReader(zr, captureBodyLimit+1))
		if out.Len() == 0 {
			return buf
		}
		return out.Bytes()
	default:
		return buf
	}
}

// captureBodyLimit 是采集 body 的最大字节数（8 MiB）。
// 选 8 MiB 是因为大多数 JSON / 文本响应都在此范围内；超出会被截断。
const captureBodyLimit = 8 << 20

// autosaveSaveDir 返回此次请求应写入的 autosave 目录：
// 规则级别优先，其次全局 autoSaveDir，两者都空则不启用。
func (h *Handler) autosaveSaveDir(plan *rulePlan) string {
	if !plan.ignore && plan.autosaveDir != "" {
		return plan.autosaveDir
	}
	return h.autoSaveDir
}

// hopHeaders 是逐跳头（RFC 7230 §6.1），转发时必须剥除。
var hopHeaders = []string{
	"Connection",
	"Proxy-Connection",
	"Keep-Alive",
	"Proxy-Authenticate",
	"Proxy-Authorization",
	"Te",
	"Trailer",
	"Transfer-Encoding",
	"Upgrade",
}

// handleForward 处理普通 HTTP 转发（明文 HTTP 和 MITM 解密后的 HTTPS 都走这里）。
func (h *Handler) handleForward(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	if r.URL.Scheme == "" {
		r.URL.Scheme = "http"
	}
	if r.URL.Host == "" {
		r.URL.Host = r.Host
	}

	// Offline 模式：立即拒绝
	if throttle.Global.IsOffline() {
		http.Error(w, "piper: offline (network throttle)", http.StatusServiceUnavailable)
		return
	}

	action := h.rules.Match(r.Context(), r)
	plan := h.planFromAction(action)
	if action != nil && len(action.Directives) > 0 {
		h.emitRuleHit(r, action)
	}

	// gql://：在 body 读取后验证 GraphQL operationName；不匹配时将 plan 降级为 Nop。
	if !plan.ignore && plan.gqlFilter != "" {
		// body 预读（此时 reqBodyBuf 尚未填充，需要提前 peek）。
		var gqlOpName string
		if r.Body != nil && r.Body != http.NoBody {
			buf, _ := io.ReadAll(io.LimitReader(r.Body, captureBodyLimit+1))
			r.Body = io.NopCloser(bytes.NewReader(buf))
			gqlOpName = parseGraphQLOperationName(buf)
		}
		if !gqlMatch(plan.gqlFilter, gqlOpName) {
			plan = &rulePlan{} // 过滤未命中：降级为 Nop plan
		}
	}

	// plugin:// 脚本接管：脚本 handler 全权负责转发，不走 shortCircuit / RoundTrip。
	if !plan.ignore && plan.scriptPath != "" {
		ctx := script.WithScriptPath(r.Context(), plan.scriptPath)
		if sh := h.scripts.Resolve(ctx, r); sh != nil {
			sh.ServeHTTP(w, r.WithContext(ctx))
			return
		}
	}

	// 是否需要采集 body（capture 或 autosave 任一启用即需要）
	needBody := h.capture != nil || h.autosaveSaveDir(plan) != ""

	// 缓冲请求 body
	var reqBodyBuf []byte
	if needBody && r.Body != nil && r.Body != http.NoBody {
		buf, _ := io.ReadAll(io.LimitReader(r.Body, captureBodyLimit+1))
		reqBodyBuf = buf
		r.Body = io.NopCloser(bytes.NewReader(buf))
	}

	if !plan.ignore {
		if h.shortCircuit(w, plan) {
			return
		}
	}

	// xfile：文件存在则 serve，否则继续透传上游。
	if !plan.ignore && plan.mockXFile != "" {
		if _, statErr := os.Stat(plan.mockXFile); statErr == nil {
			serveMockFile(w, plan.mockXFile)
			return
		}
	}

	// dir://：按 URL 路径在本地目录查文件；不存在时 fall-through 到上游。
	if !plan.ignore && plan.dirMapRoot != "" {
		if local, ok := resolveDirLocalPath(plan.dirMapRoot, plan.dirMapPattern, r.URL.Path); ok {
			serveMockFile(w, local)
			return
		}
		// miss → fall through
	}

	outReq := r.Clone(r.Context())
	outReq.RequestURI = ""
	// Clone 共享同一 body reader；重置为独立的 reader 保证 forwarding 正确。
	if len(reqBodyBuf) > 0 {
		outReq.Body = io.NopCloser(bytes.NewReader(reqBodyBuf))
		outReq.ContentLength = int64(len(reqBodyBuf))
	}
	for _, k := range hopHeaders {
		outReq.Header.Del(k)
	}
	if !plan.ignore {
		applyRequestPlan(outReq, plan)
	}

	var transport http.RoundTripper = h.transport
	if !plan.ignore {
		if alt := h.applyPlanTransport(plan); alt != nil {
			transport = alt
		}
	}

	resp, err := transport.RoundTrip(outReq)
	if err != nil {
		h.logger.Warn("forward roundtrip failed", "url", r.URL.String(), "err", err)
		http.Error(w, "piper: upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		if isHopHeader(k) {
			continue
		}
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	if !plan.ignore {
		applyResponseHeaderPlan(w.Header(), plan)
	}

	statusCode := resp.StatusCode
	if !plan.ignore && plan.replaceStatus != 0 {
		statusCode = plan.replaceStatus
	}
	w.WriteHeader(statusCode)

	// 响应 body：按需 tee 到缓冲区；应用下行限速（服务器→客户端）
	throttledBody := throttle.Global.WrapReader(r.Context(), resp.Body)
	var resBodyBuf []byte
	if needBody {
		buf := &bytes.Buffer{}
		_, _ = io.Copy(w, io.TeeReader(io.LimitReader(throttledBody, captureBodyLimit+1), buf))
		_, _ = io.Copy(w, throttledBody) // 超出 limit 的部分继续转发
		resBodyBuf = buf.Bytes()
	} else {
		_, _ = io.Copy(w, throttledBody)
	}

	endTime := time.Now()

	// 我们多读了 1 字节探测：buf 长度 == limit+1 即上游 body 超过 limit 被截断。
	reqTruncated := len(reqBodyBuf) > captureBodyLimit
	resTruncated := len(resBodyBuf) > captureBodyLimit
	if reqTruncated {
		reqBodyBuf = reqBodyBuf[:captureBodyLimit]
	}
	if resTruncated {
		resBodyBuf = resBodyBuf[:captureBodyLimit]
	}

	// 抓包前把 body 解压成原始字节（gzip / deflate / br / zstd）。
	// 客户端那一份已经写出，里面仍然是上游原始压缩字节，浏览器会自己解。
	captureResBody := decompressForCapture(resBodyBuf, resp.Header.Get("Content-Encoding"))
	captureReqBody := decompressForCapture(reqBodyBuf, r.Header.Get("Content-Encoding"))

	// Autosave（异步）
	if dir := h.autosaveSaveDir(plan); dir != "" {
		go saveAutosave(dir, r, captureReqBody, statusCode, resp.Header, captureResBody)
	}

	// Capture
	if h.capture != nil {
		item := buildCaptureItem(r, captureReqBody, resp, captureResBody, statusCode, startTime, endTime)
		item.Req.Truncated = reqTruncated
		item.Res.Truncated = resTruncated
		h.capture.Add(item)
	}
}

// lookupProc 以非阻塞方式查进程信息（走缓存，首次 miss 也很快返回）。
func lookupProc(remoteAddr string) (name string, pid int) {
	info := procattr.Lookup(remoteAddr)
	return info.Name, info.PID
}

// buildCaptureItem 从当次请求/响应数据构建 CaptureItem。
func buildCaptureItem(
	r *http.Request,
	reqBody []byte,
	resp *http.Response,
	resBody []byte,
	statusCode int,
	start, end time.Time,
) *api.CaptureItem {
	clientIP := r.RemoteAddr
	if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		clientIP = h
	}
	hostname := r.Host
	if i := strings.LastIndex(hostname, ":"); i >= 0 {
		hostname = hostname[:i]
	}
	reqType := shortTypeFromContentType(r.Header.Get("Content-Type"))
	resType := shortTypeFromContentType(resp.Header.Get("Content-Type"))

	procName, procID := lookupProc(r.RemoteAddr)

	// GraphQL operationName（仅对 POST application/json 解析）
	var gqlOp string
	if r.Method == http.MethodPost && len(reqBody) > 0 {
		ct := strings.ToLower(r.Header.Get("Content-Type"))
		if strings.HasPrefix(ct, "application/json") || ct == "" {
			gqlOp = parseGraphQLOperationName(reqBody)
		}
	}

	return &api.CaptureItem{
		URL:             r.URL.String(),
		Hostname:        hostname,
		Path:            r.URL.RequestURI(),
		Method:          r.Method,
		Protocol:        r.Proto,
		ClientIP:        clientIP,
		StartTime:       start.UnixMilli(),
		EndTime:         end.UnixMilli(),
		ContentEncoding: resp.Header.Get("Content-Encoding"),
		Type:            resType,
		ReqType:         reqType,
		ResType:         resType,
		ProcessName:     procName,
		ProcessID:       procID,
		GraphQLOp:       gqlOp,
		Req: api.CaptureReq{
			Method:  r.Method,
			Headers: flattenHdrs(r.Header),
			Body:    string(reqBody),
			Size:    len(reqBody),
		},
		Res: api.CaptureRes{
			StatusCode:    statusCode,
			StatusMessage: http.StatusText(statusCode),
			Headers:       flattenHdrs(resp.Header),
			Body:          string(resBody),
			Size:          len(resBody),
		},
	}
}

// shortTypeFromContentType 把 RFC 7231 Content-Type 头映射到短类别字符串，
// 用于网络列表的 Type 列展示和过滤（json / image / css / js / html / xml / font / video / audio / wasm / form / text / —）。
// 输入示例：
//
//	application/json; charset=utf-8        → "json"
//	image/png                              → "image"
//	text/html; charset=utf-8               → "html"
//	application/javascript                 → "js"
//	application/x-www-form-urlencoded      → "form"
//	multipart/form-data; boundary=...      → "form"
//	application/octet-stream               → ""
//	""                                     → ""
//
// 选 "短类别" 而非完整 mime 子类是为了便于在窄列里展示并匹配 DevTools 的习惯。
func shortTypeFromContentType(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if ct == "" {
		return ""
	}
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}
	switch {
	case strings.HasPrefix(ct, "image/"):
		return "image"
	case strings.HasPrefix(ct, "video/"):
		return "video"
	case strings.HasPrefix(ct, "audio/"):
		return "audio"
	case strings.HasPrefix(ct, "font/"), strings.HasSuffix(ct, "font-woff"), strings.HasSuffix(ct, "font-woff2"), ct == "application/vnd.ms-fontobject":
		return "font"
	}
	switch ct {
	case "application/json", "text/json", "application/problem+json", "application/ld+json", "application/manifest+json":
		return "json"
	case "application/javascript", "application/x-javascript", "text/javascript":
		return "js"
	case "text/css":
		return "css"
	case "text/html", "application/xhtml+xml":
		return "html"
	case "text/xml", "application/xml", "application/atom+xml", "application/rss+xml":
		return "xml"
	case "application/wasm":
		return "wasm"
	case "application/x-www-form-urlencoded":
		return "form"
	case "text/event-stream":
		return "sse"
	case "text/plain":
		return "text"
	}
	switch {
	case strings.HasSuffix(ct, "+json"):
		return "json"
	case strings.HasSuffix(ct, "+xml"):
		return "xml"
	case strings.HasPrefix(ct, "multipart/form-data"):
		return "form"
	case strings.HasPrefix(ct, "text/"):
		return "text"
	}
	return ""
}

// flattenHdrs 把 http.Header（多值 map）转为单值 map，多值用 ", " 连接。
func flattenHdrs(h http.Header) map[string]string {
	m := make(map[string]string, len(h))
	for k, vs := range h {
		m[k] = strings.Join(vs, ", ")
	}
	return m
}

// shortCircuit 处理 redirect / mock 类 op，命中则写完响应返回 true。
func (h *Handler) shortCircuit(w http.ResponseWriter, plan *rulePlan) bool {
	if plan.redirect != "" {
		applyResponseHeaderPlan(w.Header(), plan)
		w.Header().Set("Location", plan.redirect)
		code := plan.redirectCode
		if code == 0 {
			code = http.StatusFound
		}
		w.WriteHeader(code)
		return true
	}
	if plan.mockStatus != 0 {
		applyResponseHeaderPlan(w.Header(), plan)
		w.WriteHeader(plan.mockStatus)
		if len(plan.mockBody) > 0 {
			_, _ = w.Write(plan.mockBody)
		}
		return true
	}
	if plan.mockFile != "" {
		serveMockFile(w, plan.mockFile)
		return true
	}
	if plan.mockRawFile != "" {
		serveRawFile(w, plan.mockRawFile)
		return true
	}
	return false
}

// serveMockFile 读文件、推断 Content-Type、返回 200 响应。
func serveMockFile(w http.ResponseWriter, path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, "piper: read mock file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	ct := mime.TypeByExtension(filepath.Ext(path))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// serveRawFile 把文件当成完整 HTTP 响应（状态行 + headers + body）解析后写回客户端。
func serveRawFile(w http.ResponseWriter, path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, "piper: read raw file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	resp, err := http.ReadResponse(bufio.NewReader(bytes.NewReader(data)), nil)
	if err != nil {
		http.Error(w, "piper: parse raw response: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// resolveDirLocalPath 根据 dirMapRoot + 匹配 pattern 和请求 urlPath 计算本地文件路径。
// 返回 (localPath, true) 若文件存在且无目录穿越；否则返回 ("", false)。
func resolveDirLocalPath(root, pattern, urlPath string) (string, bool) {
	// 从 pattern 提取固定路径前缀（去掉 scheme://host 和通配符部分）。
	patternPath := extractPatternPath(pattern)

	// 把 urlPath 相对于 patternPath 的部分取出。
	rel := urlPath
	if patternPath != "" && strings.HasPrefix(urlPath, patternPath) {
		rel = urlPath[len(patternPath):]
	}
	// 去掉开头的 /
	rel = strings.TrimPrefix(rel, "/")

	// 拼接本地路径并防止目录穿越。
	local := filepath.Join(root, rel)
	clean := filepath.Clean(local)
	rootClean := filepath.Clean(root)
	if !strings.HasPrefix(clean, rootClean+string(filepath.Separator)) && clean != rootClean {
		return "", false // 目录穿越
	}
	if _, err := os.Stat(clean); err != nil {
		return "", false // 文件不存在 → fall-through
	}
	return clean, true
}

// extractPatternPath 从规则 pattern 字符串提取固定路径前缀（不含通配符的部分）。
// 示例：
//
//	"api.example.com/build/v1/*" → "/build/v1/"
//	"api.example.com"             → "/"
//	"api.example.com/v1"          → "/v1"
func extractPatternPath(pattern string) string {
	// 去掉 scheme://
	if idx := strings.Index(pattern, "://"); idx >= 0 {
		pattern = pattern[idx+3:]
	}
	// 找第一个 /，取 path 部分
	slashIdx := strings.Index(pattern, "/")
	if slashIdx < 0 {
		return "/"
	}
	path := pattern[slashIdx:]
	// 截断到第一个通配符之前（* ~ ?）
	if wIdx := strings.IndexAny(path, "*~?"); wIdx >= 0 {
		path = path[:wIdx]
	}
	return path
}

// applyRequestPlan 在 outReq 上应用 method 改写 + req header add/del。
// add 走"set" 语义（先 Del 再 Add）以匹配 whistle 的覆盖语义。
func applyRequestPlan(outReq *http.Request, plan *rulePlan) {
	if plan.method != "" {
		outReq.Method = plan.method
	}
	for _, k := range plan.delReqHeaders {
		outReq.Header.Del(k)
	}
	for k, vs := range plan.addReqHeaders {
		outReq.Header.Del(k)
		for _, v := range vs {
			outReq.Header.Add(k, v)
		}
	}
}

// applyResponseHeaderPlan 在已经从上游 copy 完的 response header 上做 add/del。
func applyResponseHeaderPlan(h http.Header, plan *rulePlan) {
	for _, k := range plan.delResHeaders {
		h.Del(k)
	}
	for k, vs := range plan.addResHeaders {
		h.Del(k)
		for _, v := range vs {
			h.Add(k, v)
		}
	}
}

func isHopHeader(name string) bool {
	return slices.Contains(hopHeaders, name)
}

// emitRuleHit 把规则命中事件推给 SPI Emitter。
// 失败只 debug 日志（默认 Noop 不会失败；webhook 实现自己 fire-and-forget）。
func (h *Handler) emitRuleHit(r *http.Request, action *rules.Action) {
	if h.emitter == nil {
		return
	}
	ops := make([]string, 0, len(action.Directives))
	for _, d := range action.Directives {
		ops = append(ops, d.Op)
	}
	urlStr := ""
	if r.URL != nil {
		urlStr = r.URL.String()
	}
	if err := h.emitter.Emit(r.Context(), event.Event{
		Type: event.TypeRuleHit,
		Payload: map[string]any{
			"url":    urlStr,
			"method": r.Method,
			"host":   r.Host,
			"ops":    ops,
			"tags":   action.Tags,
		},
	}); err != nil {
		h.logger.Debug("emit rule.hit failed", "err", err)
	}
}
