package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/awkj/piper/server/rules"
)

// remoteConfigTimeout 单次 GET 上限。失败后启动直接报错——piper-cloud 编排时
// 给的 URL 应该 always 可达；不可达说明 cloud 端有问题，让 piper 启动失败更好暴露。
const remoteConfigTimeout = 5 * time.Second

// remoteConfig 是 --config-url 期望返回的 JSON schema。
// 详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3。
type remoteConfig struct {
	// Identity 是本进程归属的 user_id，会通过 api.WithIdentity 暴露给
	// /piper-cgi/identify。
	Identity string `json:"identity"`

	// EventWebhook 等价命令行 --event-webhook URL；命令行已显式给出时本字段被忽略。
	EventWebhook string `json:"event_webhook"`

	// Rules 是 whistle 规则文本（多行），由编排器（piper-cloud）按用户当前激活环境下发。
	// 启动期: 命令行 --rules-file 优先；未指定时本字段作为规则源。
	// 热重载: /piper-cgi/reload-config 触发本端重新 fetch，将本字段塞入 rules.Swappable。
	// 空字符串 = 不注入规则（rules.Nop）。
	Rules string `json:"rules,omitempty"`

	// CACertPEM / CAKeyPEM 是 piper-cloud P5 下发的 per-user CA 证书对（PEM 编码）。
	// 两者同时非空时，piper 用它们替换自签根 CA 并清空叶子缓存（使后续 MITM 走 per-user CA）。
	// 任一为空则保留 piper 自签 CA，向后兼容单机模式及未开启 KeyVault 的老版本 piper-cloud。
	CACertPEM string `json:"ca_cert_pem,omitempty"`
	CAKeyPEM  string `json:"ca_key_pem,omitempty"`

	// Environments 是 P11 多环境支持：每个元素对应一个命名环境（rules 文本 + is_default）。
	// 非空时，piper worker 根据请求 X-Piper-Env header 选择对应的规则引擎；
	// 无 header 时退回 is_default=true 的环境（向后兼容旧单环境行为：字段为空时使用 Rules 字段）。
	// Environments 优先级高于顶层 Rules 字段。
	Environments []rules.EnvConfig `json:"environments,omitempty"`
}

// fetchRemoteConfig GET configURL 一次，解析 JSON 返回。
func fetchRemoteConfig(configURL string) (*remoteConfig, error) {
	u, err := url.Parse(configURL)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("config-url must be http(s)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), remoteConfigTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, configURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", configURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB 上限
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var cfg remoteConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		return nil, fmt.Errorf("parse json: %w", err)
	}
	return &cfg, nil
}
