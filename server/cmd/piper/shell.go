// shell.go 实现 `piper shell` 子命令。
// 一键起一个已注入 HTTP_PROXY / HTTPS_PROXY / CA 信任等环境变量的子 shell。
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/awkj/piper/server/internal/paths"
)

// shellEnvVars 构造所有需要注入的环境变量键值对。
// proxyURL 形如 "http://127.0.0.1:8899"，caPath 是根证书 PEM 文件的绝对路径。
func shellEnvVars(proxyURL, caPath string) map[string]string {
	return map[string]string{
		"HTTP_PROXY":           proxyURL,
		"HTTPS_PROXY":          proxyURL,
		"http_proxy":           proxyURL,
		"https_proxy":          proxyURL,
		"NO_PROXY":             "localhost,127.0.0.1,::1",
		"no_proxy":             "localhost,127.0.0.1,::1",
		"NODE_EXTRA_CA_CERTS":  caPath,
		"SSL_CERT_FILE":        caPath,
		"REQUESTS_CA_BUNDLE":   caPath,
		"CURL_CA_BUNDLE":       caPath,
		"GIT_SSL_CAINFO":       caPath,
	}
}

// shellExportScript 生成可 source 的 shell 脚本（POSIX sh 语法）。
func shellExportScript(proxyURL, caPath string, addPS1Prefix bool) string {
	var sb strings.Builder
	envs := shellEnvVars(proxyURL, caPath)
	// 按稳定顺序输出，方便测试。
	keys := []string{
		"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
		"NO_PROXY", "no_proxy",
		"NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE",
		"REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "GIT_SSL_CAINFO",
	}
	for _, k := range keys {
		fmt.Fprintf(&sb, "export %s='%s'\n", k, envs[k])
	}
	if addPS1Prefix {
		sb.WriteString("export PS1='(piper) '\"$PS1\"\n")
	}
	return sb.String()
}

// detectShell 从 $SHELL 环境变量推断 shell 名称（basename）。
// 当前阶段只支持 macOS，其他平台不实现。
func detectShell() string {
	sh := os.Getenv("SHELL")
	if sh == "" {
		return "sh"
	}
	return filepath.Base(sh)
}

// runShellCmd 根据 shell 类型和注入变量构造并 exec 子进程。
// 当前阶段只支持 macOS POSIX 系（bash/zsh/sh/dash/ksh/fish）。
func runShellCmd(shellName, shellBin string, envs map[string]string, addPS1Prefix bool) error {
	var cmd *exec.Cmd

	switch shellName {
	case "fish":
		var initCmds []string
		for k, v := range envs {
			initCmds = append(initCmds, fmt.Sprintf("set -gx %s '%s'", k, v))
		}
		_ = addPS1Prefix
		initCmds = append(initCmds, "functions --erase fish_greeting 2>/dev/null; echo '(piper) shell ready'")
		cmd = exec.Command(shellBin, "--init-command", strings.Join(initCmds, "; "))

	default:
		// bash / zsh / sh / dash / ksh 等 POSIX shell
		// 生成临时 rcfile：先 source 用户配置，再 export 注入变量。
		rcContent := shellSourceLine(shellName)
		keys := []string{
			"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
			"NO_PROXY", "no_proxy",
			"NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE",
			"REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "GIT_SSL_CAINFO",
		}
		for _, k := range keys {
			rcContent += fmt.Sprintf("export %s='%s'\n", k, envs[k])
		}
		if addPS1Prefix {
			rcContent += "export PS1='(piper) '\"$PS1\"\n"
		}
		rcContent += `echo "(piper) shell ready"` + "\n"

		tmp, err := os.CreateTemp("", "piper-rc-*.sh")
		if err != nil {
			return fmt.Errorf("create rcfile: %w", err)
		}
		tmpPath := tmp.Name()
		defer os.Remove(tmpPath)

		if _, err := tmp.WriteString(rcContent); err != nil {
			tmp.Close()
			return fmt.Errorf("write rcfile: %w", err)
		}
		tmp.Close()

		// bash 用 --rcfile；zsh 用 ZDOTDIR 重定向（较复杂，暂用 ENV）；其他 sh 用 ENV。
		switch shellName {
		case "bash":
			cmd = exec.Command(shellBin, "--rcfile", tmpPath)
		case "zsh":
			// zsh 不支持 --rcfile；用 ZDOTDIR 指向临时目录，把 rcfile 命名为 .zshrc。
			zshDir, err := os.MkdirTemp("", "piper-zsh-*")
			if err != nil {
				return fmt.Errorf("create zdotdir: %w", err)
			}
			defer os.RemoveAll(zshDir)
			zshrc := filepath.Join(zshDir, ".zshrc")
			// zsh 的 .zshrc 先 source 用户真实 .zshrc，再 export 变量。
			userZshrc := filepath.Join(os.Getenv("HOME"), ".zshrc")
			zshContent := fmt.Sprintf("[ -f '%s' ] && source '%s' 2>/dev/null\n", userZshrc, userZshrc)
			zshContent += rcContent[len(shellSourceLine(shellName)):] // 去掉 source 行，已自带
			if err := os.WriteFile(zshrc, []byte(zshContent), 0o600); err != nil {
				return fmt.Errorf("write zshrc: %w", err)
			}
			cmd = exec.Command(shellBin)
			cmd.Env = append(os.Environ(), "ZDOTDIR="+zshDir)
		default:
			// sh/dash/ksh：ENV 变量
			cmd = exec.Command(shellBin)
			cmd.Env = append(os.Environ(), "ENV="+tmpPath)
		}
	}

	if cmd.Env == nil {
		cmd.Env = os.Environ()
	}
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// shellSourceLine 返回该 shell 加载用户配置文件的命令（带换行）。
func shellSourceLine(shellName string) string {
	home := os.Getenv("HOME")
	switch shellName {
	case "bash":
		return fmt.Sprintf("[ -f '%s/.bashrc' ] && source '%s/.bashrc' 2>/dev/null\n", home, home)
	default:
		return "" // sh/dash/ksh 通过 ENV 加载，不需要额外 source
	}
}

// runShellSubcmd 解析 `piper shell` 的参数并执行。
func runShellSubcmd(args []string) {
	fs := flag.NewFlagSet("shell", flag.ExitOnError)
	shellFlag := fs.String("shell", "", "指定 shell（bash|zsh|fish|sh）；默认自动检测")
	portFlag := fs.Int("port", 8899, "piper 代理端口")
	noPrefixFlag := fs.Bool("no-prefix", false, "不在 PS1 添加 (piper) 前缀")
	exportOnlyFlag := fs.Bool("export-only", false, "只输出可 source 的 export 脚本，不起 shell")
	dataDirFlag := fs.String("data-dir", "", "piper 数据目录（默认 $XDG_DATA_HOME/piper 或 ~/.local/share/piper）")
	_ = fs.Parse(args)

	// 解析数据目录（CA 根证书在这里）
	dataDir := *dataDirFlag
	if dataDir == "" {
		d, err := paths.DataDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "piper shell: resolve data dir: %v\n", err)
			os.Exit(1)
		}
		dataDir = d
	}

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", *portFlag)
	caPath := filepath.Join(dataDir, "certs", "root.crt")

	// --export-only：只打印脚本
	if *exportOnlyFlag {
		fmt.Print(shellExportScript(proxyURL, caPath, !*noPrefixFlag))
		return
	}

	// 确定 shell
	shellName := *shellFlag
	if shellName == "" {
		shellName = detectShell()
	}
	shellBin, err := exec.LookPath(shellName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "piper shell: shell not found: %s\n", shellName)
		os.Exit(1)
	}

	envs := shellEnvVars(proxyURL, caPath)
	if err := runShellCmd(shellName, shellBin, envs, !*noPrefixFlag); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "piper shell: %v\n", err)
		os.Exit(1)
	}
}
