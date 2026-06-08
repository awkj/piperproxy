// Package setup — diagnostics.go：Trust Diagnostics（当前阶段只支持 macOS）。
package setup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type TrustStatus string

const (
	TrustOK      TrustStatus = "ok"
	TrustMissing TrustStatus = "missing"
	TrustUnknown TrustStatus = "unknown"
)

type DiagnosticItem struct {
	Name    string      `json:"name"`
	Status  TrustStatus `json:"status"`
	Message string      `json:"message"`
}

type DiagnosticsResult struct {
	OS    string           `json:"os"`
	Items []DiagnosticItem `json:"items"`
}

// RunDiagnostics 检查 piper CA 的系统信任状态。当前阶段只支持 macOS。
func RunDiagnostics(caPEMPath string) DiagnosticsResult {
	goos := runtime.GOOS
	result := DiagnosticsResult{OS: goos}

	result.Items = append(result.Items, checkCAFileExists(caPEMPath))

	if goos == "darwin" {
		result.Items = append(result.Items, checkMacOSKeychain(caPEMPath))
	} else {
		result.Items = append(result.Items, DiagnosticItem{
			Name:    "系统信任",
			Status:  TrustUnknown,
			Message: "当前阶段仅支持 macOS，其他平台未实现",
		})
	}

	result.Items = append(result.Items, checkProxyPort())
	return result
}

func checkCAFileExists(path string) DiagnosticItem {
	item := DiagnosticItem{Name: "CA 文件"}
	if path == "" {
		item.Status = TrustMissing
		item.Message = "CA 路径为空，piper 可能未生成根证书"
		return item
	}
	if _, err := os.Stat(path); err == nil {
		item.Status = TrustOK
		item.Message = fmt.Sprintf("CA 文件存在：%s", filepath.Base(path))
	} else {
		item.Status = TrustMissing
		item.Message = fmt.Sprintf("CA 文件不存在：%s", path)
	}
	return item
}

func checkMacOSKeychain(caPEMPath string) DiagnosticItem {
	item := DiagnosticItem{Name: "macOS Keychain"}
	for _, kc := range []string{
		"/Library/Keychains/System.keychain",
		filepath.Join(os.Getenv("HOME"), "Library/Keychains/login.keychain-db"),
	} {
		out, err := exec.Command("security", "find-certificate", "-c", "piper CA", kc).CombinedOutput()
		if err == nil && len(out) > 0 {
			item.Status = TrustOK
			item.Message = fmt.Sprintf("piper CA 已安装到 %s", filepath.Base(kc))
			return item
		}
		out, err = exec.Command("security", "find-certificate", "-c", "piper", kc).CombinedOutput()
		if err == nil && strings.Contains(string(out), "piper") {
			item.Status = TrustOK
			item.Message = fmt.Sprintf("piper CA 已安装到 %s", filepath.Base(kc))
			return item
		}
	}
	_ = caPEMPath
	item.Status = TrustMissing
	item.Message = "piper CA 未安装到系统/用户 Keychain；运行 `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \"$(piper ca-path)\"`"
	return item
}

func checkProxyPort() DiagnosticItem {
	item := DiagnosticItem{Name: "代理端口 8899"}
	if runtime.GOOS != "darwin" {
		item.Status = TrustUnknown
		item.Message = "当前阶段仅支持 macOS，其他平台未实现端口检测"
		return item
	}
	out, err := exec.Command("lsof", "-iTCP:8899", "-sTCP:LISTEN", "-n", "-P").Output()
	if err == nil && len(out) > 2 {
		item.Status = TrustOK
		item.Message = "代理端口 8899 正在监听"
	} else {
		item.Status = TrustMissing
		item.Message = "代理端口 8899 未监听；请确认 piper 服务已启动"
	}
	return item
}
