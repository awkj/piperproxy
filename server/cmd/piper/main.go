// Command piper 是 piper 代理的 Go 实现入口。
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/awkj/piper/server/api"
	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/event"
	piperMCP "github.com/awkj/piper/server/internal/mcp"
	"github.com/awkj/piper/server/internal/paths"
	"github.com/awkj/piper/server/obs"
	"github.com/awkj/piper/server/proxy"
	"github.com/awkj/piper/server/rules"
	"github.com/awkj/piper/server/script"
	"github.com/awkj/piper/server/store"
)

func main() {
	// 子命令分派
	if len(os.Args) >= 2 {
		switch os.Args[1] {
		case "shell":
			runShellSubcmd(os.Args[2:])
			return
		case "ca":
			runCASubcmd(os.Args[2:])
			return
		case "mcp":
			runMCPSubcmd(os.Args[2:])
			return
		}
	}

	var (
		addr        string
		logLevel    string
		configDir   string
		dataDir     string
		rulesFile   string
		proxyAuth   string
		uiAuth       string
		autoSaveDir  string
		eventWebhook string
		configURL    string
		identity     string
	)
	flag.StringVar(&addr, "addr", ":8899", "代理监听地址（host:port），默认 :8899 对齐 Node 时代 piper")
	flag.StringVar(&logLevel, "log-level", "info", "日志等级 debug|info|warn|error")
	flag.StringVar(&configDir, "config-dir", "", "配置目录（bypass.json / scripts/）；默认 $XDG_CONFIG_HOME/piper 或 ~/.config/piper")
	flag.StringVar(&dataDir, "data-dir", "", "数据目录（certs / piper.db / mcp-handshake.json）；默认 $XDG_DATA_HOME/piper 或 ~/.local/share/piper")
	flag.StringVar(&rulesFile, "rules-file", "", "规则文件路径（whistle 文本格式），不传则不启用规则匹配")
	flag.StringVar(&proxyAuth, "proxy-auth", "", "代理认证凭证 user:pass；空 = 不启用")
	flag.StringVar(&uiAuth, "ui-auth", "", "UI 认证凭证 user:pass；空 = 不启用")
	flag.StringVar(&autoSaveDir, "autosave", "", "全局 autosave 目录；所有请求的 JSON 快照写入该目录")
	flag.StringVar(&eventWebhook, "event-webhook", "", "事件推送目标（http(s):// 绝对 URL）；空 = 不推。详见 docs/ECOSYSTEM-PLAN.md §4.2 EventEmitter SPI")
	flag.StringVar(&configURL, "config-url", "", "启动时 GET 此 URL 拉远端配置 JSON（{identity,event_webhook}）；命令行 flag 优先级高于此 URL 返回的字段。详见 docs/ECOSYSTEM-PLAN.md §4 T-piper-3")
	flag.StringVar(&identity, "identity", "", "本进程的归属用户标识，/piper-cgi/identify 端点的回值；空 = 未配置（编排器会读到空字符串）")
	flag.Parse()

	logger := obs.NewLogger(logLevel)

	// T-piper-3：从 --config-url 拉远端配置；命令行 flag 优先。
	// P5：CACertPEM / CAKeyPEM 提升到外层，CA 就绪后注入（见下方 caMgr 初始化后）。
	var (
		remoteCACertPEM string
		remoteCAKeyPEM  string
	)
	if configURL != "" {
		remote, err := fetchRemoteConfig(configURL)
		if err != nil {
			fmt.Fprintf(os.Stderr, "config-url: %v\n", err)
			os.Exit(1)
		}
		if identity == "" && remote.Identity != "" {
			identity = remote.Identity
		}
		if eventWebhook == "" && remote.EventWebhook != "" {
			eventWebhook = remote.EventWebhook
		}
		remoteCACertPEM = remote.CACertPEM
		remoteCAKeyPEM = remote.CAKeyPEM
		logger.Info("remote config loaded", "url", configURL, "identity", identity)
	}

	if configDir == "" {
		d, err := paths.ConfigDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "resolve config dir: %v\n", err)
			os.Exit(1)
		}
		configDir = d
	}
	if dataDir == "" {
		d, err := paths.DataDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "resolve data dir: %v\n", err)
			os.Exit(1)
		}
		dataDir = d
	}

	caMgr, err := ca.NewManager(filepath.Join(dataDir, "certs"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "ca: %v\n", err)
		os.Exit(1)
	}
	// P5（ECOSYSTEM-PLAN.md）：piper-cloud 下发 per-user CA 时覆盖自签根 CA。
	// 两者同时非空才生效；任一为空退化为本地自签（单机/未开 KeyVault 兼容）。
	if remoteCACertPEM != "" && remoteCAKeyPEM != "" {
		if err := caMgr.LoadRootFromPEM(remoteCAKeyPEM, remoteCACertPEM); err != nil {
			fmt.Fprintf(os.Stderr, "ca: inject remote CA: %v\n", err)
			os.Exit(1)
		}
		logger.Info("ca replaced with remote per-user CA")
	}
	logger.Info("ca ready", "config-dir", configDir, "data-dir", dataDir)

	// 规则引擎：用 Swappable 包一层，便于 /piper-cgi/reload-config 热替换。
	// 优先级：--rules-file > --config-url.environments（P11 多环境）> --config-url.rules（单环境兼容）。
	// 单机模式（三者皆空）= rules.Nop。
	//
	// multiEnvEngine：若 configURL 模式下下发了 Environments 数组，则用 MultiEnv 封装；
	// reload 时直接 multiEnvEngine.Swap(newEnvs) 更新各环境规则而不重建整个 Swappable。
	var ruleEngine rules.Engine = rules.Nop{}
	var multiEnvEngine *rules.MultiEnv
	rulesDir := ""
	switch {
	case rulesFile != "":
		e, err := rules.NewFromFile(rulesFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "rules: %v\n", err)
			os.Exit(1)
		}
		ruleEngine = e
		rulesDir = filepath.Dir(rulesFile)
		logger.Info("rules loaded", "file", rulesFile)
	case configURL != "":
		// configURL 已 fetch 过一次（上面的 remote 变量被局部消化了），
		// 但 reload 闭包还要复用 fetch；为简单起见这里再 fetch 一次拿 rules。
		// 单次 5s 启动期成本可忽略。
		if remote, err := fetchRemoteConfig(configURL); err == nil {
			if len(remote.Environments) > 0 {
				// P11 多环境：用 MultiEnv 分发，X-Piper-Env header 选环境
				multiEnvEngine = rules.NewMultiEnv(remote.Environments)
				ruleEngine = multiEnvEngine
				logger.Info("multi-env rules loaded from remote", "url", configURL, "envs", len(remote.Environments))
			} else if remote.Rules != "" {
				// 向后兼容：单环境模式
				ruleEngine = rules.New(remote.Rules)
				logger.Info("rules loaded from remote", "url", configURL)
			}
		}
	}
	swappableRules := rules.NewSwappable(ruleEngine)

	// GO-6：脚本运行时
	//   - 脚本文件在 configDir/scripts/（用户写的代码，属配置）
	//   - 沙箱白名单含 configDir + dataDir（脚本可读自身、可写 dataDir 下的产物）
	scriptMgr := script.NewManager(configDir, dataDir, logger)

	// D7：SQLite 持久化（rules / values / captures），落 dataDir
	db, err := store.Open(dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "store: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("store ready", "db", filepath.Join(dataDir, "piper.db"))

	// 写入 MCP handshake 文件（dataDir/mcp-handshake.json，0600）。
	// 失败只打日志，不影响主进程启动。
	baseURL := "http://127.0.0.1" + addr
	if len(addr) > 0 && addr[0] != ':' {
		baseURL = "http://" + addr
	}
	mcpToken, err := piperMCP.WriteHandshake(dataDir, baseURL)
	if err != nil {
		logger.Warn("mcp handshake write failed", "err", err)
		mcpToken = ""
	} else {
		logger.Info("mcp handshake written", "base_url", baseURL)
	}

	// EventEmitter SPI（ECOSYSTEM-PLAN.md §4.2）：默认 Noop；--event-webhook 切到 Webhook。
	var emitter event.Emitter = event.Noop{}
	if eventWebhook != "" {
		w, err := event.NewWebhook(eventWebhook, logger)
		if err != nil {
			fmt.Fprintf(os.Stderr, "event webhook: %v\n", err)
			os.Exit(1)
		}
		emitter = w
		logger.Info("event webhook enabled", "url", eventWebhook)
	}

	bypassStore := proxy.NewBypassStore(configDir)
	pinningDetector := proxy.NewPinningDetector()

	// Reloader 闭包：被 /piper-cgi/reload-config 触发。
	// 重新 fetch --config-url，把新的 rules 文本塞进 swappableRules。
	// 注意：identity / eventWebhook 是进程级配置，reload 不动它们；只换规则。
	// --rules-file 优先模式下不应 reload 远端规则（用户显式指定本地文件源）。
	reloader := api.Reloader(func() error {
		switch {
		case rulesFile != "":
			// 用户启动时指定了本地规则文件，reload 走"重读本地文件"路径。
			e, err := rules.NewFromFile(rulesFile)
			if err != nil {
				return fmt.Errorf("reload rules file: %w", err)
			}
			swappableRules.Swap(e)
			logger.Info("rules reloaded from file", "file", rulesFile)
			return nil
		case configURL != "":
			remote, err := fetchRemoteConfig(configURL)
			if err != nil {
				return fmt.Errorf("fetch remote config: %w", err)
			}
			// P5：顺带换 CA（两者同时非空才生效，任一为空不变）。
			if remote.CACertPEM != "" && remote.CAKeyPEM != "" {
				if caErr := caMgr.LoadRootFromPEM(remote.CAKeyPEM, remote.CACertPEM); caErr != nil {
					logger.Warn("reload: inject remote CA failed", "err", caErr)
				} else {
					logger.Info("ca reloaded from remote config")
				}
			}
			// P11：优先处理多环境；回退到单环境兼容模式。
			if len(remote.Environments) > 0 {
				if multiEnvEngine != nil {
					// 热更新已有 MultiEnv（原子操作，in-flight 请求不受影响）
					multiEnvEngine.Swap(remote.Environments)
				} else {
					// 启动时用的单环境模式，现在切到多环境
					multiEnvEngine = rules.NewMultiEnv(remote.Environments)
					swappableRules.Swap(multiEnvEngine)
				}
				logger.Info("multi-env rules reloaded from remote", "url", configURL, "envs", len(remote.Environments))
				return nil
			}
			if remote.Rules == "" {
				swappableRules.Swap(rules.Nop{})
				logger.Info("rules cleared (remote rules empty)")
				return nil
			}
			swappableRules.Swap(rules.New(remote.Rules))
			logger.Info("rules reloaded from remote", "url", configURL)
			return nil
		default:
			return fmt.Errorf("no rule source configured (need --rules-file or --config-url)")
		}
	})

	apiRouter := api.NewRouter(uiAuth,
		api.WithCA(caMgr),
		api.WithStore(db),
		api.WithListenAddr(addr),
		api.WithMCPToken(mcpToken),
		api.WithBypass(bypassStore),
		api.WithPinning(pinningDetector),
		api.WithIdentity(identity),
		api.WithReload(reloader),
	)
	srv := proxy.New(proxy.Config{
		Addr:        addr,
		Logger:      logger,
		CA:          caMgr,
		Rules:       swappableRules,
		Scripts:     scriptMgr,
		API:         apiRouter,
		WSHook:      apiRouter.WSHook(),
		Capture:     apiRouter.CaptureStore(),
		ConfigDir:   configDir,
		DataDir:     dataDir,
		RulesDir:    rulesDir,
		ProxyAuth:   proxyAuth,
		AutoSaveDir: autoSaveDir,
		Bypass:      bypassStore,
		Pinning:     pinningDetector,
		Emitter:     emitter,
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	startedAt := time.Now()
	_ = emitter.Emit(ctx, event.Event{
		Type:    event.TypeServerLifecycle,
		Payload: map[string]any{"phase": "start", "addr": addr},
	})

	// 健康事件：每 30 秒一次，跟主 ctx 同生命周期。
	healthTicker := time.NewTicker(30 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				healthTicker.Stop()
				return
			case <-healthTicker.C:
				_ = emitter.Emit(ctx, event.Event{
					Type: event.TypeServerHealth,
					Payload: map[string]any{
						"uptime_sec": int(time.Since(startedAt).Seconds()),
					},
				})
			}
		}
	}()

	errCh := make(chan error, 1)
	go func() { errCh <- srv.Start() }()

	logger.Info("piper server listening", "addr", addr)

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case err := <-errCh:
		if err != nil {
			fmt.Fprintf(os.Stderr, "server exited with error: %v\n", err)
			os.Exit(1)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Stop(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "shutdown error: %v\n", err)
		os.Exit(1)
	}

	_ = emitter.Emit(shutdownCtx, event.Event{
		Type:    event.TypeServerLifecycle,
		Payload: map[string]any{"phase": "stop", "addr": addr, "uptime_sec": int(time.Since(startedAt).Seconds())},
	})
}
