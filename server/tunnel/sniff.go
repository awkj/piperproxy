package tunnel

import (
	"bufio"
	"errors"
	"net"
	"time"
)

// TLSHandshakeFirstByte 是 TLS record content type "handshake" 的值（RFC 8446 §5.1）。
// 客户端发出的 ClientHello 永远是这个字节开头。
const TLSHandshakeFirstByte byte = 0x16

// PeekFirstByte 从 c 读取 1 字节但不消费——返回的 net.Conn 后续 Read 会先吐出这一字节。
//
// 内部用 bufio.Reader 做缓冲；Write / Close / 地址等其它方法直通底层 conn。
//
// 给 c 加了一个 short read deadline 防止恶意客户端 CONNECT 后挂起不发数据；deadline 在
// peek 完成后会被清掉。
func PeekFirstByte(c net.Conn) (byte, net.Conn, error) {
	if c == nil {
		return 0, nil, errors.New("tunnel: nil conn")
	}
	_ = c.SetReadDeadline(time.Now().Add(10 * time.Second))
	defer c.SetReadDeadline(time.Time{}) //nolint:errcheck // 清 deadline 失败不影响后续

	br := bufio.NewReader(c)
	b, err := br.Peek(1)
	if err != nil {
		return 0, nil, err
	}
	return b[0], &peekedConn{Conn: c, br: br}, nil
}

// IsTLSClientHello 判断 sniff 出来的首字节是否是 TLS 握手。
func IsTLSClientHello(firstByte byte) bool {
	return firstByte == TLSHandshakeFirstByte
}

type peekedConn struct {
	net.Conn
	br *bufio.Reader
}

func (p *peekedConn) Read(b []byte) (int, error) { return p.br.Read(b) }
