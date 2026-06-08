package ca

import (
	"fmt"
	"os/exec"
	"strings"
)

// runCmd 执行系统命令，返回合并输出和错误。
func runCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		return output, fmt.Errorf("%s %s: %w\n%s", name, strings.Join(args, " "), err, output)
	}
	return output, nil
}
