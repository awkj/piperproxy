package modules

import (
	"github.com/grafana/sobek"
)

// Fetcher 是 piper:http 模块所需的 HTTP 请求接口，由 Sandbox 实现。
// 返回 (status, respHeaders, respBody, err)，使用基础类型避免跨包结构体依赖。
type Fetcher interface {
	Fetch(url, method string, headers map[string]string, body string) (int, map[string]string, string, error)
}

// NewHTTP 返回 piper:http 模块，导出 fetch 函数。
// fetch(url, opts?) 同步调用（在 Go 层阻塞），返回已解决的 Promise，可以 await。
// opts = { method?, headers?, body? }
func NewHTTP(fetcher Fetcher) *NativeModule {
	return New(map[string]ExportFactory{
		"fetch": func(rt *sobek.Runtime) sobek.Value {
			return rt.ToValue(func(call sobek.FunctionCall) sobek.Value {
				url := call.Argument(0).String()
				method := "GET"
				var reqHeaders map[string]string
				var bodyStr string

				if len(call.Arguments) > 1 {
					opts := call.Argument(1).ToObject(rt)
					if m := opts.Get("method"); m != nil {
						method = m.String()
					}
					if h := opts.Get("headers"); h != nil {
						hObj := h.ToObject(rt)
						reqHeaders = make(map[string]string)
						for _, k := range hObj.Keys() {
							reqHeaders[k] = hObj.Get(k).String()
						}
					}
					if b := opts.Get("body"); b != nil {
						bodyStr = b.String()
					}
				}

				status, respHeaders, respBody, err := fetcher.Fetch(url, method, reqHeaders, bodyStr)
				if err != nil {
					panic(rt.NewGoError(err))
				}

				// Build response object
				respObj := rt.NewObject()
				_ = respObj.Set("status", status)
				_ = respObj.Set("body", respBody)
				headers := rt.NewObject()
				for k, v := range respHeaders {
					_ = headers.Set(k, v)
				}
				_ = respObj.Set("headers", headers)

				// Return already-resolved Promise for await compatibility
				p, resolve, _ := rt.NewPromise()
				resolve(respObj)
				return rt.ToValue(p)
			})
		},
	})
}
