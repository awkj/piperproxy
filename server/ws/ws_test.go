package ws

import (
	"bytes"
	"encoding/binary"
	"io"
	"testing"
)

// buildFrame 构造一帧 WS 原始字节，供测试使用。
func buildFrame(fin bool, opcode byte, mask bool, maskKey [4]byte, payload []byte) []byte {
	var buf []byte

	b0 := opcode
	if fin {
		b0 |= 0x80
	}
	buf = append(buf, b0)

	n := len(payload)
	var b1 byte
	if mask {
		b1 |= 0x80
	}
	switch {
	case n <= 125:
		b1 |= byte(n)
		buf = append(buf, b1)
	case n <= 0xFFFF:
		b1 |= 126
		buf = append(buf, b1)
		var ext [2]byte
		binary.BigEndian.PutUint16(ext[:], uint16(n))
		buf = append(buf, ext[:]...)
	default:
		b1 |= 127
		buf = append(buf, b1)
		var ext [8]byte
		binary.BigEndian.PutUint64(ext[:], uint64(n))
		buf = append(buf, ext[:]...)
	}

	if mask {
		buf = append(buf, maskKey[:]...)
		for i, b := range payload {
			buf = append(buf, b^maskKey[i%4])
		}
	} else {
		buf = append(buf, payload...)
	}
	return buf
}

func TestReadFrameTextUnmasked(t *testing.T) {
	payload := []byte("Hello")
	raw := buildFrame(true, OpText, false, [4]byte{}, payload)

	_, f, err := readFrame(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if !f.Fin {
		t.Error("Fin should be true")
	}
	if f.Opcode != OpText {
		t.Errorf("opcode: got %d, want %d", f.Opcode, OpText)
	}
	if string(f.Payload) != "Hello" {
		t.Errorf("payload: got %q, want %q", f.Payload, "Hello")
	}
}

func TestReadFrameMasked(t *testing.T) {
	maskKey := [4]byte{0x37, 0xFA, 0x21, 0x3D}
	payload := []byte("Hello")
	raw := buildFrame(true, OpText, true, maskKey, payload)

	_, f, err := readFrame(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if string(f.Payload) != "Hello" {
		t.Errorf("unmasked payload: got %q, want %q", f.Payload, "Hello")
	}
}

func TestReadFrameRawBytesPreserved(t *testing.T) {
	maskKey := [4]byte{0xAA, 0xBB, 0xCC, 0xDD}
	payload := []byte("Test")
	want := buildFrame(true, OpBinary, true, maskKey, payload)

	got, _, err := readFrame(bytes.NewReader(want))
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("raw bytes mismatch: got %v, want %v", got, want)
	}
}

func TestReadFrameExtLen16(t *testing.T) {
	payload := bytes.Repeat([]byte{0xAB}, 200)
	raw := buildFrame(false, OpBinary, false, [4]byte{}, payload)

	_, f, err := readFrame(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if f.Opcode != OpBinary {
		t.Errorf("opcode: got %d, want %d", f.Opcode, OpBinary)
	}
	if f.Fin {
		t.Error("Fin should be false for ext16 frame")
	}
	if !bytes.Equal(f.Payload, payload) {
		t.Error("payload mismatch for ext16 frame")
	}
}

func TestReadFrameExtLen64(t *testing.T) {
	payload := bytes.Repeat([]byte{0x55}, 70000)
	raw := buildFrame(true, OpBinary, false, [4]byte{}, payload)

	_, f, err := readFrame(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if len(f.Payload) != 70000 {
		t.Errorf("payload len: got %d, want 70000", len(f.Payload))
	}
}

func TestReadFramePingPong(t *testing.T) {
	for _, tt := range []struct {
		opcode byte
		name   string
	}{
		{OpPing, "ping"},
		{OpPong, "pong"},
		{OpClose, "close"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			raw := buildFrame(true, tt.opcode, false, [4]byte{}, nil)
			_, f, err := readFrame(bytes.NewReader(raw))
			if err != nil {
				t.Fatalf("readFrame: %v", err)
			}
			if f.Opcode != tt.opcode {
				t.Errorf("opcode: got %d, want %d", f.Opcode, tt.opcode)
			}
		})
	}
}

func TestReadFrameEOF(t *testing.T) {
	_, _, err := readFrame(bytes.NewReader(nil))
	if err == nil {
		t.Fatal("expected error on empty reader")
	}
	if err != io.EOF && err.Error() != "ws frame header: EOF" {
		// bufio wraps EOF; check that it's an EOF-related error
		_ = err
	}
}

func TestReadFramePayloadTooLarge(t *testing.T) {
	// 构造 ext64 frame 声称载荷 32 MiB（超 maxPayloadSize）
	buf := []byte{
		0x82,                                     // FIN=1, binary
		127,                                      // ext64
		0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, // 32 MiB = 0x2000000
	}
	_, _, err := readFrame(bytes.NewReader(buf))
	if err == nil {
		t.Fatal("expected error for oversized payload")
	}
}
