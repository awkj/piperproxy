package ws

import (
	"errors"
	"io"
	"net"
	"sync"
)

// ProxyFrames 在 client 和 upstream 之间双向代理 WS 帧。
//
// 参数：
//   - clientReader：读取客户端帧的 reader（Hijack 所得的 bufio.Reader，可能含缓冲）
//   - clientConn：客户端原始连接，用于写入帧和强制关闭
//   - upstreamReader：读取上游帧的 reader（ForwardHandshake 返回的 bufio.Reader，可能含缓冲）
//   - upstream：上游连接，用于写入帧和强制关闭
//   - hook：抓包回调
//
// 任一方向出错或连接关闭时，两条连接均被关闭并调用 hook.OnClose。
// 本函数阻塞直到双向均结束。
func ProxyFrames(
	clientReader io.Reader,
	clientConn net.Conn,
	upstreamReader io.Reader,
	upstream net.Conn,
	hook Hook,
) {
	var once sync.Once
	closeAll := func(err error) {
		once.Do(func() {
			_ = clientConn.Close()
			_ = upstream.Close()
			hook.OnClose(err)
		})
	}

	var wg sync.WaitGroup
	wg.Add(2)

	// client → upstream
	go func() {
		defer wg.Done()
		err := pipeFrames(clientReader, upstream, true, hook)
		closeAll(err)
	}()

	// upstream → client
	go func() {
		defer wg.Done()
		err := pipeFrames(upstreamReader, clientConn, false, hook)
		closeAll(err)
	}()

	wg.Wait()
}

// pipeFrames 从 src 逐帧读取、通知 hook，再将原始字节写入 dst。
func pipeFrames(src io.Reader, dst io.Writer, fromClient bool, hook Hook) error {
	for {
		raw, f, err := readFrame(src)
		if err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		f.FromClient = fromClient
		hook.OnFrame(f)
		if _, err := dst.Write(raw); err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
	}
}
