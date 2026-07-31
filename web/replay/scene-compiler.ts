import type { ReactPhase, SceneCue, TraceNode, TurnTrace } from "../../shared/types.js";
import { toolZone } from "../studio.js";

export type PlaybackCut = "director" | "compact";

export interface ToolSceneAdapter {
  matches(tool: string): boolean;
  compile(node: TraceNode, builder: CueBuilder): void;
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function splitExactText(text: string) {
  const compact = text.trim();
  if (!compact) return [];
  return compact
    .split(/(?<=[。！？!?；;])\s+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => item.length > 180 ? item.match(/.{1,150}(?:\s|$)|.{1,150}/g) ?? [item] : [item]);
}

function preview(value: unknown, max = 120) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function parsedOutput(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export class CueBuilder {
  readonly cues: SceneCue[] = [];
  private cursor = 0;
  private sequence = 0;

  constructor(
    private trace: TurnTrace,
    private cut: PlaybackCut,
  ) {}

  add(
    node: TraceNode,
    phase: ReactPhase,
    track: SceneCue["track"],
    action: string,
    duration: number,
    options: Partial<Omit<SceneCue, "id" | "traceNodeIds" | "phase" | "track" | "action" | "start" | "duration" | "agentId">> = {},
  ) {
    const compact = this.cut === "compact";
    if (compact && options.skippable) return;
    const adjusted = Math.max(90, Math.round(duration * (compact ? 0.42 : 1)));
    this.cues.push({
      id: `cue:${this.trace.userMessageId}:${++this.sequence}:${action}`,
      traceNodeIds: [node.id],
      evidence: options.evidence ?? "derived",
      track,
      phase,
      action,
      start: this.cursor,
      duration: adjusted,
      agentId: node.agentId,
      sourceMessageId: node.sourceMessageIds[0],
      ...options,
    });
    this.cursor += adjusted;
  }

  get duration() {
    return this.cursor;
  }
}

function toolTemplate(tool: string) {
  const lower = tool.toLowerCase();
  if (/(web|browser|fetch)/.test(lower)) return "Agent 把查询交给网络工具";
  if (/(read|glob|grep|list)/.test(lower)) return "Agent 正在档案中寻找证据";
  if (/(edit|write|patch)/.test(lower)) return "Agent 正在修改工作文件";
  if (/(bash|shell|terminal)/.test(lower)) return "Agent 正在终端执行命令";
  if (/(todo|plan)/.test(lower)) return "Agent 正在更新任务计划";
  if (/(task|agent)/.test(lower)) return "Agent 正在委派一项子任务";
  return `Agent 正在使用 ${tool}`;
}

const webAdapter: ToolSceneAdapter = {
  matches: (tool) => /(web|browser|fetch)/i.test(tool),
  compile(node, b) {
    const query = preview((node.input as any)?.query ?? (node.input as any)?.url ?? node.input);
    b.add(node, "action", "actor", "move", 900, { zone: "portal", explanation: "Agent 前往网络传送门" });
    b.add(node, "action", "prop", "write-query-card", 700, { zone: "portal", caption: query || "准备网络请求", evidence: "exact", payload: node.input });
    b.add(node, "action", "effect", "portal-charge", 650, { zone: "portal", explanation: "传送门正在建立连接", skippable: true });
    b.add(node, "action", "prop", "send-query-card", 500, { zone: "portal", explanation: toolTemplate(node.tool ?? "web") });
    b.add(node, "action", "effect", "tool-wait", 850, { zone: "portal", caption: "SEARCHING…", skippable: true });
  },
};

const terminalAdapter: ToolSceneAdapter = {
  matches: (tool) => /(bash|shell|terminal)/i.test(tool),
  compile(node, b) {
    const command = preview((node.input as any)?.command ?? node.input);
    b.add(node, "action", "actor", "move", 850, { zone: "terminal", explanation: "Agent 前往终端台" });
    b.add(node, "action", "effect", "station-on", 300, { zone: "terminal", skippable: true });
    b.add(node, "action", "prop", "terminal-type", 1000, { zone: "terminal", caption: command || "$ command", evidence: "exact", payload: node.input });
    b.add(node, "action", "effect", "tool-wait", 600, { zone: "terminal", caption: "RUNNING…", skippable: true });
  },
};

const archiveAdapter: ToolSceneAdapter = {
  matches: (tool) => /(read|glob|grep|list|search_file)/i.test(tool),
  compile(node, b) {
    const subject = preview((node.input as any)?.filePath ?? (node.input as any)?.path ?? (node.input as any)?.pattern ?? node.input);
    b.add(node, "action", "actor", "move", 850, { zone: "archive", explanation: "Agent 前往档案柜" });
    b.add(node, "action", "prop", "pull-file", 550, { zone: "archive", caption: subject || "读取资料", evidence: "exact", payload: node.input });
    b.add(node, "action", "prop", "scan-pages", 900, { zone: "archive", explanation: toolTemplate(node.tool ?? "read"), skippable: true });
    b.add(node, "action", "effect", "tool-wait", 500, { zone: "archive", caption: "SCANNING…", skippable: true });
  },
};

const codeAdapter: ToolSceneAdapter = {
  matches: (tool) => /(edit|write|patch|apply)/i.test(tool),
  compile(node, b) {
    const file = preview((node.input as any)?.filePath ?? (node.input as any)?.path ?? node.input);
    b.add(node, "action", "actor", "move", 850, { zone: "code", explanation: "Agent 前往代码工作台" });
    b.add(node, "action", "prop", "open-code-file", 500, { zone: "code", caption: file || "打开工作文件", evidence: "exact", payload: node.input });
    b.add(node, "action", "effect", "diff-lines", 1050, { zone: "code", explanation: toolTemplate(node.tool ?? "edit") });
    b.add(node, "action", "prop", "save-file", 450, { zone: "code", caption: "SAVED", skippable: true });
  },
};

const taskAdapter: ToolSceneAdapter = {
  matches: (tool) => /(todo|plan|task|agent|subagent)/i.test(tool),
  compile(node, b) {
    const zone = toolZone(node.tool ?? "") === "subagent" ? "subagent" : "todo";
    b.add(node, "action", "actor", "move", 850, { zone, explanation: toolTemplate(node.tool ?? "task") });
    b.add(node, "action", "prop", zone === "subagent" ? "handoff-task" : "update-board", 800, {
      zone,
      caption: preview(node.input) || "更新任务",
      evidence: "exact",
      payload: node.input,
    });
    b.add(node, "action", "effect", "tool-wait", 500, { zone, skippable: true });
  },
};

const fallbackAdapter: ToolSceneAdapter = {
  matches: () => true,
  compile(node, b) {
    b.add(node, "action", "actor", "move", 850, { zone: "generic", explanation: "未知工具进入通用实验台" });
    b.add(node, "action", "prop", "lab-input", 650, { zone: "generic", caption: preview(node.input) || "INPUT", evidence: "exact", payload: node.input });
    b.add(node, "action", "effect", "tool-wait", 650, { zone: "generic", caption: "PROCESSING…", skippable: true });
  },
};

const adapters = [webAdapter, terminalAdapter, archiveAdapter, codeAdapter, taskAdapter, fallbackAdapter];

function compileResult(node: TraceNode, b: CueBuilder) {
  const zone = toolZone(node.tool ?? "") as string;
  const output = parsedOutput(node.output);
  const results = Array.isArray((output as any)?.results) ? (output as any).results : undefined;
  b.add(node, node.kind === "error" ? "system" : "observation", "effect", node.kind === "error" ? "tool-error" : "result-arrive", 500, {
    zone,
    explanation: node.kind === "error" ? "工具返回了真实错误" : "工具结果已经返回",
    payload: output,
  });
  if (results) {
    b.add(node, "observation", "prop", "result-cards", 950, {
      zone,
      caption: `${results.length} 条结果`,
      evidence: "exact",
      payload: results.slice(0, 3),
    });
    for (const result of results.slice(0, 3)) {
      b.add(node, "observation", "caption", "scan-result", 700, {
        zone,
        caption: preview(result?.title ?? result?.url ?? result),
        evidence: "exact",
        payload: result,
        skippable: true,
      });
    }
  } else {
    b.add(node, node.kind === "error" ? "system" : "observation", "prop", "result-preview", 900, {
      zone,
      caption: preview(output, 160) || (node.kind === "error" ? "执行失败" : "执行完成"),
      evidence: "exact",
      payload: output,
    });
  }
  b.add(node, node.kind === "error" ? "system" : "observation", "actor", node.kind === "error" ? "react-error" : "react-success", 450, {
    zone,
    caption: node.kind === "error" ? "ERR!" : "OK!",
  });
}

export function compileScene(trace: TurnTrace, cut: PlaybackCut = "director") {
  const b = new CueBuilder(trace, cut);
  for (const node of trace.nodes) {
    if (node.kind === "user-prompt") {
      b.add(node, "system", "prop", "message-arrive", 550, { caption: node.exactText, evidence: "exact", payload: node.exactText });
      b.add(node, "system", "actor", "read-brief", 650, { zone: "center", explanation: "Agent 接收并阅读用户任务" });
      b.add(node, "thought", "camera", "focus-agent", 300, { zone: "center", evidence: "ambient", skippable: true });
    } else if (node.kind === "model-call") {
      b.add(node, "thought", "effect", "context-load", 450, {
        zone: "center",
        caption: `MODEL CALL #${(node.input as any)?.callIndex ?? ""}`,
        explanation: "模型接收到当前对话与工具定义",
        payload: node.input,
      });
    } else if (node.kind === "reasoning") {
      b.add(node, "thought", "actor", "move", 650, { zone: "center", explanation: "Agent 回到思考区整理信息" });
      const segments = splitExactText(node.exactText ?? "");
      if (!segments.length) {
        b.add(node, "thought", "effect", "thought-pulse", 400, { zone: "center", evidence: "ambient", skippable: true });
      }
      for (const segment of segments) {
        b.add(node, "thought", "caption", "reasoning-caption", 1100 + Math.min(800, segment.length * 10), {
          zone: "center",
          caption: segment,
          explanation: "这是 OpenCode 实际提供的 reasoning 片段",
          evidence: "exact",
          payload: node.exactText,
        });
      }
      b.add(node, "thought", "effect", "idea-ready", 350, { zone: "center", evidence: "ambient", skippable: true });
    } else if (node.kind === "tool-call") {
      const adapter = adapters.find((item) => item.matches(node.tool ?? ""))!;
      adapter.compile(node, b);
    } else if (node.kind === "tool-result" || node.kind === "error") {
      compileResult(node, b);
    } else if (node.kind === "answer") {
      b.add(node, "answer", "actor", "move", 850, { zone: "answer", explanation: "Agent 前往答案发布台" });
      for (const segment of splitExactText(node.exactText ?? "")) {
        b.add(node, "answer", "caption", "answer-type", 900 + Math.min(700, segment.length * 9), {
          zone: "answer",
          caption: segment,
          explanation: "正在输出真实回答",
          evidence: "exact",
          payload: node.exactText,
        });
      }
      b.add(node, "answer", "prop", "seal-answer", 500, { zone: "answer", caption: "DELIVERED", skippable: true });
    } else if (node.kind === "turn-end") {
      b.add(node, "system", "effect", "turn-complete", 650, { caption: "任务完成", explanation: "OpenCode 已结束本次交互" });
    }
  }
  // A seeded ambient cue gives the room a deterministic finishing flourish.
  if (b.cues.length) {
    const lastNode = trace.nodes.at(-1)!;
    b.add(lastNode, "system", "effect", hash(trace.userMessageId) % 2 ? "sparkle-left" : "sparkle-right", 300, {
      evidence: "ambient",
      skippable: true,
    });
  }
  return b.cues;
}

