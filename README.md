# ReAct 8-bit Agent Studio

把 OpenCode 的真实推理、工具调用与观察结果，映射成一间会移动的 8-bit Agent 工作室。

## 能做什么

- 自动探测并启动本机 OpenCode Server，或连接一个已知 Server。
- 优先消费 `/api/event`，自动回退 `/event`。
- 在 CSS 像素房间里呈现 Thought → Action → Observation → Answer。
- 为 build、plan、explore 与自定义 Agent 分配稳定人格。
- 在右侧查看会话、reasoning、工具输入/输出和错误。
- 使用可选 OpenCode 插件捕获每次模型调用的 Semantic Context。
- Context 完整、不截断、递归脱敏、仅驻留内存，可一键复制。

## 启动

要求 Node.js 20+，以及已经配置好模型的 OpenCode 1.16.2。

```bash
npm install
npm run plugin:setup
./studio.sh
```

脚本会为 Studio 与 OpenCode 分别选择空闲端口并打印访问地址，不会复用或关闭其他程序占用的端口。关闭脚本终端或按 `Ctrl-C` 会自动停止 Studio 与它托管的 OpenCode。

```bash
./studio.sh restart  # 停止脚本管理的旧实例并以前台模式重启
./studio.sh stop     # 从另一个终端停止
./studio.sh status   # 查看 PID 与实际端口
```

如果显式设置 `STUDIO_PORT` 或 `OPENCODE_PORT`，脚本会在端口被占用时直接报错，不会连接或终止占用者。首次安装 Context 插件后需要重启 OpenCode；Studio 自己管理的 OpenCode 会随脚本重启。

不安装插件也可以使用工作室，只是不会出现 Semantic Context 卡片。

## 连接模式

默认使用 Managed 模式：

- 尝试连接 `http://127.0.0.1:4096`。
- 端口没有服务时，自动启动 `opencode serve`。
- Managed Server 使用随机 Basic Auth 密码并只绑定 localhost。

也可以点击右上角齿轮，连接已有 OpenCode Server。启动已有 TUI 时需要给它一个已知端口：

```bash
opencode --hostname 127.0.0.1 --port 4096
```

可通过环境变量覆盖默认值：

```bash
OPENCODE_URL=http://127.0.0.1:4096 \
OPENCODE_SERVER_PASSWORD=your-password \
OPENCODE_DIRECTORY=/path/to/project \
npm run dev
```

## macOS / Windows / WSL

- macOS：探测 PATH、`~/.opencode/bin/opencode`、Homebrew。
- Windows Native：探测 `where.exe`、用户安装目录、NPM、Scoop。
- WSL：作为独立平台运行，保留 Linux 路径；Windows 浏览器连接 WSL 的 localhost Server。
- 使用 `opencode debug paths` 获取真实配置目录，不硬编码配置路径。

Windows 第一版具有 adapter 与自动测试覆盖，但仍建议优先使用 WSL。

## 插件管理

```bash
npm run plugin:setup
npm run plugin:uninstall
```

安装脚本会：

- 询问 OpenCode 自己的 config 路径。
- 备份同名旧插件。
- 安装 `react-8bit-studio.js`。
- 创建仅供 localhost capture endpoint 使用的随机 token。

卸载只删除本项目插件与 capture 配置，不删除备份。

## 验证

```bash
npm test
npm run test:e2e
npm run build
```

GitHub Actions 会在 macOS 与 Windows 上运行 adapter/unit/build，并在 Linux Chromium 中执行浏览器 E2E。

项目是本地应用：浏览器、Node bridge、OpenCode 和 capture 插件共同工作，因此不发布为公共静态站点。
