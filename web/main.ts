import type {
  ModelContextSnapshot,
  OpenCodeSession,
  StudioConnectionStatus,
  StudioEvent,
} from "../shared/types.js";
import { ActionDirector, CssCharacterRenderer } from "./studio.js";
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
const renderer = new CssCharacterRenderer(room, actorLayer);
const director = new ActionDirector(renderer);
const messagesElement = document.querySelector<HTMLElement>("#messages")!;
const sessionSelect = document.querySelector<HTMLSelectElement>("#sessionSelect")!;
const promptInput = document.querySelector<HTMLTextAreaElement>("#promptInput")!;
const connectionPill = document.querySelector<HTMLElement>("#connectionPill")!;
const contextNotice = document.querySelector<HTMLElement>("#contextNotice")!;
const jumpLatest = document.querySelector<HTMLButtonElement>("#jumpLatest")!;
const toast = document.querySelector<HTMLElement>("#toast")!;
const cardIndex = new Map<string, HTMLElement>();
const contextStore = new Map<string, ModelContextSnapshot>();
const replayStore = new Map<string, StudioEvent[]>();
const activeAgents = new Set<string>();
const initialUrl = new URL(location.href);
let currentSession = initialUrl.searchParams.get("session") ?? "";
let routedMessageId = initialUrl.searchParams.get("message") ?? "";
let eventCount = 0;
let followLatest = true;
let replayToken = 0;
let replayRefreshTimer: ReturnType<typeof setTimeout> | undefined;

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

function routeUrl(sessionId: string, messageId = "") {
  const url = new URL(location.href);
  if (sessionId) url.searchParams.set("session", sessionId);
  else url.searchParams.delete("session");
  if (messageId) url.searchParams.set("message", messageId);
  else url.searchParams.delete("message");
  return url;
}

function updateRoute(sessionId: string, messageId = "", push = false) {
  routedMessageId = messageId;
  const url = routeUrl(sessionId, messageId);
  history[push ? "pushState" : "replaceState"]({ sessionId, messageId }, "", url);
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

function historyReplayEvent(
  message: any,
  part: any,
  sequence: number,
  phase: StudioEvent["phase"],
  status: StudioEvent["status"],
  title: string,
  timestamp: number,
): StudioEvent {
  return {
    id: `replay:${message.info.id}:${part.id ?? sequence}:${phase}:${status}`,
    sequence,
    timestamp,
    sessionId: String(message.info.sessionID ?? currentSession),
    messageId: String(message.info.id),
    callId: part.callID ? String(part.callID) : undefined,
    agentId: String(message.info.agent ?? message.info.mode ?? "build"),
    phase,
    kind: `replay.${part.type}`,
    status,
    title,
    payload: part,
  };
}

function rebuildReplayStore(history: any[]) {
  replayStore.clear();
  const assistantsByUser = new Map<string, any[]>();
  for (const message of history) {
    if (message.info?.role !== "assistant" || !message.info?.parentID) continue;
    const parentId = String(message.info.parentID);
    const messages = assistantsByUser.get(parentId) ?? [];
    messages.push(message);
    assistantsByUser.set(parentId, messages);
  }

  for (const [userMessageId, messages] of assistantsByUser) {
    messages.sort((a, b) => Number(a.info?.time?.created ?? 0) - Number(b.info?.time?.created ?? 0));
    const finalMessage = messages.at(-1);
    if (finalMessage?.info?.finish !== "stop" || !finalMessage.info?.time?.completed) continue;

    const events: StudioEvent[] = [];
    let sequence = 0;
    for (const message of messages) {
      const created = Number(message.info?.time?.created ?? Date.now());
      for (let partIndex = 0; partIndex < (message.parts ?? []).length; partIndex += 1) {
        const part = message.parts[partIndex];
        const fallback = created + partIndex * 10;
        if (part.type === "step-start") {
          events.push(historyReplayEvent(message, part, ++sequence, "thought", "running", "开始新一轮推理", fallback));
        } else if (part.type === "reasoning") {
          const start = Number(part.time?.start ?? fallback);
          events.push(historyReplayEvent(message, part, ++sequence, "thought", "running", "正在分析", start));
          events.push(historyReplayEvent(message, part, ++sequence, "thought", "complete", "完成思考", Number(part.time?.end ?? start + 1)));
        } else if (part.type === "tool") {
          const start = Number(part.state?.time?.start ?? fallback);
          events.push(historyReplayEvent(message, part, ++sequence, "action", "running", String(part.tool ?? "tool"), start));
          const failed = part.state?.status === "error";
          events.push(historyReplayEvent(
            message,
            part,
            ++sequence,
            "observation",
            failed ? "error" : "success",
            failed ? "工具执行失败" : "工具执行完成",
            Number(part.state?.time?.end ?? start + 1),
          ));
        } else if (part.type === "text") {
          const start = Number(part.time?.start ?? fallback);
          events.push(historyReplayEvent(message, part, ++sequence, "answer", "running", "正在回复", start));
          events.push(historyReplayEvent(message, part, ++sequence, "answer", "complete", "回复完成", Number(part.time?.end ?? message.info?.time?.completed ?? start + 1)));
        }
      }
    }
    if (events.length) replayStore.set(userMessageId, events.sort((a, b) => a.timestamp - b.timestamp || a.sequence - b.sequence));
  }
}

async function playReplay(messageId: string, button: HTMLButtonElement) {
  const events = replayStore.get(messageId);
  if (!events?.length) return;
  const token = ++replayToken;
  document.querySelectorAll<HTMLButtonElement>(".replay-button").forEach((item) => (item.disabled = true));
  room.classList.add("is-replaying");
  button.textContent = "■ 回放中";
  focusMessage(messageId, true);
  try {
    await director.replay(events, (item, index, total) => {
      button.textContent = `■ ${index + 1}/${total}`;
      document.querySelector("#currentActivity")!.textContent = `回放 ${index + 1}/${total} · ${item.title}`;
    });
    if (token === replayToken) {
      document.querySelector("#currentActivity")!.textContent = `回放完成 · ${events.length} 个真实事件`;
      showToast("ReAct 回放完成");
    }
  } finally {
    if (token === replayToken) {
      room.classList.remove("is-replaying");
      document.querySelectorAll<HTMLButtonElement>(".replay-button").forEach((item) => {
        item.disabled = false;
        item.textContent = "▶ 回放";
      });
    }
  }
}

function attachReplayButton(card: HTMLElement, messageId: string) {
  if (!replayStore.has(messageId) || card.querySelector(".replay-button")) return;
  const button = document.createElement("button");
  button.className = "replay-button";
  button.type = "button";
  button.textContent = "▶ 回放";
  button.title = "在 Agent 工作室回放这次完整 ReAct 过程";
  button.addEventListener("click", () => void playReplay(messageId, button));
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
  director.handle(event);
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
  director.reset();
  eventCount = 0;
  activeAgents.clear();
  document.querySelector("#eventCount")!.textContent = "0";
  document.querySelector("#agentCount")!.textContent = "0";
  const history = await request<any[]>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  renderHistory(history);
  if (options.updateUrl !== false) updateRoute(sessionId, routedMessageId);
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
  void loadSessions(sessionId, messageId, false).catch((error) => showToast(error.message, true));
});

Promise.all([
  request<StudioConnectionStatus>("/api/status").then(updateStatus),
  loadSessions(currentSession, routedMessageId, true),
]).catch((error) => showToast(error.message, true));
