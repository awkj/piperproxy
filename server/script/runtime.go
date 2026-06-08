package script

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/grafana/sobek"
)

// engine 是脚本运行时的核心，负责加载脚本、创建 VM、执行 hook。
type engine struct {
	resolver *resolver
	sandbox  *Sandbox
	logger   *slog.Logger
}

func newEngine(sandbox *Sandbox, logger *slog.Logger) *engine {
	return &engine{
		resolver: newResolver(sandbox, logger),
		sandbox:  sandbox,
		logger:   logger,
	}
}

// handler 是每个脚本请求的实际处理器。
// 每次 ServeHTTP 创建独立 Sobek VM，避免跨请求状态污染。
type scriptHandler struct {
	module  *sobek.SourceTextModuleRecord
	e       *engine
	timeout time.Duration
}

func (h *scriptHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	vm := sobek.New()

	// 评估模块（链接所有 import，实例化所有 piper:* 内置模块）
	evalPromise := vm.CyclicModuleRecordEvaluate(h.module, h.e.resolver.resolve)
	// 抽干微任务队列（让 await 能正常工作）
	_, _ = vm.RunString("")
	if evalPromise.State() == sobek.PromiseStateRejected {
		h.e.logger.Error("script: module evaluation failed", "err", evalPromise.Result())
		http.Error(w, "script: module init error", http.StatusInternalServerError)
		return
	}
	if evalPromise.State() == sobek.PromiseStatePending {
		h.e.logger.Error("script: module evaluation still pending (TLA not supported)")
		http.Error(w, "script: top-level await not supported", http.StatusInternalServerError)
		return
	}

	instance := vm.GetModuleInstance(h.module)
	if instance == nil {
		http.Error(w, "script: module not evaluated", http.StatusInternalServerError)
		return
	}

	// 检查 default export：作为全量 handler 替代 onRequest/onResponse 分离模式
	if defVal := instance.GetBindingValue("default"); defVal != nil && !sobek.IsUndefined(defVal) {
		if fn, ok := sobek.AssertFunction(defVal); ok {
			h.runDefaultHook(w, r, vm, fn)
			return
		}
	}

	// 读取请求 body
	var reqBodyBytes []byte
	if r.Body != nil {
		var err error
		reqBodyBytes, err = io.ReadAll(r.Body)
		_ = r.Body.Close()
		if err != nil {
			http.Error(w, "script: read request body failed", http.StatusBadGateway)
			return
		}
	}

	// 构造 reqCtx JS 对象
	reqCtx := buildReqCtx(vm, r, reqBodyBytes)

	// 调用 onRequest
	if onReq := instance.GetBindingValue("onRequest"); onReq != nil && !sobek.IsUndefined(onReq) {
		if fn, ok := sobek.AssertFunction(onReq); ok {
			if err := callHook(vm, fn, vm.ToValue(reqCtx), h.timeout); err != nil {
				h.e.logger.Error("script: onRequest error", "err", err)
				http.Error(w, "script: onRequest error: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	// 读回 reqCtx 变更，构造上游请求
	outReq := r.Clone(r.Context())
	outReq.RequestURI = ""
	applyReqCtxToRequest(vm, reqCtx, outReq)
	// 重置 body（脚本可能修改了 ctx.body）
	newBody := reqCtx.Get("body")
	if newBody != nil && !sobek.IsUndefined(newBody) {
		b := []byte(newBody.String())
		outReq.Body = io.NopCloser(bytes.NewReader(b))
		outReq.ContentLength = int64(len(b))
	} else {
		outReq.Body = io.NopCloser(bytes.NewReader(reqBodyBytes))
		outReq.ContentLength = int64(len(reqBodyBytes))
	}

	// 转发到上游
	resp, err := http.DefaultTransport.RoundTrip(outReq)
	if err != nil {
		h.e.logger.Warn("script: upstream error", "err", err)
		http.Error(w, "script: upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// 读取响应 body
	resBodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "script: read response body failed", http.StatusBadGateway)
		return
	}

	// 构造 resCtx JS 对象
	resCtx := buildResCtx(vm, resp, resBodyBytes)

	// 调用 onResponse
	if onRes := instance.GetBindingValue("onResponse"); onRes != nil && !sobek.IsUndefined(onRes) {
		if fn, ok := sobek.AssertFunction(onRes); ok {
			if err := callHook(vm, fn, vm.ToValue(resCtx), h.timeout); err != nil {
				h.e.logger.Error("script: onResponse error", "err", err)
				http.Error(w, "script: onResponse error: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	// 写回响应
	writeResponse(w, vm, resCtx, resp, resBodyBytes)
}

// runDefaultHook 处理 `export default async function(ctx)` 的单 handler 模式。
// ctx 同时包含 req 和 res 字段，由脚本自行决定行为。
func (h *scriptHandler) runDefaultHook(w http.ResponseWriter, r *http.Request, vm *sobek.Runtime, fn sobek.Callable) {
	var reqBodyBytes []byte
	if r.Body != nil {
		reqBodyBytes, _ = io.ReadAll(r.Body)
		_ = r.Body.Close()
	}
	ctx := buildReqCtx(vm, r, reqBodyBytes)

	if err := callHook(vm, fn, vm.ToValue(ctx), h.timeout); err != nil {
		h.e.logger.Error("script: default hook error", "err", err)
		http.Error(w, "script error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 若脚本设置了 ctx.status/body，直接返回 mock 响应；否则转发
	statusVal := ctx.Get("status")
	if statusVal != nil && !sobek.IsUndefined(statusVal) && statusVal.ToInteger() > 0 {
		writeCtxMockResponse(w, vm, ctx)
		return
	}

	// 未设置 status：执行正常转发流程（无上游修改）
	outReq := r.Clone(r.Context())
	outReq.RequestURI = ""
	outReq.Body = io.NopCloser(bytes.NewReader(reqBodyBytes))
	outReq.ContentLength = int64(len(reqBodyBytes))

	resp, err := http.DefaultTransport.RoundTrip(outReq)
	if err != nil {
		http.Error(w, "script: upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	resBodyBytes, _ := io.ReadAll(resp.Body)

	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(resBodyBytes)
}

// callHook 调用 JS hook 函数，并抽干微任务队列直到 Promise fulfilled 或超时。
func callHook(vm *sobek.Runtime, fn sobek.Callable, arg sobek.Value, timeout time.Duration) error {
	result, err := fn(sobek.Undefined(), arg)
	if err != nil {
		return err
	}
	// 抽干微任务（async hook 需要多轮 pump）
	deadline := time.Now().Add(timeout)
	for {
		_, _ = vm.RunString("") // pump microtasks
		p, ok := result.Export().(*sobek.Promise)
		if !ok {
			break // 同步 hook，直接结束
		}
		switch p.State() {
		case sobek.PromiseStateFulfilled:
			return nil
		case sobek.PromiseStateRejected:
			return fmt.Errorf("%v", p.Result())
		default:
			if time.Now().After(deadline) {
				return fmt.Errorf("script: hook timeout")
			}
		}
	}
	return nil
}

// buildReqCtx 把 http.Request 转成 Sobek JS 对象（{ url, method, headers, body }）。
func buildReqCtx(vm *sobek.Runtime, r *http.Request, body []byte) *sobek.Object {
	obj := vm.NewObject()
	_ = obj.Set("url", r.URL.String())
	_ = obj.Set("method", r.Method)
	_ = obj.Set("body", string(body))

	headers := vm.NewObject()
	for k, vs := range r.Header {
		_ = headers.Set(k, vs[0])
	}
	_ = obj.Set("headers", headers)
	return obj
}

// buildResCtx 把 http.Response 转成 Sobek JS 对象（{ status, headers, body }）。
func buildResCtx(vm *sobek.Runtime, resp *http.Response, body []byte) *sobek.Object {
	obj := vm.NewObject()
	_ = obj.Set("status", resp.StatusCode)
	_ = obj.Set("body", string(body))

	headers := vm.NewObject()
	for k, vs := range resp.Header {
		_ = headers.Set(k, vs[0])
	}
	_ = obj.Set("headers", headers)
	return obj
}

// applyReqCtxToRequest 读回 reqCtx 里 method/headers 的改动并写到 outReq。
func applyReqCtxToRequest(vm *sobek.Runtime, ctx *sobek.Object, outReq *http.Request) {
	if m := ctx.Get("method"); m != nil && !sobek.IsUndefined(m) {
		outReq.Method = m.String()
	}
	if h := ctx.Get("headers"); h != nil && !sobek.IsUndefined(h) {
		hObj := h.ToObject(vm)
		outReq.Header = make(http.Header)
		for _, k := range hObj.Keys() {
			outReq.Header.Set(k, hObj.Get(k).String())
		}
	}
}

// writeResponse 把 resCtx 的改动（status/headers/body）写到 ResponseWriter。
func writeResponse(w http.ResponseWriter, vm *sobek.Runtime, resCtx *sobek.Object, orig *http.Response, origBody []byte) {
	// headers：先写原始，再覆盖脚本修改
	for k, vs := range orig.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	if h := resCtx.Get("headers"); h != nil && !sobek.IsUndefined(h) {
		hObj := h.ToObject(vm)
		for _, k := range hObj.Keys() {
			w.Header().Set(k, hObj.Get(k).String())
		}
	}

	statusCode := orig.StatusCode
	if s := resCtx.Get("status"); s != nil && !sobek.IsUndefined(s) {
		if n := int(s.ToInteger()); n > 0 {
			statusCode = n
		}
	}
	w.WriteHeader(statusCode)

	body := origBody
	if b := resCtx.Get("body"); b != nil && !sobek.IsUndefined(b) {
		body = []byte(b.String())
	}
	_, _ = w.Write(body)
}

// writeCtxMockResponse 用 ctx 的 status/headers/body 返回 mock 响应，不走上游。
func writeCtxMockResponse(w http.ResponseWriter, vm *sobek.Runtime, ctx *sobek.Object) {
	if h := ctx.Get("headers"); h != nil && !sobek.IsUndefined(h) {
		hObj := h.ToObject(vm)
		for _, k := range hObj.Keys() {
			w.Header().Set(k, hObj.Get(k).String())
		}
	}
	statusCode := http.StatusOK
	if s := ctx.Get("status"); s != nil && !sobek.IsUndefined(s) {
		if n := int(s.ToInteger()); n > 0 {
			statusCode = n
		}
	}
	w.WriteHeader(statusCode)
	if b := ctx.Get("body"); b != nil && !sobek.IsUndefined(b) {
		_, _ = w.Write([]byte(b.String()))
	}
}
