import type {
  ModelContextSnapshot,
  OpenCodeSession,
  SceneCue,
  StudioConnectionStatus,
  StudioEvent,
  TurnTrace,
} from "../shared/types.js";
import { ActionDirector, CssCharacterRenderer } from "./studio.js";
import { compileScene, type PlaybackCut } from "./replay/scene-compiler.js";
import { TimelinePlayer, type TimelineSnapshot } from "./replay/timeline-player.js";
import { compileTurnTraces } from "./replay/trace-compiler.js";
import { CanvasSceneRenderer } from "./scene/canvas-renderer.js";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="studio-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">R8</span>
        <div><strong>ReAct // Agent Studio</strong><small>OPENCode Live Telemetry</small></div>
      </div>
      <div class="top-actions">
        <div id="connectionPill" class="connection-pill offline"><i></i><span>正在连接</span></div>
        <button id="attachButton" class="icon-button" title="连接 OpenCode">⚙</button>
      </div>
    </header>

    <section class="workspace">
      <section class="world-panel">
        <div class="world-toolbar">
          <div>
            <span class="eyebrow">LIVE FLOOR</span>
            <h1>Agent 工作室</h1>
          </div>
          <div class="metrics">
            <div><span id="eventCount">0</span><small>EVENTS</small></div>
            <div><span id="agentCount">0</span><small>AGENTS</small></div>
          </div>
        </div>

        <div id="room" class="room">
          <canvas id="studioCanvas" class="studio-canvas" width="400" height="240" aria-label="ReAct 动画工作室"></canvas>
          <button id="sceneCaption" class="scene-caption" type="button" hidden>
            <strong></strong><span></span><small>点击查看真实证据</small>
          </button>
          <aside id="learningInspector" class="learning-inspector" hidden>
            <header><span>LEARN / TRACE</span><button id="closeInspector" type="button">×</button></header>
            <strong id="inspectorTitle"></strong>
            <p id="inspectorExplanation"></p>
            <details><summary>查看真实证据</summary><pre id="inspectorEvidence"></pre></details>
            <button id="copyEvidence" type="button">COPY EVIDENCE</button>
          </aside>
          <div class="room-glow"></div>
          <div class="wall-grid"></div>
          <div class="workstation terminal-station" data-zone="terminal">
            <div class="station-sign">SHELL</div><div class="screen"><span>_</span></div><div class="desk"></div>
          </div>
          <div class="workstation archive-station" data-zone="archive">
            <div class="station-sign">FILES</div><div class="shelves"><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="workstation code-station" data-zone="code">
            <div class="station-sign">CODE</div><div class="code-board"><b>+12</b><em>-03</em></div><div class="desk"></div>
          </div>
          <div class="workstation portal-station" data-zone="portal">
            <div class="station-sign">WEB</div><div class="portal"><i></i></div>
          </div>
          <div class="workstation todo-station" data-zone="todo">
            <div class="station-sign">QUESTS</div><div class="todo-board">✓<br>□<br>□</div>
          </div>
          <div class="workstation subagent-station" data-zone="subagent">
            <div class="station-sign">SPAWN</div><div class="pod"><i>+</i></div>
          </div>
          <div class="workstation generic-station" data-zone="generic">
            <div class="station-sign">LAB</div><div class="lab-box">?</div>
          </div>
          <div class="thought-zone" data-zone="center"><span>THOUGHT</span><i></i><i></i><i></i></div>
          <div class="answer-zone" data-zone="answer"><span>ANSWER</span><div>▰</div></div>
          <div id="actorLayer" class="actor-layer"></div>
          <div class="floor-lines"></div>
        </div>

        <div id="replayPlayer" class="replay-player" data-status="paused">
          <div class="transport-controls">
            <button id="replayRestart" type="button" title="重新开始">↺</button>
            <button id="replayPrev" type="button" title="上一步">◀</button>
            <button id="replayPlay" class="primary" type="button" title="播放/暂停">▶</button>
            <button id="replayNext" type="button" title="下一步">▶|</button>
          </div>
          <div class="timeline-wrap">
            <input id="timelineRange" type="range" min="0" max="1000" value="0" aria-label="回放时间轴">
            <div><span id="timelineLabel">选择一条用户消息开始学习</span><time id="timelineTime">00:00 / 00:00</time></div>
          </div>
          <div class="playback-options">
            <select id="playbackSpeed" aria-label="播放速度">
              <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option>
            </select>
            <button id="cutToggle" type="button" data-cut="director">导演版</button>
            <button id="cameraToggle" type="button" aria-pressed="true">跟随</button>
            <button id="liveToggle" type="button" title="退出回放，追到最新实时事件">LIVE</button>
          </div>
        </div>

        <div class="phase-strip">
          <span class="phase thought"><i></i>Thought</span><b>→</b>
          <span class="phase action"><i></i>Action</span><b>→</b>
          <span class="phase observation"><i></i>Observation</span><b>→</b>
          <span class="phase answer"><i></i>Answer</span>
          <div id="currentActivity" class="current-activity">等待 Agent...</div>
        </div>
      </section>

      <aside class="chat-panel">
        <div class="chat-head">
          <div class="session-row">
            <label for="sessionSelect">SESSION</label>
            <select id="sessionSelect"><option value="">加载中...</option></select>
            <button id="newSessionButton" title="新建会话">＋</button>
          </div>
          <div id="contextNotice" class="context-notice warning">
            <span>◆</span><div><strong>Context Capture 未安装</strong><small>运行 npm run plugin:setup 后重启 OpenCode</small></div>
          </div>
        </div>
        <div id="messages" class="messages" aria-live="polite">
          <div class="welcome-card">
            <span>R8</span>
            <h2>等待 ReAct 信号</h2>
            <p>选择一个会话，或从下方发送任务。Agent 的思考、工具动作与观察结果会在这里实时展开。</p>
          </div>
        </div>
        <button id="jumpLatest" class="jump-latest">↓ 回到最新</button>
        <form id="composer" class="composer">
          <textarea id="promptInput" rows="2" placeholder="给 Agent 一个任务…" aria-label="输入任务"></textarea>
          <div class="composer-actions">
            <span><kbd>⌘</kbd><kbd>↵</kbd> 发送</span>
            <button id="abortButton" class="abort-button" type="button" title="中止当前会话">■</button>
            <button class="send-button" type="submit">SEND <b>↗</b></button>
          </div>
        </form>
      </aside>
    </section>
  </main>

  <dialog id="attachDialog" class="attach-dialog">
    <form method="dialog" id="attachForm">
      <div class="dialog-title"><span>LINK</span><div><strong>连接 OpenCode</strong><small>Attach to a known local server</small></div></div>
      <label>Server URL<input name="baseUrl" value="http://127.0.0.1:4096" required></label>
      <label>项目目录<input name="directory" value="${location.pathname === "/" ? "" : location.pathname}"></label>
      <div class="field-pair">
        <label>用户名<input name="username" value="opencode"></label>
        <label>密码<input name="password" type="password" autocomplete="off"></label>
      </div>
      <div class="dialog-actions"><button value="cancel">取消</button><button id="connectSubmit" value="default">连接</button></div>
    </form>
  </dialog>
  <div id="toast" class="toast"></div>
`;

const room = document.querySelector<HTMLElement>("#room")!;
const actorLayer = document.querySelector<HTMLElement>("#actorLayer")!;
const cssRenderer = new CssCharacterRenderer(room, actorLayer);
const director = new ActionDirector(cssRenderer);
const canvasRenderer = new CanvasSceneRenderer(document.querySelector<HTMLCanvasElement>("#studioCanvas")!);
const useCssFallback = new URL(location.href).searchParams.get("renderer") === "css";
const messagesElement = document.querySelector<HTMLElement>("#messages")!;
const sessionSelect = document.querySelector<HTMLSelectElement>("#sessionSelect")!;
const promptInput = document.querySelector<HTMLTextAreaElement>("#promptInput")!;
const connectionPill = document.querySelector<HTMLElement>("#connectionPill")!;
const contextNotice = document.querySelector<HTMLElement>("#contextNotice")!;
const jumpLatest = document.querySelector<HTMLButtonElement>("#jumpLatest")!;
const toast = document.querySelector<HTMLElement>("#toast")!;
const sceneCaption = document.querySelector<HTMLButtonElement>("#sceneCaption")!;
const learningInspector = document.querySelector<HTMLElement>("#learningInspector")!;
const timelineRange = document.querySelector<HTMLInputElement>("#timelineRange")!;
const timelineLabel = document.querySelector<HTMLElement>("#timelineLabel")!;
const timelineTime = document.querySelector<HTMLTimeElement>("#timelineTime")!;
const replayPlay = document.querySelector<HTMLButtonElement>("#replayPlay")!;
const cardIndex = new Map<string, HTMLElement>();
const contextStore = new Map<string, ModelContextSnapshot>();
const replayStore = new Map<string, TurnTrace>();
const activeAgents = new Set<string>();
const initialUrl = new URL(location.href);
let currentSession = initialUrl.searchParams.get("session") ?? "";
let routedMessageId = initialUrl.searchParams.get("message") ?? "";
let routedCueId = initialUrl.searchParams.get("cue") ?? "";
let eventCount = 0;
let followLatest = true;
let replayRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let activeTrace: TurnTrace | undefined;
let activeCues: SceneCue[] = [];
let activeCut: PlaybackCut = "director";
let lastCueId = "";
let completionNotified = false;
let lastLiveEvent: StudioEvent | undefined;

const player = new TimelinePlayer((snapshot) => updatePlayback(snapshot));

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

function showToast(message: string, error = false) {
  toast.textContent = message;
  toast.className = `toast show${error ? " error" : ""}`;
  setTimeout(() => (toast.className = "toast"), 2_000);
}

function updateStatus(status: StudioConnectionStatus) {
  connectionPill.className = `connection-pill ${status.connected ? "online" : "offline"}`;
  connectionPill.querySelector("span")!.textContent = status.connected
    ? `${status.eventMode.toUpperCase()} · OpenCode ${status.opencodeVersion ?? ""}`
    : status.error ?? "离线";
  contextNotice.classList.toggle("warning", !status.pluginInstalled);
  contextNotice.classList.toggle("ready", status.pluginInstalled);
  contextNotice.innerHTML = status.pluginInstalled
    ? `<span>◆</span><div><strong>Semantic Context 在线</strong><small>完整脱敏 · 仅内存保存</small></div>`
    : `<span>◆</span><div><strong>Context Capture 未安装</strong><small>运行 npm run plugin:setup 后重启 OpenCode</small></div>`;
}

function scrollToLatest(force = false) {
  if (!followLatest && !force) return;
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function trimCards() {
  while (messagesElement.children.length > 300) {
    const first = messagesElement.firstElementChild;
    if (!first) break;
    first.remove();
  }
}

function contentText(payload: any): string {
  return String(
    payload?.text ??
      payload?.delta ??
      payload?.output ??
      payload?.result ??
      payload?.state?.output ??
      payload?.part?.text ??
      payload?.part?.state?.output ??
      "",
  );
}

function makeCard(kind: string, label: string, content: string, meta = "") {
  const card = document.createElement("article");
  card.className = `message-card ${kind}`;
  const header = document.createElement("header");
  header.innerHTML = `<span>${label}</span><small>${meta}</small>`;
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;
  card.append(header, body);
  return card;
}

function routeUrl(sessionId: string, messageId = "", cueId = "") {
  const url = new URL(location.href);
  if (sessionId) url.searchParams.set("session", sessionId);
  else url.searchParams.delete("session");
  if (messageId) url.searchParams.set("message", messageId);
  else url.searchParams.delete("message");
  if (cueId) url.searchParams.set("cue", cueId);
  else url.searchParams.delete("cue");
  return url;
}

function updateRoute(sessionId: string, messageId = "", push = false, cueId = "") {
  routedMessageId = messageId;
  routedCueId = cueId;
  const url = routeUrl(sessionId, messageId, cueId);
  history[push ? "pushState" : "replaceState"]({ sessionId, messageId, cueId }, "", url);
  return url;
}

function focusMessage(messageId: string, smooth = false) {
  messagesElement.querySelectorAll(".log-target").forEach((element) => element.classList.remove("log-target"));
  if (!messageId) return;
  const target = [...messagesElement.querySelectorAll<HTMLElement>("[data-message-id]")]
    .find((element) => element.dataset.messageId === messageId);
  if (!target) return;
  target.classList.add("log-target");
  target.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
}

function rebuildReplayStore(history: any[]) {
  replayStore.clear();
  for (const [messageId, trace] of compileTurnTraces(history, contextStore.values())) {
    if (trace.status === "complete" || trace.status === "error") replayStore.set(messageId, trace);
  }
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.round(value / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function sourceForCue(cue?: SceneCue) {
  if (!cue || !activeTrace) return undefined;
  return activeTrace.nodes.find((node) => cue.traceNodeIds.includes(node.id));
}

function updatePlayback(snapshot: TimelineSnapshot) {
  canvasRenderer.draw(activeCues, snapshot);
  replayPlay.textContent = snapshot.status === "playing" ? "Ⅱ" : "▶";
  timelineRange.value = snapshot.duration ? String(Math.round((snapshot.time / snapshot.duration) * 1000)) : "0";
  timelineTime.textContent = `${formatTime(snapshot.time)} / ${formatTime(snapshot.duration)}`;
  document.querySelector("#replayPlayer")?.setAttribute("data-status", snapshot.status);
  room.classList.toggle("is-replaying", ["playing", "paused", "seeking"].includes(snapshot.status) && Boolean(activeCues.length));
  const cue = snapshot.cue;
  if (cue) {
    timelineLabel.textContent = `${snapshot.cueIndex + 1}/${activeCues.length} · ${cue.explanation ?? cue.caption ?? cue.action}`;
    document.querySelector("#currentActivity")!.textContent =
      `回放 ${snapshot.cueIndex + 1}/${activeCues.length} · ${cue.phase.toUpperCase()} · ${cue.explanation ?? cue.action}`;
    sceneCaption.hidden = !(cue.caption || cue.explanation);
    sceneCaption.querySelector("strong")!.textContent = cue.caption ?? cue.explanation ?? "";
    sceneCaption.querySelector("span")!.textContent = cue.caption && cue.explanation ? cue.explanation : "";
    sceneCaption.dataset.cueId = cue.id;
    messagesElement.querySelectorAll(".cue-target").forEach((element) => element.classList.remove("cue-target"));
    if (cue.sourceMessageId) {
      const card = [...messagesElement.querySelectorAll<HTMLElement>("[data-message-id]")]
        .find((element) => element.dataset.messageId === cue.sourceMessageId);
      card?.classList.add("cue-target");
    }
    if (cue.id !== lastCueId && activeTrace) {
      lastCueId = cue.id;
      updateRoute(currentSession, activeTrace.userMessageId, false, cue.id);
    }
  } else {
    sceneCaption.hidden = true;
  }
  if (snapshot.status === "completed" && !completionNotified) {
    completionNotified = true;
    room.classList.remove("is-replaying");
    showToast(`ReAct 回放完成 · ${activeCues.length} 个镜头`);
  }
}

function selectReplay(messageId: string, cueId = "", autoplay = true) {
  const trace = replayStore.get(messageId);
  if (!trace) return;
  activeTrace = trace;
  activeCues = compileScene(trace, activeCut);
  completionNotified = false;
  lastCueId = "";
  player.setCues(activeCues, cueId);
  focusMessage(messageId, true);
  updateRoute(currentSession, messageId, false, cueId || activeCues[0]?.id);
  if (autoplay) player.play();
}

function attachReplayButton(card: HTMLElement, messageId: string) {
  if (!replayStore.has(messageId) || card.querySelector(".replay-button")) return;
  const button = document.createElement("button");
  button.className = "replay-button";
  button.type = "button";
  button.textContent = "▶ 回放";
  button.title = "在 Agent 工作室回放这次完整 ReAct 过程";
  button.addEventListener("click", () => selectReplay(messageId));
  card.querySelector("header")?.append(button);
}

function updateReplayButtons() {
  for (const card of messagesElement.querySelectorAll<HTMLElement>(".message-card.user[data-message-id]")) {
    attachReplayButton(card, card.dataset.messageId!);
  }
}

async function refreshReplayStore() {
  if (!currentSession) return;
  const sessionAtRequest = currentSession;
  const history = await request<any[]>(`/api/sessions/${encodeURIComponent(sessionAtRequest)}/messages`);
  if (sessionAtRequest !== currentSession) return;
  rebuildReplayStore(history);
  updateReplayButtons();
}

function scheduleReplayRefresh() {
  if (replayRefreshTimer) clearTimeout(replayRefreshTimer);
  replayRefreshTimer = setTimeout(() => {
    replayRefreshTimer = undefined;
    void refreshReplayStore().catch(() => undefined);
  }, 300);
}

function identifyMessage(card: HTMLElement, messageId: string, userMessage = false) {
  if (!messageId) return;
  card.dataset.messageId = messageId;
  if (!userMessage || card.querySelector(".message-permalink")) return;
  const button = document.createElement("button");
  button.className = "message-permalink";
  button.type = "button";
  button.textContent = "# LOG";
  button.title = "定位并复制此条消息的排查链接";
  button.addEventListener("click", async () => {
    const url = updateRoute(currentSession, messageId);
    focusMessage(messageId, true);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("消息排查链接已复制");
    } catch {
      showToast("已定位到此消息");
    }
  });
  card.querySelector("header")?.append(button);
  attachReplayButton(card, messageId);
}

function addStudioEvent(event: StudioEvent) {
  if (currentSession && event.sessionId !== currentSession && event.sessionId !== "global") return;
  lastLiveEvent = event;
  if (useCssFallback) director.handle(event);
  else if (!activeCues.length || player.snapshot.status === "completed") canvasRenderer.showLive(event);
  activeAgents.add(`${event.sessionId}:${event.agentId}`);
  eventCount += 1;
  document.querySelector("#eventCount")!.textContent = String(eventCount);
  document.querySelector("#agentCount")!.textContent = String(activeAgents.size);
  document.querySelector("#currentActivity")!.textContent = `${event.agentId} · ${event.title}`;

  const key = event.callId
    ? `tool:${event.callId}`
    : `${event.phase}:${event.messageId ?? event.id}`;
  const payload = event.payload as any;
  const text = contentText(payload) || event.title;
  let card = cardIndex.get(key);
  if (!card) {
    const labels: Record<string, string> = {
      thought: "THOUGHT",
      action: "ACTION",
      observation: "OBSERVATION",
      answer: "ANSWER",
      system: "SYSTEM",
    };
    card = makeCard(event.phase, labels[event.phase]!, text, `${event.agentId} · ${event.status}`);
    card.dataset.key = key;
    if (event.messageId) identifyMessage(card, event.messageId);
    messagesElement.append(card);
    cardIndex.set(key, card);
  } else {
    const body = card.querySelector<HTMLElement>(".message-body")!;
    if (text && (event.kind.includes("ended") || text.length >= body.textContent!.length)) body.textContent = text;
    card.querySelector("small")!.textContent = `${event.agentId} · ${event.status}`;
    card.className = `message-card ${event.phase} ${event.status}`;
  }
  trimCards();
  scrollToLatest();
  if (
    (event.phase === "answer" && event.status === "complete") ||
    event.kind.includes("session.idle")
  ) {
    scheduleReplayRefresh();
  }
}

function addContext(snapshot: ModelContextSnapshot) {
  if (currentSession && snapshot.sessionId !== currentSession) return;
  contextStore.set(snapshot.id, snapshot);
  const details = document.createElement("details");
  details.className = "context-card";
  const toolCount = Object.keys(snapshot.tools).length;
  details.innerHTML = `
    <summary>
      <span class="context-gem">◆</span>
      <div><strong>Semantic Context #${snapshot.callIndex}</strong><small>${snapshot.model.providerId}/${snapshot.model.modelId} · ${snapshot.messages.length} messages · ${toolCount} tools</small></div>
      <span class="chevron">›</span>
    </summary>
    <div class="context-actions"><span>完整脱敏 JSON</span><button type="button">COPY JSON</button></div>
    <pre hidden></pre>
  `;
  const pre = details.querySelector("pre")!;
  details.addEventListener("toggle", () => {
    if (details.open && !pre.textContent) {
      requestAnimationFrame(() => {
        pre.textContent = JSON.stringify(snapshot, null, 2);
        pre.hidden = false;
      });
    }
  });
  details.querySelector("button")!.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      showToast("完整 Context JSON 已复制");
    } catch {
      showToast("复制失败，请展开后手动复制", true);
    }
  });
  messagesElement.append(details);
  trimCards();
  scrollToLatest();
  scheduleReplayRefresh();
}

function renderHistory(data: any[]) {
  rebuildReplayStore(data);
  messagesElement.innerHTML = "";
  cardIndex.clear();
  for (const message of data) {
    const role = message.info?.role ?? "system";
    const messageId = String(message.info?.id ?? "");
    for (const part of message.parts ?? []) {
      if (!["text", "reasoning", "tool"].includes(part.type)) continue;
      if (part.type === "tool") {
        const state = part.state ?? {};
        const card = makeCard(
          state.status === "error" ? "observation error" : "action",
          `TOOL · ${part.tool}`,
          state.output ?? state.error ?? JSON.stringify(state.input ?? {}, null, 2),
          state.status ?? "",
        );
        identifyMessage(card, messageId);
        messagesElement.append(card);
      } else {
        const kind = part.type === "reasoning" ? "thought" : role === "user" ? "user" : "answer";
        const card = makeCard(kind, part.type === "reasoning" ? "THOUGHT" : role.toUpperCase(), part.text ?? "");
        identifyMessage(card, messageId, role === "user");
        messagesElement.append(card);
      }
    }
  }
  updateReplayButtons();
  for (const snapshot of contextStore.values()) {
    if (snapshot.sessionId === currentSession) addContext(snapshot);
  }
  if (!messagesElement.children.length) {
    messagesElement.innerHTML = `<div class="welcome-card compact"><span>R8</span><h2>空会话</h2><p>从下方发送第一条任务。</p></div>`;
  }
  scrollToLatest(true);
  if (routedMessageId) requestAnimationFrame(() => focusMessage(routedMessageId));
  if (routedMessageId && routedCueId && replayStore.has(routedMessageId)) {
    requestAnimationFrame(() => selectReplay(routedMessageId, routedCueId, false));
  }
}

async function loadSessions(preferred?: string, messageId = "", updateUrl = true) {
  const sessions = await request<OpenCodeSession[]>("/api/sessions");
  sessions.sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
  sessionSelect.innerHTML = "";
  for (const session of sessions) {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = `${session.title || "Untitled"} · ${session.id.slice(-6)}`;
    sessionSelect.append(option);
  }
  const next = preferred && sessions.some((item) => item.id === preferred)
    ? preferred
    : currentSession && sessions.some((item) => item.id === currentSession)
      ? currentSession
      : sessions[0]?.id ?? "";
  if (next) {
    sessionSelect.value = next;
    await selectSession(next, { messageId, updateUrl });
  } else {
    currentSession = "";
    director.reset();
    renderHistory([]);
    if (updateUrl) updateRoute("");
  }
}

async function selectSession(
  sessionId: string,
  options: { messageId?: string; updateUrl?: boolean } = {},
) {
  currentSession = sessionId;
  routedMessageId = options.messageId ?? "";
  routedCueId = new URL(location.href).searchParams.get("cue") ?? "";
  director.reset();
  player.setCues([]);
  activeTrace = undefined;
  activeCues = [];
  eventCount = 0;
  activeAgents.clear();
  document.querySelector("#eventCount")!.textContent = "0";
  document.querySelector("#agentCount")!.textContent = "0";
  const history = await request<any[]>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  renderHistory(history);
  if (options.updateUrl !== false) updateRoute(sessionId, routedMessageId, false, routedCueId);
}

const stream = new EventSource("/api/stream");
stream.addEventListener("status", (event) => updateStatus(JSON.parse((event as MessageEvent).data)));
stream.addEventListener("studio-event", (event) => addStudioEvent(JSON.parse((event as MessageEvent).data)));
stream.addEventListener("context", (event) => addContext(JSON.parse((event as MessageEvent).data)));
stream.addEventListener("bootstrap", (event) => {
  const data = JSON.parse((event as MessageEvent).data);
  for (const snapshot of data.contexts ?? []) contextStore.set(snapshot.id, snapshot);
  for (const item of data.events ?? []) addStudioEvent(item);
});
stream.onerror = () => connectionPill.className = "connection-pill offline";

messagesElement.addEventListener("scroll", () => {
  const distance = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight;
  followLatest = distance < 90;
  jumpLatest.classList.toggle("show", !followLatest);
});
jumpLatest.addEventListener("click", () => {
  followLatest = true;
  jumpLatest.classList.remove("show");
  scrollToLatest(true);
});

sessionSelect.addEventListener("change", () => {
  void selectSession(sessionSelect.value, { updateUrl: true }).catch((error) => showToast(error.message, true));
});
document.querySelector("#newSessionButton")!.addEventListener("click", async () => {
  try {
    const session = await request<OpenCodeSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "Agent Studio Session" }),
    });
    await loadSessions(session.id, "", true);
    promptInput.focus();
  } catch (error) {
    showToast((error as Error).message, true);
  }
});

document.querySelector<HTMLFormElement>("#composer")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text) return;
  try {
    if (!currentSession) {
      const session = await request<OpenCodeSession>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: text.slice(0, 42) }),
      });
      await loadSessions(session.id, "", true);
    }
    const card = makeCard("user", "YOU", text);
    messagesElement.append(card);
    promptInput.value = "";
    scrollToLatest(true);
    const result = await request<{ accepted: boolean; sessionId: string; messageId: string }>(
      `/api/sessions/${encodeURIComponent(currentSession)}/prompt`,
      {
      method: "POST",
      body: JSON.stringify({ text }),
      },
    );
    identifyMessage(card, result.messageId, true);
    updateRoute(result.sessionId, result.messageId, true);
    focusMessage(result.messageId);
  } catch (error) {
    showToast((error as Error).message, true);
  }
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    document.querySelector<HTMLFormElement>("#composer")!.requestSubmit();
  }
});
document.querySelector("#abortButton")!.addEventListener("click", async () => {
  if (!currentSession) return;
  try {
    await request(`/api/sessions/${encodeURIComponent(currentSession)}/abort`, { method: "POST" });
    showToast("已请求中止当前会话");
  } catch (error) {
    showToast((error as Error).message, true);
  }
});

function openInspector(cue?: SceneCue) {
  if (!cue) return;
  const source = sourceForCue(cue);
  learningInspector.hidden = false;
  document.querySelector("#inspectorTitle")!.textContent = cue.caption ?? cue.action;
  document.querySelector("#inspectorExplanation")!.textContent =
    cue.explanation ?? (cue.evidence === "exact" ? "此镜头直接来自 OpenCode 的真实数据。" : "此镜头是基于真实事件的固定可视化说明。");
  document.querySelector("#inspectorEvidence")!.textContent = JSON.stringify({
    cue: {
      id: cue.id,
      evidence: cue.evidence,
      action: cue.action,
      traceNodeIds: cue.traceNodeIds,
    },
    source,
  }, null, 2);
}

sceneCaption.addEventListener("click", () => openInspector(player.snapshot.cue));
document.querySelector("#closeInspector")!.addEventListener("click", () => {
  learningInspector.hidden = true;
});
document.querySelector("#copyEvidence")!.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#inspectorEvidence")!.textContent ?? "");
    showToast("真实证据已复制");
  } catch {
    showToast("复制失败", true);
  }
});

document.querySelector("#replayRestart")!.addEventListener("click", () => {
  player.seek(0);
  player.play();
});
document.querySelector("#replayPrev")!.addEventListener("click", () => player.step(-1));
replayPlay.addEventListener("click", () => player.toggle());
document.querySelector("#replayNext")!.addEventListener("click", () => player.step(1));
timelineRange.addEventListener("input", () => {
  player.seek((Number(timelineRange.value) / 1000) * player.snapshot.duration);
});
document.querySelector<HTMLSelectElement>("#playbackSpeed")!.addEventListener("change", (event) => {
  player.setSpeed(Number((event.currentTarget as HTMLSelectElement).value));
});
document.querySelector("#cutToggle")!.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  activeCut = activeCut === "director" ? "compact" : "director";
  button.dataset.cut = activeCut;
  button.textContent = activeCut === "director" ? "导演版" : "精简版";
  if (activeTrace) selectReplay(activeTrace.userMessageId, "", false);
});
document.querySelector("#cameraToggle")!.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const following = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(following));
  button.textContent = following ? "跟随" : "全景";
  room.classList.toggle("camera-overview", !following);
});
document.querySelector("#liveToggle")!.addEventListener("click", () => {
  activeTrace = undefined;
  activeCues = [];
  lastCueId = "";
  player.setCues([]);
  room.classList.remove("is-replaying");
  sceneCaption.hidden = true;
  if (lastLiveEvent) canvasRenderer.showLive(lastLiveEvent);
  document.querySelector("#currentActivity")!.textContent = "LIVE · 正在追踪最新事件";
  updateRoute(currentSession, "", false);
});

function stepChapter(direction: -1 | 1) {
  const snapshot = player.snapshot;
  if (!activeCues.length) return;
  const currentIndex = Math.max(0, snapshot.cueIndex);
  const currentPhase = activeCues[currentIndex]?.phase;
  let target = currentIndex + direction;
  if (direction > 0) {
    while (target < activeCues.length && activeCues[target]?.phase === currentPhase) target += 1;
  } else {
    while (target >= 0 && activeCues[target]?.phase === currentPhase) target -= 1;
    const previousPhase = activeCues[Math.max(0, target)]?.phase;
    while (target > 0 && activeCues[target - 1]?.phase === previousPhase) target -= 1;
  }
  const cue = activeCues[Math.max(0, Math.min(activeCues.length - 1, target))];
  if (cue) player.seek(cue.start);
}

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches("textarea,input,select")) return;
  if (event.code === "Space") {
    event.preventDefault();
    player.toggle();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (event.shiftKey) stepChapter(-1);
    else player.step(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    if (event.shiftKey) stepChapter(1);
    else player.step(1);
  } else if (["1", "2", "3"].includes(event.key)) {
    const speeds = { "1": 0.5, "2": 1, "3": 2 } as const;
    const speed = speeds[event.key as keyof typeof speeds];
    player.setSpeed(speed);
    document.querySelector<HTMLSelectElement>("#playbackSpeed")!.value = String(speed);
  }
});

const attachDialog = document.querySelector<HTMLDialogElement>("#attachDialog")!;
document.querySelector("#attachButton")!.addEventListener("click", () => attachDialog.showModal());
document.querySelector<HTMLFormElement>("#attachForm")!.addEventListener("submit", async (event) => {
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.value === "cancel") return;
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = Object.fromEntries(new FormData(form));
  try {
    await request("/api/connect", { method: "POST", body: JSON.stringify(data) });
    attachDialog.close();
    await loadSessions(undefined, "", true);
    showToast("OpenCode 已连接");
  } catch (error) {
    showToast((error as Error).message, true);
  }
});

window.addEventListener("popstate", () => {
  const url = new URL(location.href);
  const sessionId = url.searchParams.get("session") ?? "";
  const messageId = url.searchParams.get("message") ?? "";
  routedCueId = url.searchParams.get("cue") ?? "";
  void loadSessions(sessionId, messageId, false).catch((error) => showToast(error.message, true));
});

Promise.all([
  request<StudioConnectionStatus>("/api/status").then(updateStatus),
  loadSessions(currentSession, routedMessageId, true),
]).catch((error) => showToast(error.message, true));
