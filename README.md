# ReAct 8-bit Agent Studio

把 OpenCode 的真实 ReAct 交互编译成一部可以暂停、逐步和追溯证据的像素动画。它不是给 Agent 加一段虚构的“内心戏”，而是把已经发生的 reasoning、工具调用、观察结果和回答变成大众能看懂的小剧场。

## 现在可以看到什么

- 实时观看 Agent 收信、思考、前往工作站、操作工具、读取结果并发布答案。
- 一次完整交互结束后，点击用户消息上的“回放”，观看完整动画分镜。
- 暂停、上一步/下一步、拖动时间轴、0.5×/1×/2×、导演版/精简版。
- 点击动画字幕打开学习检查器，从通俗说明回到真实 reasoning、工具 input/output 和消息标识。
- 每个分镜都可以通过 `session + message + cue` URL 分享和刷新定位。
- 右侧继续提供完整 Chatbox 与可展开、可复制的 Semantic Context JSON。

首版为 `bash`、`read/glob/grep`、`edit/write/patch`、`websearch/webfetch`、`todo`、`task/subagent` 编排了独立剧情。未知工具会进入 LAB，依次演出输入、执行和输出，不会丢事件。

## 从 Trace 到动画

```text
OpenCode messages / SSE / Context
              │
              ▼
TurnTrace（一次真实用户交互）
              │  SceneCompiler + ToolSceneAdapter
              ▼
SceneCue[]（带证据引用的分镜）
              │  TimelinePlayer 虚拟时间
              ▼
Canvas 400×240 像素房间 + DOM Chatbox / Inspector
```

三种证据等级：

- `exact`：字幕或字段直接来自 OpenCode 原始数据。
- `derived`：使用固定规则解释真实工具行为，例如“Agent 把查询卡交给网络搜索工具”。
- `ambient`：灯光、粒子、灰尘等无语义装饰。

所有非装饰镜头都携带 `traceNodeIds`。reasoning 只按原始标点切成字幕节拍，不调用第二个 LLM、不补写思维；完整原文与 JSON 始终可以在检查器中查看。Semantic Context 是脱敏后的语义快照，不宣称与 Provider 最终 HTTP body 字节级一致。

## 播放器

- `Space`：播放/暂停
- `←` / `→`：上一步/下一步
- `Shift + ←` / `Shift + →`：上一章/下一章
- `1` / `2` / `3`：0.5× / 1× / 2×
- `LIVE`：退出历史回放，追到最新实时事件
- 点击场景字幕：打开这一镜的说明和原始证据

浏览器开启 `prefers-reduced-motion` 时会关闭多余过渡。Canvas 使用固定 `400×240` 内部坐标与最近邻缩放，房间不会被长消息撑大；Chatbox 独立滚动。

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

如果显式设置 `STUDIO_PORT` 或 `OPENCODE_PORT`，脚本会在端口被占用时直接报错。首次安装 Context 插件后需要重启 OpenCode；不安装插件也可以运行，只是没有模型调用 Context 卡。

也可以点击右上角齿轮 Attach 到已有 OpenCode Server：

```bash
opencode --hostname 127.0.0.1 --port 4096

OPENCODE_URL=http://127.0.0.1:4096 \
OPENCODE_SERVER_PASSWORD=your-password \
OPENCODE_DIRECTORY=/path/to/project \
npm run dev
```

## macOS / Windows / WSL

- macOS：探测 PATH、`~/.opencode/bin/opencode`、Homebrew。
- Windows Native：探测 `where.exe`、用户安装目录、NPM、Scoop。
- WSL：作为独立平台运行并保留 Linux 路径。
- 使用 `opencode debug paths` 获取真实配置目录，不硬编码 Unix 路径。

Windows adapter 与 CI 已保留；当前实机开发和验收以 macOS 为主。

## 原创像素资产

运行时资产位于 `public/assets/studio-v1/`：

- `character/`：四方向行走表。
- `actions/`：think、type、read、wait、speak、success、error 动作表。

每组均保留生成提示词、原始清理图、透明 spritesheet、逐帧 PNG、GIF 预览和 `pipeline-meta.json` QC 信息。素材使用项目内的生成与确定性后处理流程原创制作，没有复制下列参考项目的视觉资产。缺失素材时 Canvas 会回退到程序绘制角色。

## 验证

```bash
npm test
npm run test:e2e
npm run build
```

测试覆盖 Trace 归属、确定性分镜、工具字段映射、Timeline seek/step/speed、资产 QC、消息 URL 和浏览器回放。项目是本地应用，因此不作为纯静态页面发布。

## Acknowledgements

感谢这些项目和研究提供设计启发：

- [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)：像素办公室、角色状态机与工具动作表达。
- [AI Town](https://github.com/a16z-infra/ai-town)：2D Agent 世界、tilemap 与场景分层。
- [Claude Office](https://github.com/paulrobello/claude-office)：主 Agent / Subagent、状态气泡与工作空间表达。
- [Generative Agents](https://arxiv.org/abs/2304.03442)：把 Agent 行为放进空间化环境进行观察的研究启发。
- [Phaser Timeline](https://docs.phaser.io/api-documentation/class/time-timeline)：播放器时间线语义参考。

本项目没有直接复用上述项目代码或资产；后续若引入代码片段，会在对应文件保留许可证与逐项来源。
