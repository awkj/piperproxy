//go:build !darwin

package main

import "fmt"

// runCAMigrate 在非 darwin 平台上是 no-op：
// 旧版 keychain 集成只在 macOS 启用，其他平台一直是磁盘文件，无需迁移。
func runCAMigrate(_ []string) {
	fmt.Println("ℹ piper ca migrate 仅 macOS 需要。")
	fmt.Println("  其他平台的 root.key 一直就放在数据目录，没有 keychain 集成，无需迁移。")
}
