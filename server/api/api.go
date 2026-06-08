// Package api 提供 piper Web 控制台后端（取代 apps/proxy/biz/webui/cgi-bin）。
//
// 决策 D1：路由用 go-chi/chi（GO-5 引入），底层仍是 net/http。
// GO-1 占位：实现 NotImplemented，所有路径返回 501，便于在 proxy.Handler 里先把
// "请求打到 local.piper.test → 走 API handler" 的分发链路接上。GO-5 阶段落地真正端点。
package api

import "net/http"

// Handler 是 API HTTP 处理器；与 http.Handler 同形，但单独命名让依赖一目了然。
type Handler interface {
	http.Handler
}

// NotImplemented 对任何请求返回 501。
type NotImplemented struct{}

func (NotImplemented) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "piper api: not implemented yet (GO-5)", http.StatusNotImplemented)
}
