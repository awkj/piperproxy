// Package api — capture.go：内存 ring buffer，存储抓包 HTTP 会话快照。
// CaptureItem 的字段定义在 types.go（tygo 代码生成数据源）。
package api

import (
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Capturer 是 proxy.Handler 向 CaptureStore 写入抓包数据的最小接口。
// *CaptureStore 实现此接口，proxy 包通过接口注入，不直接依赖具体类型。
//
// 此接口同时是 docs/ECOSYSTEM-PLAN.md §4.2 描述的 **CaptureSink SPI**。
// 与 plan 草稿不同的是：piper 走"请求收齐后一次性 Add(item)"的粗粒度形态，
// 而不是 OnRequest/OnResponse/OnWSFrame/OnError 4 个细粒度事件——后者需要
// 重写 proxy hot path，目前没有消费者驱动这个改动。
//
// piper-cloud (P4 抓包索引) 实现 Capturer 时可以从单个 *CaptureItem 自行派生
// 出 RequestEvent / ResponseEvent / ErrorEvent 三类逻辑事件。
// WebSocket 帧走另一套接口 ws.Hook，与 Capturer 正交。
type Capturer interface {
	Add(*CaptureItem)
}

// --------------------------------------------------------------------------
// CaptureFilter — Track E 服务端过滤
// --------------------------------------------------------------------------

// CaptureFilter 描述 SSE subscriber 的服务端过滤条件。
// 零值（所有字段为空）表示接受全部事件。
type CaptureFilter struct {
	Methods    []string // 空 = 不限；["GET","POST"] = 只接受这些方法
	Host       string   // 空 = 不限；支持 glob（如 *.example.com）
	Status     string   // 空 = 不限；"2xx" / "404" / "500-599"
	URLPattern string   // 空 = 不限；glob（如 *api*）
}

func (f CaptureFilter) isEmpty() bool {
	return len(f.Methods) == 0 && f.Host == "" && f.Status == "" && f.URLPattern == ""
}

func (f CaptureFilter) matches(item *CaptureItem) bool {
	if f.isEmpty() {
		return true
	}
	if len(f.Methods) > 0 {
		ok := false
		for _, m := range f.Methods {
			if strings.EqualFold(item.Method, strings.TrimSpace(m)) {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	if f.Host != "" {
		matched, _ := filepath.Match(strings.ToLower(f.Host), strings.ToLower(item.Hostname))
		if !matched {
			return false
		}
	}
	if f.URLPattern != "" {
		matched, _ := filepath.Match(f.URLPattern, item.URL)
		if !matched {
			return false
		}
	}
	if f.Status != "" && item.Res.StatusCode > 0 {
		if !matchStatus(f.Status, item.Res.StatusCode) {
			return false
		}
	}
	return true
}

func matchStatus(pattern string, code int) bool {
	pattern = strings.TrimSpace(pattern)
	if len(pattern) == 3 && pattern[1] == 'x' && pattern[2] == 'x' {
		digit, err := strconv.Atoi(string(pattern[0]))
		return err == nil && code/100 == digit
	}
	if idx := strings.IndexByte(pattern, '-'); idx > 0 {
		lo, err1 := strconv.Atoi(pattern[:idx])
		hi, err2 := strconv.Atoi(pattern[idx+1:])
		return err1 == nil && err2 == nil && code >= lo && code <= hi
	}
	exact, err := strconv.Atoi(pattern)
	return err == nil && code == exact
}

// --------------------------------------------------------------------------
// CaptureEvent — SSE 广播事件
// --------------------------------------------------------------------------

type CaptureEvent struct {
	Type string
	Seq  int64
	Item *CaptureItem
}

// --------------------------------------------------------------------------
// body 分离存储（Track D）
// --------------------------------------------------------------------------

// bodyThreshold 是 body 内联到 ring buffer 的最大字节数（4 KiB）。
const bodyThreshold = 4 * 1024

type bodyPair struct {
	Req string
	Res string
}

// --------------------------------------------------------------------------
// CaptureStore
// --------------------------------------------------------------------------

type CaptureStore struct {
	mu    sync.RWMutex
	ring  []*CaptureItem
	cap   int
	pos   int
	total int
	byID  map[string]*CaptureItem
	// seq：单调递增。同时用作 CaptureItem.ID 末尾序号 和 SSE 事件的 Seq 号
	// （一条 Add() 只加 1，避免 ID 跳号；前端拿同一个号既能引用条目又能 catch-up SSE）
	seq atomic.Int64

	bodyStore sync.Map // map[string]*bodyPair

	subsMu sync.Mutex
	subs   map[chan CaptureEvent]filteredSub
}

func NewCaptureStore(capacity int) *CaptureStore {
	return &CaptureStore{
		ring: make([]*CaptureItem, capacity),
		cap:  capacity,
		byID: make(map[string]*CaptureItem, capacity),
		subs: make(map[chan CaptureEvent]filteredSub),
	}
}

// nextID 推进 seq 一次，返回 seq 号。
// CaptureItem.ID 直接用 seq 的字符串形式 —— ID == SSE 事件 Seq，前端只需一个数字。
func (s *CaptureStore) nextID() (string, int64) {
	n := s.seq.Add(1)
	return strconv.FormatInt(n, 10), n
}

func (s *CaptureStore) LastSeq() int64 { return s.seq.Load() }

// Add 向 ring buffer 追加一条记录，环满时覆盖最老的项，并广播 complete 事件。
func (s *CaptureStore) Add(item *CaptureItem) {
	// 同一个 seq 既做 ID 末尾号也做 SSE 事件号——前端拿到的两个号永远一致。
	var seq int64
	if item.ID == "" {
		item.ID, seq = s.nextID()
	} else {
		seq = s.seq.Add(1)
	}
	if item.StartTime == 0 {
		item.StartTime = time.Now().UnixMilli()
	}
	item.RequestTime = item.StartTime

	if len(item.Req.Body) > bodyThreshold || len(item.Res.Body) > bodyThreshold {
		s.bodyStore.Store(item.ID, &bodyPair{
			Req: item.Req.Body,
			Res: item.Res.Body,
		})
		if len(item.Req.Body) > bodyThreshold {
			item.Req.Body = ""
		}
		if len(item.Res.Body) > bodyThreshold {
			item.Res.Body = ""
		}
	}

	s.mu.Lock()
	idx := s.pos % s.cap
	if old := s.ring[idx]; old != nil {
		delete(s.byID, old.ID)
		s.bodyStore.Delete(old.ID)
	}
	s.ring[idx] = item
	s.byID[item.ID] = item
	s.pos++
	s.total++
	s.mu.Unlock()

	s.broadcast(CaptureEvent{Type: "complete", Seq: seq, Item: item})
}

func (s *CaptureStore) GetBody(id string) (req, res string, ok bool) {
	item := s.GetByID(id)
	if item == nil {
		return "", "", false
	}
	req = item.Req.Body
	res = item.Res.Body
	if v, loaded := s.bodyStore.Load(id); loaded {
		if pair, _ := v.(*bodyPair); pair != nil {
			if pair.Req != "" {
				req = pair.Req
			}
			if pair.Res != "" {
				res = pair.Res
			}
		}
	}
	return req, res, true
}

func (s *CaptureStore) GetFull(id string) *CaptureItem {
	item := s.GetByID(id)
	if item == nil {
		return nil
	}
	out := *item
	copyReq := item.Req
	copyRes := item.Res
	if v, loaded := s.bodyStore.Load(id); loaded {
		if pair, _ := v.(*bodyPair); pair != nil {
			if pair.Req != "" {
				copyReq.Body = pair.Req
			}
			if pair.Res != "" {
				copyRes.Body = pair.Res
			}
		}
	}
	out.Req = copyReq
	out.Res = copyRes
	return &out
}

func (s *CaptureStore) SetHighlight(id string, on bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.byID[id]
	if !ok {
		return false
	}
	item.Highlighted = on
	return true
}

func (s *CaptureStore) SetComment(id string, comment string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.byID[id]
	if !ok {
		return false
	}
	item.Comment = comment
	return true
}

func (s *CaptureStore) GetByID(id string) *CaptureItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.byID[id]
}

func (s *CaptureStore) List(limit int) CaptureData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	n := s.total
	if n > s.cap {
		n = s.cap
	}
	start := 0
	if s.total > s.cap {
		start = s.pos % s.cap
	}

	items := make([]*CaptureItem, 0, n)
	for i := 0; i < n; i++ {
		if item := s.ring[(start+i)%s.cap]; item != nil {
			items = append(items, item)
		}
	}
	if limit > 0 && len(items) > limit {
		items = items[len(items)-limit:]
	}

	ids := make([]string, len(items))
	data := make(map[string]*CaptureItem, len(items))
	for i, item := range items {
		ids[i] = item.ID
		data[item.ID] = item
	}
	return CaptureData{IDs: ids, Data: data}
}

// --------------------------------------------------------------------------
// Subscriber（Track B/E）
// --------------------------------------------------------------------------

type filteredSub struct {
	ch     chan CaptureEvent
	filter CaptureFilter
}

func (s *CaptureStore) Subscribe(done <-chan struct{}, filter CaptureFilter) <-chan CaptureEvent {
	ch := make(chan CaptureEvent, 64)
	sub := filteredSub{ch: ch, filter: filter}

	s.subsMu.Lock()
	s.subs[ch] = sub
	s.subsMu.Unlock()

	go func() {
		<-done
		s.subsMu.Lock()
		delete(s.subs, ch)
		s.subsMu.Unlock()
		close(ch)
	}()
	return ch
}

func (s *CaptureStore) broadcast(ev CaptureEvent) {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	for _, sub := range s.subs {
		if ev.Item != nil && !sub.filter.matches(ev.Item) {
			continue
		}
		select {
		case sub.ch <- ev:
		default:
		}
	}
}
