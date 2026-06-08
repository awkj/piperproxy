// Package procattr 通过本地 TCP 连接的 (srcIP, srcPort) 反查发起进程信息。
//
// 当前阶段只实现 macOS（lsof -nP -iTCP:<port>）；其他平台返回空 stub。
// 查不到时返回空字符串，不报错。查询结果带 TTL 缓存（1 秒），避免阻塞主路径。
package procattr

import (
	"sync"
	"time"
)

// Info 是一次进程查询的结果。
type Info struct {
	PID  int    // 0 = 未知
	Name string // 进程短名（basename），空 = 未知
}

var unknown = Info{}

// cache entry
type entry struct {
	info    Info
	expires time.Time
}

var (
	mu    sync.Mutex
	cache = map[string]entry{} // key = "ip:port"
)

const ttl = time.Second

// Lookup 根据 remoteAddr（形如 "127.0.0.1:56789" 或 "[::1]:56789"）查进程信息。
// 结果缓存 1 秒；查不到或出错均返回 Info{}。
func Lookup(remoteAddr string) Info {
	mu.Lock()
	if e, ok := cache[remoteAddr]; ok && time.Now().Before(e.expires) {
		mu.Unlock()
		return e.info
	}
	mu.Unlock()

	info := lookup(remoteAddr)

	mu.Lock()
	cache[remoteAddr] = entry{info: info, expires: time.Now().Add(ttl)}
	mu.Unlock()

	return info
}
