//go:generate go tool tygo generate --config ../tygo.yaml
// Package api — types.go：所有 API 响应的命名 struct。
// 字段顺序和 json tag 与前端消费的 JSON key 严格对齐。
// 此文件是 tygo 代码生成的数据源，改动后在 server/ 下运行 go generate . 同步 TS 类型。
package api

// --------------------------------------------------------------------------
// 抓包核心结构（CaptureItem 及其子结构）
// --------------------------------------------------------------------------

// CaptureReq 描述一次 HTTP 请求的请求侧数据。
type CaptureReq struct {
	Method  string            `json:"method,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	Size    int               `json:"size,omitzero"`
	// Truncated 表示 body 在抓取时超过 captureBodyLimit 被截断（前端可提示用户）
	Truncated bool `json:"truncated,omitzero"`
}

// CaptureRes 描述一次 HTTP 请求的响应侧数据。
type CaptureRes struct {
	StatusCode    int               `json:"statusCode,omitzero"`
	StatusMessage string            `json:"statusMessage,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Body          string            `json:"body,omitempty"`
	Size          int               `json:"size,omitzero"`
	Truncated     bool              `json:"truncated,omitzero"`
}

// CaptureItem 是一次 HTTP 会话的完整快照，字段与前端 NetworkItem 一一对应。
// 时间字段（StartTime / EndTime / DnsTime 等）均为 unix 毫秒绝对时间戳。
type CaptureItem struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Hostname string `json:"hostname,omitempty"`
	Path     string `json:"path,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Method   string `json:"method,omitempty"`
	// 注意 json tag 用小写 p，与前端 NetworkItem.clientIp 对齐
	ClientIP string `json:"clientIp,omitempty"`
	HostIP   string `json:"hostIp,omitempty"`

	// 时间戳（unix ms）
	StartTime    int64 `json:"startTime"`
	EndTime      int64 `json:"endTime,omitzero"`
	RequestTime  int64 `json:"requestTime,omitzero"` // 同 StartTime，兼容旧前端
	DnsTime      int64 `json:"dnsTime,omitzero"`
	HttpsTime    int64 `json:"httpsTime,omitzero"`
	ResponseTime int64 `json:"responseTime,omitzero"`
	Ttfb         int64 `json:"ttfb,omitzero"`

	Req CaptureReq `json:"req"`
	Res CaptureRes `json:"res"`

	// 元数据
	Type            string `json:"type,omitempty"`
	ContentEncoding string `json:"contentEncoding,omitempty"`
	AppName         string `json:"appName,omitempty"`
	ReqError        bool   `json:"reqError,omitzero"`
	ResError        bool   `json:"resError,omitzero"`
	ReqType         string `json:"reqType,omitempty"`
	ResType         string `json:"resType,omitempty"`

	// 高亮 + 备注（P0 特性）
	Highlighted bool   `json:"highlighted,omitzero"`
	Comment     string `json:"comment,omitempty"`

	// 进程归属（P1 特性）
	ProcessName string `json:"processName,omitempty"`
	ProcessID   int    `json:"processId,omitzero"`

	// GraphQL 元数据（P1 特性）
	GraphQLOp string `json:"graphqlOp,omitempty"` // operationName（空表示非 GraphQL）
}

// CaptureData 按 id 索引抓包数据，供批量查询使用。
// IDs 保持写入顺序，Data 按 id 索引供前端 O(1) 查找。
type CaptureData struct {
	IDs  []string               `json:"ids"`
	Data map[string]*CaptureItem `json:"data"`
}

// BatchCaptureRequest 是 POST /api/captures/batch 的请求体。
type BatchCaptureRequest struct {
	IDs []string `json:"ids"`
}

// --------------------------------------------------------------------------
// 通用响应类型
// --------------------------------------------------------------------------

// ErrorResponse 用于 4xx/5xx 错误响应 body。
type ErrorResponse struct {
	Error string `json:"error"`
}

// --------------------------------------------------------------------------
// 共享子结构
// --------------------------------------------------------------------------

// ServerInfo 出现在多个响应里，描述后端运行环境。
type ServerInfo struct {
	Hostname string `json:"hostname"`
	Go       string `json:"go"`
	Platform string `json:"platform"`
}

// RulesListResponse 对应 GET /api/rules/enabled（全局状态）。
type RulesListResponse struct {
	EnabledCount           int    `json:"enabledCount"`
	DefaultRulesIsDisabled bool   `json:"defaultRulesIsDisabled"`
	DefaultRules           string `json:"defaultRules"`
	AllowMultipleChoice    bool   `json:"allowMultipleChoice"`
	BackRulesFirst         bool   `json:"backRulesFirst"`
	List                   []any  `json:"list"`
}

// ValuesResponse 对应 init.values 字段。
type ValuesResponse struct {
	List []any `json:"list"`
}

// --------------------------------------------------------------------------
// 端点响应类型
// --------------------------------------------------------------------------

// InitResponse 对应 GET /api/init。
type InitResponse struct {
	WName                  string            `json:"wName"`
	Version                string            `json:"version"`
	ClientID               string            `json:"clientId"`
	ClientIP               string            `json:"clientIp"`
	LastDataID             int64             `json:"lastDataId"`
	LastSvrLogID           int64             `json:"lastSvrLogId"`
	InterceptHTTPSConnects bool              `json:"interceptHttpsConnects"`
	EnableHTTP2            bool              `json:"enableHttp2"`
	// ProxyAddr 是代理监听 host:port（来自 --addr 启动参数），前端用于 TopNav 监听状态徽章。
	ProxyAddr       string            `json:"proxyAddr"`
	Server          ServerInfo        `json:"server"`
	Rules           RulesListResponse `json:"rules"`
	Values          ValuesResponse    `json:"values"`
	Plugins         map[string]any    `json:"plugins"`
	DisabledPlugins map[string]any    `json:"disabledPlugins"`
}

// StatusResponse 对应 GET /api/status。
type StatusResponse struct {
	Storage   string  `json:"storage"`
	PiperName string  `json:"piperName"`
	Name      string  `json:"name"`
	Version   string  `json:"version"`
	Uptime    float64 `json:"uptime"`
}

// HTTPSStatusResponse 对应 GET /api/https/status。
type HTTPSStatusResponse struct {
	EnableCapture bool `json:"enableCapture"`
	EnableHTTP2   bool `json:"enableHttp2"`
}

// RulesEnabledResponse 对应 GET /api/rules/enabled。
type RulesEnabledResponse struct {
	MFlag string `json:"mflag"`
	List  []any  `json:"list"`
}

// GetFramesResponse 对应 GET /api/captures/:id/frames。
type GetFramesResponse struct {
	Frames []any `json:"frames"`
}

// --------------------------------------------------------------------------
// Bypass Proxy / SSL Pinning 相关类型
// --------------------------------------------------------------------------

// BypassRuleItem 是一条 bypass 规则。
type BypassRuleItem struct {
	Pattern string `json:"pattern"`
	Tag     string `json:"tag"`
	Enabled bool   `json:"enabled"`
}

// DetectedHostItem 是检测到的 SSL Pinning 主机记录。
type DetectedHostItem struct {
	Host        string `json:"host"`
	Failures    int    `json:"failures"`
	LastFailure string `json:"last_failure"`
}

// BypassManager 是 bypass 规则存储的接口（api 层与 proxy 层解耦）。
type BypassManager interface {
	List() []BypassRuleItem
	Add(r BypassRuleItem) error
	Remove(pattern string) error
	SetEnabled(pattern string, enabled bool) error
	EnablePreset(name string) error
	DisablePreset(name string) error
	EnabledPresets() []string
}

// PinningManager 是 SSL Pinning 检测器的接口。
type PinningManager interface {
	DetectedHosts() []DetectedHostItem
	IsPinned(host string) bool
}

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// 弱网模拟（Network Throttle）
// --------------------------------------------------------------------------

// ThrottlePreset 是限速档位名称。
type ThrottlePreset string

// ThrottleConfig 是 GET/PUT /api/throttle 的请求/响应体。
type ThrottleConfig struct {
	Preset  ThrottlePreset `json:"preset"`
	UpBPS   int64          `json:"upBps"`
	DownBPS int64          `json:"downBps"`
	LatencyMs int64        `json:"latencyMs"`
}

// --------------------------------------------------------------------------

// NetworkInterface 表示一张可用于代理客户端连接的网卡条目。
type NetworkInterface struct {
	Name string `json:"name"` // 网卡名（loopback 用 "loopback"）
	IP   string `json:"ip"`   // IPv4 字符串
	Kind string `json:"kind"` // "loopback" | "lan"
}

// NetworkInterfacesResponse 对应 GET /api/network/interfaces。
// 前端用它在「系统代理」面板里列出所有可设置的 host:port 组合。
type NetworkInterfacesResponse struct {
	ProxyHost  string             `json:"proxyHost"`  // 监听 host（空 / 0.0.0.0 表示全网卡）
	ProxyPort  int                `json:"proxyPort"`  // 监听端口（真实 proxy 端口，不是 webui dev server 端口）
	Interfaces []NetworkInterface `json:"interfaces"` // loopback 在前，LAN 在后
}
