// Package setup — registry.go：Developer Setup Hub target 注册表。
package setup

// TargetCategory 是 target 所属的大类。
type TargetCategory string

const (
	CategoryRuntime     TargetCategory = "runtime"
	CategoryClient      TargetCategory = "client"
	CategoryDevice      TargetCategory = "device"
	CategoryFramework   TargetCategory = "framework"
	CategoryEnvironment TargetCategory = "environment"
)

// ShellVariant 是 snippet 的 shell 方言。
type ShellVariant string

const (
	ShellBash       ShellVariant = "bash"
	ShellZsh        ShellVariant = "zsh"
	ShellFish       ShellVariant = "fish"
	ShellPowerShell ShellVariant = "powershell"
	ShellCmd        ShellVariant = "cmd"
)

// Snippet 是单条可复制的代理配置片段。
type Snippet struct {
	Shell   ShellVariant `json:"shell"`
	Content string       `json:"content"`
}

// Target 是一个 setup target 的完整描述。
type Target struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Category TargetCategory `json:"category"`
	// Snippets 按 shell 变体列出，优先展示与当前 OS 匹配的那个。
	Snippets []Snippet `json:"snippets"`
	// TestScript 是内嵌的测试脚本内容（bash/sh）；空字符串表示暂无测试。
	TestScript string `json:"testScript"`
	// Docs 是简短说明文本（可含 Markdown）。
	Docs string `json:"docs"`
}

// Registry 是全部 target 的只读注册表。
type Registry struct {
	targets []Target
	byID    map[string]*Target
}

// All 返回全部 target 的只读切片。
func (r *Registry) All() []Target { return r.targets }

// ByID 按 id 查找 target；未找到返回 nil。
func (r *Registry) ByID(id string) *Target {
	t, ok := r.byID[id]
	if !ok {
		return nil
	}
	return t
}

// DefaultRegistry 是包级全局注册表，通过 init() 填充。
var DefaultRegistry = buildRegistry()

// buildRegistry 构造并返回内置注册表。
func buildRegistry() *Registry {
	targets := defaultTargets()
	r := &Registry{
		targets: targets,
		byID:    make(map[string]*Target, len(targets)),
	}
	for i := range r.targets {
		r.byID[r.targets[i].ID] = &r.targets[i]
	}
	return r
}

func defaultTargets() []Target {
	proxyExport := proxyEnvSnippets()
	return []Target{
		// ── Runtime ──────────────────────────────────────────────────────────
		{
			ID: "nodejs", Name: "Node.js", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export NODE_EXTRA_CA_CERTS="$(piper ca-path)"
export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
node your-script.js`,
			}),
			TestScript: nodeTestScript(),
			Docs:       "通过 `NODE_EXTRA_CA_CERTS` 信任 piper CA；HTTP_PROXY / HTTPS_PROXY 将流量路由到代理。",
		},
		{
			ID: "python", Name: "Python", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export REQUESTS_CA_BUNDLE="$(piper ca-path)"
export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
python your_script.py`,
			}),
			TestScript: pythonTestScript(),
			Docs:       "requests / httpx 均遵从 REQUESTS_CA_BUNDLE 与 HTTP_PROXY 环境变量。",
		},
		{
			ID: "ruby", Name: "Ruby", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export SSL_CERT_FILE="$(piper ca-path)"
export http_proxy=http://127.0.0.1:8899
export https_proxy=http://127.0.0.1:8899
ruby your_script.rb`,
			}),
			TestScript: "",
			Docs:       "Ruby Net::HTTP 遵从 http_proxy / https_proxy；SSL_CERT_FILE 指向额外 CA bundle。",
		},
		{
			ID: "go", Name: "Go", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export SSL_CERT_FILE="$(piper ca-path)"
go run main.go`,
			}),
			TestScript: "",
			Docs:       "Go net/http 默认读取 HTTP_PROXY / HTTPS_PROXY；可通过 crypto/x509.SystemCertPool 或 SSL_CERT_FILE 信任 CA。",
		},
		{
			ID: "rust", Name: "Rust", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export SSL_CERT_FILE="$(piper ca-path)"
cargo run`,
			}),
			TestScript: "",
			Docs:       "reqwest / hyper 均遵从标准代理环境变量；SSL_CERT_FILE 补充根 CA。",
		},
		{
			ID: "java", Name: "Java", Category: CategoryRuntime,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# 先将 piper CA 导入 Java keystore
keytool -importcert -trustcacerts \
  -alias piper-ca \
  -file "$(piper ca-path)" \
  -keystore "$JAVA_HOME/lib/security/cacerts" \
  -storepass changeit -noprompt

export JAVA_TOOL_OPTIONS="-Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=8899 -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=8899"
java -jar your-app.jar`,
			}},
			TestScript: "",
			Docs:       "Java 使用自带 keystore；需手动导入 piper CA，然后通过 JVM 属性配置代理。",
		},
		{
			ID: "php", Name: "PHP", Category: CategoryRuntime,
			Snippets: append(proxyExport, Snippet{
				Shell: ShellBash,
				Content: `export http_proxy=http://127.0.0.1:8899
export https_proxy=http://127.0.0.1:8899
export SSL_CERT_FILE="$(piper ca-path)"
php your_script.php`,
			}),
			TestScript: "",
			Docs:       "PHP cURL 扩展遵从 http_proxy / https_proxy 与 SSL_CERT_FILE。",
		},
		{
			ID: "dotnet", Name: ".NET", Category: CategoryRuntime,
			Snippets: []Snippet{{
				Shell:   ShellPowerShell,
				Content: `$env:HTTP_PROXY  = "http://127.0.0.1:8899"
$env:HTTPS_PROXY = "http://127.0.0.1:8899"
# 信任 piper CA（需管理员权限）
Import-Certificate -FilePath (piper ca-path) -CertStoreLocation Cert:\LocalMachine\Root
dotnet run`,
			}, {
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
# Linux/macOS 下需更新系统根 CA，或在代码中加载 piper CA PEM
dotnet run`,
			}},
			TestScript: "",
			Docs:       ".NET HttpClient 遵从 HTTP_PROXY / HTTPS_PROXY；Windows 下信任系统根 CA store。",
		},
		// ── Client ───────────────────────────────────────────────────────────
		{
			ID: "curl", Name: "cURL", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `curl -x http://127.0.0.1:8899 \
  --cacert "$(piper ca-path)" \
  https://example.com`,
			}, {
				Shell:   ShellPowerShell,
				Content: `curl.exe -x http://127.0.0.1:8899 --cacert (piper ca-path) https://example.com`,
			}},
			TestScript: curlTestScript(),
			Docs:       "通过 `-x` 指定代理，`--cacert` 信任 piper CA。",
		},
		{
			ID: "httpie", Name: "HTTPie", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export REQUESTS_CA_BUNDLE="$(piper ca-path)"
http https://example.com`,
			}},
			TestScript: "",
			Docs:       "HTTPie 基于 requests，遵从标准代理与 CA bundle 环境变量。",
		},
		{
			ID: "git", Name: "git", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `git config --global http.proxy  http://127.0.0.1:8899
git config --global https.proxy http://127.0.0.1:8899
git config --global http.sslCAInfo "$(piper ca-path)"`,
			}},
			TestScript: "",
			Docs:       "通过 git config 全局设置代理与自定义 CA；不影响 SSH 通道。",
		},
		{
			ID: "npm", Name: "npm", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `npm config set proxy      http://127.0.0.1:8899
npm config set https-proxy http://127.0.0.1:8899
npm config set cafile "$(piper ca-path)"`,
			}},
			TestScript: "",
			Docs:       "通过 npm config 持久化代理；cafile 信任 piper CA。",
		},
		{
			ID: "pnpm", Name: "pnpm", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `pnpm config set proxy      http://127.0.0.1:8899
pnpm config set https-proxy http://127.0.0.1:8899
pnpm config set cafile "$(piper ca-path)"`,
			}},
			TestScript: "",
			Docs:       "与 npm config 语法相同，pnpm 共享 .npmrc 配置文件。",
		},
		{
			ID: "pip", Name: "pip", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export REQUESTS_CA_BUNDLE="$(piper ca-path)"
pip install some-package`,
			}},
			TestScript: "",
			Docs:       "pip 底层使用 requests，遵从 REQUESTS_CA_BUNDLE 与标准代理变量。",
		},
		{
			ID: "cargo", Name: "cargo", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export SSL_CERT_FILE="$(piper ca-path)"
cargo build`,
			}},
			TestScript: "",
			Docs:       "cargo 遵从标准代理与 SSL_CERT_FILE 环境变量。",
		},
		{
			ID: "wget", Name: "wget", Category: CategoryClient,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export http_proxy=http://127.0.0.1:8899
export https_proxy=http://127.0.0.1:8899
wget --ca-certificate="$(piper ca-path)" https://example.com`,
			}},
			TestScript: "",
			Docs:       "wget 通过 http_proxy / https_proxy 及 --ca-certificate 信任 CA。",
		},
		// ── Device ───────────────────────────────────────────────────────────
		{
			ID: "ios-device", Name: "iOS Device", Category: CategoryDevice,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# 1. 手机 Wi-Fi → 代理 → 手动，填写:
#    服务器: <你的局域网 IP>  端口: 8899
# 2. Safari 访问 http://<你的局域网 IP>:8899 下载 CA 证书
# 3. 设置 → 通用 → VPN 与设备管理 → 安装描述文件
# 4. 设置 → 通用 → 关于本机 → 证书信任设置 → 开启 piper CA 完全信任`,
			}},
			TestScript: "",
			Docs:       "iOS 需手动安装并信任根 CA，然后在 Wi-Fi 设置中指定代理地址。",
		},
		{
			ID: "ios-simulator", Name: "iOS Simulator", Category: CategoryDevice,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# macOS 上模拟器共享系统代理，只需信任 piper CA：
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$(piper ca-path)"
# 模拟器会自动继承 macOS 系统代理 http://127.0.0.1:8899`,
			}},
			TestScript: "",
			Docs:       "iOS Simulator 共享 macOS 系统代理，将 piper CA 安装到系统 Keychain 即可。",
		},
		{
			ID: "android-device", Name: "Android Device", Category: CategoryDevice,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# 1. 手机 Wi-Fi → 高级 → 代理 → 手动，填写:
#    主机名: <你的局域网 IP>  端口: 8899
# 2. 浏览器访问 http://<局域网 IP>:8899/api/certs/root.pem 下载 CA
# 3. 设置 → 安全 → 加密与凭据 → 安装证书（或从文件安装）
# Android 7+ 用户空间 App 不信任用户 CA，需 network_security_config 白名单
# 或设备 root + Magisk TrustUserCerts 模块`,
			}},
			TestScript: "",
			Docs:       "Android 7+ 要求应用明确信任用户 CA；调试 App 可在 AndroidManifest 中配置 network_security_config。",
		},
		{
			ID: "android-emulator", Name: "Android Emulator", Category: CategoryDevice,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# 启动时注入代理
emulator -avd <AVD名称> \
  -http-proxy http://127.0.0.1:8899

# 信任 piper CA（需要 writable system image）
adb root
adb remount
adb push "$(piper ca-path)" /system/etc/security/cacerts/piper.pem
adb shell chmod 644 /system/etc/security/cacerts/piper.pem
adb reboot`,
			}},
			TestScript: "",
			Docs:       "Android Emulator 支持 -http-proxy 参数；系统 CA 需 root 权限写入 /system/etc/security/cacerts。",
		},
		// ── Framework ────────────────────────────────────────────────────────
		{
			ID: "react-native", Name: "React Native", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# Metro bundler 及 npm 的网络调用走代理
export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export NODE_EXTRA_CA_CERTS="$(piper ca-path)"

# iOS Simulator 抓包：安装 piper CA 到系统 Keychain（见 iOS Simulator target）
# Android Emulator：在 app/src/main/res/xml/network_security_config.xml 添加用户 CA 信任`,
			}},
			TestScript: "",
			Docs:       "Metro bundler 遵从 NODE_EXTRA_CA_CERTS；设备端需独立配置（见 iOS Simulator / Android Emulator target）。",
		},
		{
			ID: "flutter", Name: "Flutter", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# Dart pub / flutter tools
export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899

# Dart 代码内显式设置（可选）
# HttpClient client = HttpClient()
#   ..findProxy = (uri) => 'PROXY 127.0.0.1:8899'
#   ..badCertificateCallback = (_, __, ___) => true; // 仅调试!`,
			}},
			TestScript: "",
			Docs:       "flutter/dart pub 遵从 HTTP_PROXY；App 内部 HttpClient 需手动设置 findProxy 及证书信任。",
		},
		{
			ID: "electron", Name: "Electron", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# Electron 主进程启动参数
# electron --proxy-server="http://127.0.0.1:8899" --ignore-certificate-errors
# 或通过 app.commandLine.appendSwitch:
# app.commandLine.appendSwitch('proxy-server', 'http://127.0.0.1:8899')

export NODE_EXTRA_CA_CERTS="$(piper ca-path)"
npm start`,
			}},
			TestScript: "",
			Docs:       "Electron 主进程通过 --proxy-server 指定代理；NODE_EXTRA_CA_CERTS 信任 piper CA（Node.js 侧）。",
		},
		{
			ID: "nextjs", Name: "Next.js", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export NODE_EXTRA_CA_CERTS="$(piper ca-path)"
export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
npx next dev`,
			}},
			TestScript: "",
			Docs:       "Next.js 服务端 fetch / undici 遵从 NODE_EXTRA_CA_CERTS 与 HTTP_PROXY。",
		},
		{
			ID: "docker", Name: "Docker", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# ~/.docker/config.json（Docker 守护进程代理，需重启 Docker）
# {
#   "proxies": {
#     "default": {
#       "httpProxy": "http://host.docker.internal:8899",
#       "httpsProxy": "http://host.docker.internal:8899"
#     }
#   }
# }

# 或者在 Dockerfile / compose 里注入（容器内访问宿主机代理）
export HTTP_PROXY=http://host.docker.internal:8899
export HTTPS_PROXY=http://host.docker.internal:8899

# 信任 piper CA（Dockerfile 内）
# COPY piper-ca.pem /usr/local/share/ca-certificates/piper.crt
# RUN update-ca-certificates`,
			}},
			TestScript: "",
			Docs:       "容器内通过 host.docker.internal:8899 访问宿主机代理；根 CA 需 COPY 到容器并 update-ca-certificates。",
		},
		{
			ID: "kubernetes", Name: "Kubernetes", Category: CategoryFramework,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# 在 Pod spec 注入代理环境变量
# env:
#   - name: HTTP_PROXY
#     value: "http://<node-IP>:8899"
#   - name: HTTPS_PROXY
#     value: "http://<node-IP>:8899"

# 或使用 ConfigMap 挂载 piper CA
kubectl create configmap piper-ca \
  --from-file=piper.crt="$(piper ca-path)"
# 再 volumeMount 到容器的 /usr/local/share/ca-certificates/`,
			}},
			TestScript: "",
			Docs:       "通过 Pod 环境变量注入代理；根 CA 可用 ConfigMap 挂载到各容器。",
		},
		// ── Environment ──────────────────────────────────────────────────────
		{
			ID: "browser-chrome", Name: "Chrome", Category: CategoryEnvironment,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# macOS
open -a "Google Chrome" \
  --args --proxy-server="http://127.0.0.1:8899" \
          --ignore-certificate-errors`,
			}, {
				Shell:   ShellPowerShell,
				Content: `# Windows
Start-Process "chrome.exe" "--proxy-server=http://127.0.0.1:8899 --ignore-certificate-errors"`,
			}},
			TestScript: "",
			Docs:       "Chrome 通过启动参数指定代理；生产环境建议安装 piper CA 到系统根 CA 而非使用 --ignore-certificate-errors。",
		},
		{
			ID: "browser-firefox", Name: "Firefox", Category: CategoryEnvironment,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# Firefox 有独立证书库，需手动安装 piper CA：
# 关于 Firefox → 证书 → 查看证书 → 证书颁发机构 → 导入
# 选择 "$(piper ca-path)"，勾选"信任此 CA 以标识网站"
# 然后在 首选项 → 网络设置 → 设置手动代理:
#   HTTP 代理: 127.0.0.1  端口: 8899
#   勾选"对所有协议使用此代理"`,
			}},
			TestScript: "",
			Docs:       "Firefox 不使用系统 CA 库，需在 Firefox 内部证书管理器单独导入 piper CA。",
		},
		{
			ID: "macos-terminal", Name: "macOS Terminal", Category: CategoryEnvironment,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899
export ALL_PROXY=http://127.0.0.1:8899

# 信任 piper CA（全局）
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$(piper ca-path)"`,
			}, {
				Shell: ShellFish,
				Content: `set -x HTTP_PROXY  http://127.0.0.1:8899
set -x HTTPS_PROXY http://127.0.0.1:8899
set -x ALL_PROXY   http://127.0.0.1:8899`,
			}},
			TestScript: shellTestScript(),
			Docs:       "导出代理环境变量后，当前 shell 中的大多数命令行工具将自动走代理。",
		},
		{
			ID: "windows", Name: "Windows", Category: CategoryEnvironment,
			Snippets: []Snippet{{
				Shell:   ShellPowerShell,
				Content: `$env:HTTP_PROXY  = "http://127.0.0.1:8899"
$env:HTTPS_PROXY = "http://127.0.0.1:8899"
$env:ALL_PROXY   = "http://127.0.0.1:8899"

# 信任 piper CA（管理员 PowerShell）
Import-Certificate -FilePath (piper ca-path) -CertStoreLocation Cert:\LocalMachine\Root`,
			}, {
				Shell:   ShellCmd,
				Content: `set HTTP_PROXY=http://127.0.0.1:8899
set HTTPS_PROXY=http://127.0.0.1:8899
set ALL_PROXY=http://127.0.0.1:8899`,
			}},
			TestScript: "",
			Docs:       "PowerShell 通过 $env: 设置环境变量；CA 信任需管理员权限写入 LocalMachine\\Root store。",
		},
		{
			ID: "wsl", Name: "WSL", Category: CategoryEnvironment,
			Snippets: []Snippet{{
				Shell: ShellBash,
				Content: `# WSL 内访问 Windows 宿主机代理（WSL2）
WINDOWS_HOST=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
export HTTP_PROXY=http://${WINDOWS_HOST}:8899
export HTTPS_PROXY=http://${WINDOWS_HOST}:8899

# 信任 piper CA
sudo cp "$(piper ca-path)" /usr/local/share/ca-certificates/piper.crt
sudo update-ca-certificates`,
			}},
			TestScript: "",
			Docs:       "WSL2 通过 /etc/resolv.conf 的 nameserver 找到 Windows 宿主机 IP；CA 需导入 WSL 的 Linux 根 CA 库。",
		},
	}
}

// proxyEnvSnippets 返回通用的代理环境变量片段（bash + fish + powershell）。
func proxyEnvSnippets() []Snippet {
	return []Snippet{
		{Shell: ShellBash, Content: `export HTTP_PROXY=http://127.0.0.1:8899
export HTTPS_PROXY=http://127.0.0.1:8899`},
		{Shell: ShellFish, Content: `set -x HTTP_PROXY  http://127.0.0.1:8899
set -x HTTPS_PROXY http://127.0.0.1:8899`},
		{Shell: ShellPowerShell, Content: `$env:HTTP_PROXY  = "http://127.0.0.1:8899"
$env:HTTPS_PROXY = "http://127.0.0.1:8899"`},
	}
}

// nodeTestScript 返回 Node.js 验证脚本。
func nodeTestScript() string {
	return `node -e "
  fetch('https://example.com').then(r => {
    process.stdout.write('STATUS=' + r.status + '\n');
    process.exit(0);
  }).catch(e => {
    process.stderr.write('ERROR=' + e.message + '\n');
    process.exit(1);
  });
"`
}

// pythonTestScript 返回 Python 验证脚本。
func pythonTestScript() string {
	return `python3 -c "
import urllib.request
try:
    res = urllib.request.urlopen('https://example.com')
    print('STATUS=' + str(res.status))
except Exception as e:
    import sys
    print('ERROR=' + str(e), file=sys.stderr)
    sys.exit(1)
"`
}

// curlTestScript 返回 cURL 验证脚本。
func curlTestScript() string {
	return `curl -s -o /dev/null -w "STATUS=%{http_code}\n" \
  -x http://127.0.0.1:8899 \
  --cacert "$(piper ca-path)" \
  https://example.com`
}

// shellTestScript 返回通用 shell 验证脚本。
func shellTestScript() string {
	return `curl -s -o /dev/null -w "STATUS=%{http_code}\n" \
  -x http://127.0.0.1:8899 \
  https://example.com`
}
