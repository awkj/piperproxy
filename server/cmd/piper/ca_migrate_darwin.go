//go:build darwin

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	migrateKeychainService = "com.piper.ca"
	migrateKeychainAccount = "root-ca-key"
)

// runCAMigrate 实现 darwin 版迁移：从 Keychain 读出 root.key → 写到磁盘 → 删除 Keychain 条目。
//
// 仅服务老用户：以前 piper 把 root.key 密封在 Keychain，导致每次启动弹授权框；
// 新版改为只用磁盘文件。本命令做一次性迁移，保留原 CA / 信任链不变。
func runCAMigrate(args []string) {
	dataDir, _ := resolveDataDir(args, "migrate")
	keyPath := filepath.Join(dataDir, "certs", "root.key")
	crtPath := filepath.Join(dataDir, "certs", "root.crt")

	// 1. 磁盘已有 key → 不需要迁移
	if _, err := os.Stat(keyPath); err == nil {
		fmt.Printf("✓ root.key 已在磁盘：%s\n  无需迁移。\n", keyPath)
		_ = tryDeleteLegacyKeychainEntry() // 顺手清掉（如果存在）
		return
	}

	// 2. crt 必须存在；缺失说明根本没装过老版 piper
	if _, err := os.Stat(crtPath); errors.Is(err, os.ErrNotExist) {
		fmt.Printf("ℹ 没找到 %s\n", crtPath)
		fmt.Println("  你看起来是首次使用 piper —— 直接启动 piper，会自动生成全新 CA 落到磁盘。")
		fmt.Println("  无需迁移。")
		return
	}

	// 3. 从 Keychain 读 key（这一步会触发最后一次授权弹窗）
	fmt.Println("⏳ 正在从 macOS Keychain 读取旧版 piper 私钥…")
	fmt.Println("   系统会弹一次授权框（最后一次）；点 Always Allow 或输入登录密码即可。")
	keyPEM, err := keychainFindRootKey()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ 读取失败：%v\n\n", err)
		fmt.Fprintln(os.Stderr, "可能原因：")
		fmt.Fprintln(os.Stderr, "  - 你以前从未用过 piper，Keychain 里没存过 → 删除 root.crt 后重新启动，piper 会生成新 CA")
		fmt.Fprintln(os.Stderr, "  - 你点了「拒绝」 → 重新跑一次本命令")
		os.Exit(1)
	}

	// 4. 写到磁盘（0600）
	if err := os.MkdirAll(filepath.Dir(keyPath), 0o700); err != nil {
		fmt.Fprintf(os.Stderr, "✗ 创建目录失败：%v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		fmt.Fprintf(os.Stderr, "✗ 写入 %s 失败：%v\n", keyPath, err)
		os.Exit(1)
	}
	fmt.Printf("✓ root.key 已写入：%s\n", keyPath)

	// 5. 删除 Keychain 条目（不会再弹窗）
	if err := keychainDeleteRootKey(); err != nil {
		fmt.Fprintf(os.Stderr, "⚠ 删除 Keychain 条目失败（不影响使用）：%v\n", err)
		fmt.Fprintln(os.Stderr, "  你可以手动跑：security delete-generic-password -s "+migrateKeychainService)
	} else {
		fmt.Println("✓ Keychain 中的旧条目已清理。")
	}

	fmt.Println("\n完成。下次启动 piper 不会再弹任何授权框，CA / 信任链保持不变。")
}

// keychainFindRootKey 从 Keychain 取出私钥 PEM。
// 用 Output() 而非 CombinedOutput()，避免 stderr 警告污染密钥内容。
func keychainFindRootKey() ([]byte, error) {
	out, err := exec.Command("security", "find-generic-password",
		"-s", migrateKeychainService,
		"-a", migrateKeychainAccount,
		"-w",
	).Output()
	if err != nil {
		return nil, fmt.Errorf("security find-generic-password: %w", err)
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return nil, errors.New("Keychain 里 root-ca-key 为空")
	}
	return []byte(trimmed), nil
}

// keychainDeleteRootKey 删除 Keychain 条目，条目不存在不算错。
func keychainDeleteRootKey() error {
	out, err := exec.Command("security", "delete-generic-password",
		"-s", migrateKeychainService,
		"-a", migrateKeychainAccount,
	).CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "could not be found") ||
			strings.Contains(string(out), "SecKeychainItemDelete") {
			return nil
		}
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// tryDeleteLegacyKeychainEntry: 磁盘已有 key 时顺手清旧条目，失败忽略。
func tryDeleteLegacyKeychainEntry() error {
	if _, err := keychainFindRootKey(); err != nil {
		return nil // 条目不存在，正常
	}
	if err := keychainDeleteRootKey(); err == nil {
		fmt.Println("  顺手清理了 Keychain 里的旧条目。")
	}
	return nil
}
