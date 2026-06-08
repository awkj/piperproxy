// ca.go 实现 `piper ca` 子命令族：
//
//	piper ca info      显示根 CA 元信息
//	piper ca path      打印 root.crt 路径（脚本友好）
//	piper ca migrate   一次性把旧版 macOS Keychain 中的 root.key 迁移到磁盘
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/awkj/piper/server/ca"
	"github.com/awkj/piper/server/internal/paths"
)

func runCASubcmd(args []string) {
	if len(args) < 1 {
		printCAUsage()
		os.Exit(2)
	}
	switch args[0] {
	case "info":
		runCAInfo(args[1:])
	case "path":
		runCAPath(args[1:])
	case "migrate":
		runCAMigrate(args[1:])
	case "reset":
		runCAReset(args[1:])
	case "-h", "--help", "help":
		printCAUsage()
	default:
		fmt.Fprintf(os.Stderr, "piper ca: 未知子命令 %q\n\n", args[0])
		printCAUsage()
		os.Exit(2)
	}
}

func printCAUsage() {
	fmt.Fprint(os.Stderr, `用法：piper ca <子命令>

子命令：
  info      显示根 CA 算法 / 过期时间 / 文件路径
  path      仅打印 root.crt 路径（脚本友好）
  migrate   一次性把旧版 macOS Keychain 中的 root.key 迁移到磁盘
            （仅老用户需要；新用户跳过即可）
  reset     删除现有 CA 并重新生成全新 CA（旧的系统信任会失效）

通用 flag：
  -data-dir 数据目录，默认 $XDG_DATA_HOME/piper 或 ~/.local/share/piper
`)
}

// resolveDataDir 解析 -data-dir flag 或退到默认目录。
func resolveDataDir(args []string, name string) (string, []string) {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	dataDirFlag := fs.String("data-dir", "", "piper 数据目录")
	_ = fs.Parse(args)
	dataDir := *dataDirFlag
	if dataDir == "" {
		d, err := paths.DataDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "piper ca %s: resolve data dir: %v\n", name, err)
			os.Exit(1)
		}
		dataDir = d
	}
	return dataDir, fs.Args()
}

func runCAInfo(args []string) {
	dataDir, _ := resolveDataDir(args, "info")
	mgr, err := ca.NewManager(filepath.Join(dataDir, "certs"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "piper ca info: %v\n", err)
		os.Exit(1)
	}
	info := mgr.Info()
	fmt.Printf("Algorithm    : %s\n", info.Algorithm)
	fmt.Printf("Subject      : %s\n", info.Subject)
	fmt.Printf("NotBefore    : %s\n", time.Unix(info.NotBefore, 0).Format(time.RFC3339))
	fmt.Printf("NotAfter     : %s\n", time.Unix(info.NotAfter, 0).Format(time.RFC3339))
	fmt.Printf("Fingerprint  : %s\n", info.Fingerprint)
	fmt.Printf("CertPath     : %s\n", info.CertPath)
}

func runCAPath(args []string) {
	dataDir, _ := resolveDataDir(args, "path")
	fmt.Println(filepath.Join(dataDir, "certs", "root.crt"))
}

func runCAReset(args []string) {
	fs := flag.NewFlagSet("reset", flag.ExitOnError)
	dataDirFlag := fs.String("data-dir", "", "piper 数据目录")
	yesFlag := fs.Bool("y", false, "跳过确认")
	_ = fs.Parse(args)
	dataDir := *dataDirFlag
	if dataDir == "" {
		d, err := paths.DataDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "piper ca reset: resolve data dir: %v\n", err)
			os.Exit(1)
		}
		dataDir = d
	}
	certsDir := filepath.Join(dataDir, "certs")
	keyPath := filepath.Join(certsDir, "root.key")
	crtPath := filepath.Join(certsDir, "root.crt")

	fmt.Printf("即将重置 CA：\n  %s\n  %s\n\n", keyPath, crtPath)
	fmt.Println("⚠ 旧的系统信任链会失效，需要重新执行：")
	fmt.Printf("  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain %s\n\n", crtPath)

	if !*yesFlag {
		fmt.Print("确认继续？输入 yes 回车：")
		var s string
		_, _ = fmt.Scanln(&s)
		if s != "yes" {
			fmt.Println("已取消。")
			return
		}
	}

	_ = os.Remove(keyPath)
	_ = os.Remove(crtPath)
	mgr, err := ca.NewManager(certsDir) // 现在两边都不存在 → 走全新安装路径
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ 重生失败：%v\n", err)
		os.Exit(1)
	}
	info := mgr.Info()
	fmt.Printf("\n✓ 已生成新 CA（fingerprint=%s）\n", info.Fingerprint)
	fmt.Printf("  %s\n", info.CertPath)
	fmt.Println("\n下一步：把新 root.crt 装到系统信任链（见上面的 sudo 命令）。")
}
