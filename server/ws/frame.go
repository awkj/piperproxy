package ws

import (
	"encoding/binary"
	"fmt"
	"io"
)

// maxPayloadSize 是单帧最大载荷（16 MiB）。超出报错而非 OOM。
const maxPayloadSize = 16 << 20

// readFrame 读取一帧 WS 数据（RFC 6455 §5.2）。
//
// 返回：
//   - raw：完整帧原始字节（含掩码 key + 已掩码载荷），可直接写入对端
//   - f：解析后的帧（Payload 已解掩，供 Hook 使用）
func readFrame(r io.Reader) (raw []byte, f Frame, err error) {
	var hdr [2]byte
	if _, err = io.ReadFull(r, hdr[:]); err != nil {
		return nil, Frame{}, fmt.Errorf("ws frame header: %w", err)
	}

	fin := hdr[0]&0x80 != 0
	opcode := hdr[0] & 0x0F
	masked := hdr[1]&0x80 != 0
	payloadLen := uint64(hdr[1] & 0x7F)

	raw = append(raw, hdr[:]...)

	switch payloadLen {
	case 126:
		var ext [2]byte
		if _, err = io.ReadFull(r, ext[:]); err != nil {
			return nil, Frame{}, fmt.Errorf("ws frame ext16: %w", err)
		}
		payloadLen = uint64(binary.BigEndian.Uint16(ext[:]))
		raw = append(raw, ext[:]...)
	case 127:
		var ext [8]byte
		if _, err = io.ReadFull(r, ext[:]); err != nil {
			return nil, Frame{}, fmt.Errorf("ws frame ext64: %w", err)
		}
		payloadLen = binary.BigEndian.Uint64(ext[:])
		raw = append(raw, ext[:]...)
	}

	if payloadLen > maxPayloadSize {
		return nil, Frame{}, fmt.Errorf("ws frame payload too large: %d bytes", payloadLen)
	}

	var maskKey [4]byte
	if masked {
		if _, err = io.ReadFull(r, maskKey[:]); err != nil {
			return nil, Frame{}, fmt.Errorf("ws frame mask key: %w", err)
		}
		raw = append(raw, maskKey[:]...)
	}

	payload := make([]byte, payloadLen)
	if payloadLen > 0 {
		if _, err = io.ReadFull(r, payload); err != nil {
			return nil, Frame{}, fmt.Errorf("ws frame payload: %w", err)
		}
	}
	raw = append(raw, payload...)

	// 解掩供 Hook 使用；raw 保持原样以便透传
	unmasked := payload
	if masked && payloadLen > 0 {
		unmasked = make([]byte, payloadLen)
		for i, b := range payload {
			unmasked[i] = b ^ maskKey[i%4]
		}
	}

	f = Frame{
		Fin:     fin,
		Opcode:  opcode,
		Payload: unmasked,
	}
	return raw, f, nil
}
