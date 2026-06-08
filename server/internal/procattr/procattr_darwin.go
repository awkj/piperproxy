package procattr

import (
	"net"
	"os/exec"
	"strconv"
	"strings"
)

func lookup(remoteAddr string) Info {
	_, portStr, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return unknown
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		return unknown
	}

	// lsof -nP -iTCP:<port> -sTCP:ESTABLISHED
	out, err := exec.Command("lsof", "-nP",
		"-iTCP:"+portStr,
		"-sTCP:ESTABLISHED",
		"-F", "pcn", // pid, command, name
	).Output()
	if err != nil {
		return unknown
	}

	// lsof -F 输出格式：每个 fd 一组 p<pid>\nc<cmd>\nn<name>
	// 找匹配 :<port>-> 或 :<port>(ESTABLISHED) 方向的行
	return parseLsofF(out, port)
}

// parseLsofF 解析 lsof -F pcn 输出，找到含 srcPort 的连接返回 Info。
func parseLsofF(out []byte, srcPort int) Info {
	portSuffix := ":" + strconv.Itoa(srcPort) + "->"
	lines := strings.Split(string(out), "\n")

	var curPID int
	var curName string

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		switch line[0] {
		case 'p':
			pid, _ := strconv.Atoi(line[1:])
			curPID = pid
		case 'c':
			curName = line[1:]
		case 'n':
			addr := line[1:]
			if strings.Contains(addr, portSuffix) {
				return Info{PID: curPID, Name: curName}
			}
		}
	}
	return unknown
}
