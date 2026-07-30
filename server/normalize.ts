import type { StudioEvent, StudioStatus } from "../shared/types.js";

type JsonRecord = Record<string, any>;

export class EventNormalizer {
  private sequence = 0;
  private agents = new Map<string, string>();
  private seen = new Set<string>();

  normalize(raw: JsonRecord): StudioEvent | undefined {
    const envelope = raw.payload ?? raw;
    const id = String(envelope.id ?? `local-${Date.now()}-${this.sequence + 1}`);
    if (this.seen.has(id)) return undefined;
    this.seen.add(id);
    if (this.seen.size > 10_000) this.seen.delete(this.seen.values().next().value as string);

    const type = String(envelope.type ?? "");
    const properties = (envelope.properties ?? envelope.data ?? {}) as JsonRecord;
    const part = properties.part as JsonRecord | undefined;
    const sessionId = String(
      properties.sessionID ?? part?.sessionID ?? envelope.sessionID ?? "global",
    );
    const messageId = properties.assistantMessageID ?? part?.messageID ?? properties.messageID;

    if (type.includes("session.created") || type.includes("session.updated")) {
      const info = properties.info ?? properties;
      if (info.id && info.agent) this.agents.set(String(info.id), String(info.agent));
      return this.event(id, info.id ?? sessionId, "system", type, "complete", info.agent ?? "OpenCode", info);
    }

    if (type === "session.next.step.started") {
      if (properties.agent) this.agents.set(sessionId, String(properties.agent));
      return this.event(id, sessionId, "thought", type, "running", "开始新一轮推理", properties, messageId);
    }
    if (type === "session.next.reasoning.started" || type === "session.next.reasoning.delta") {
      return this.event(id, sessionId, "thought", type, "running", "正在分析", properties, messageId);
    }
    if (type === "session.next.reasoning.ended") {
      return this.event(id, sessionId, "thought", type, "complete", "完成思考", properties, messageId);
    }
    if (type === "session.next.tool.called" || type === "session.next.tool.progress") {
      const tool = String(properties.tool ?? "tool");
      return this.event(id, sessionId, "action", type, "running", tool, properties, messageId, properties.callID);
    }
    if (type === "session.next.tool.success") {
      return this.event(id, sessionId, "observation", type, "success", "工具执行完成", properties, messageId, properties.callID);
    }
    if (type === "session.next.tool.failed") {
      return this.event(id, sessionId, "observation", type, "error", "工具执行失败", properties, messageId, properties.callID);
    }
    if (type === "session.next.text.started" || type === "session.next.text.delta") {
      return this.event(id, sessionId, "answer", type, "running", "正在回复", properties, messageId);
    }
    if (type === "session.next.text.ended") {
      return this.event(id, sessionId, "answer", type, "complete", "回复完成", properties, messageId);
    }
    if (type === "session.next.step.ended" || type.includes("session.idle")) {
      return this.event(id, sessionId, "system", type, "complete", "本轮完成", properties, messageId);
    }
    if (type.includes("session.error") || type.includes("step.failed")) {
      return this.event(id, sessionId, "system", type, "error", "OpenCode 出错", properties, messageId);
    }

    if ((type === "message.part.updated" || type === "message.part.updated.1") && part) {
      return this.normalizePart(id, sessionId, part);
    }
    return undefined;
  }

  private normalizePart(id: string, sessionId: string, part: JsonRecord): StudioEvent | undefined {
    const agent = this.agents.get(sessionId) ?? "build";
    if (part.type === "reasoning") {
      const status = part.time?.end ? "complete" : "running";
      return this.event(id, sessionId, "thought", "reasoning", status, "推理", part, part.messageID, undefined, agent);
    }
    if (part.type === "text") {
      const status = part.time?.end ? "complete" : "running";
      return this.event(id, sessionId, "answer", "text", status, "回答", part, part.messageID, undefined, agent);
    }
    if (part.type === "tool") {
      const state = part.state ?? {};
      const statusMap: Record<string, StudioStatus> = {
        pending: "pending",
        running: "running",
        completed: "success",
        error: "error",
      };
      const status = statusMap[state.status] ?? "running";
      const phase = status === "success" || status === "error" ? "observation" : "action";
      return this.event(id, sessionId, phase, `tool.${state.status}`, status, part.tool ?? "tool", part, part.messageID, part.callID, agent);
    }
    if (part.type === "step-start") {
      return this.event(id, sessionId, "thought", "step-start", "running", "开始新一轮推理", part, part.messageID, undefined, agent);
    }
    if (part.type === "step-finish") {
      return this.event(id, sessionId, "system", "step-finish", "complete", "本轮完成", part, part.messageID, undefined, agent);
    }
    return undefined;
  }

  private event(
    id: string,
    sessionId: string,
    phase: StudioEvent["phase"],
    kind: string,
    status: StudioStatus,
    title: string,
    payload: unknown,
    messageId?: string,
    callId?: string,
    agentId = this.agents.get(sessionId) ?? "build",
  ): StudioEvent {
    return {
      id,
      sequence: ++this.sequence,
      timestamp: Number((payload as JsonRecord)?.timestamp ?? Date.now()),
      sessionId: String(sessionId),
      messageId: messageId ? String(messageId) : undefined,
      callId: callId ? String(callId) : undefined,
      agentId,
      phase,
      kind,
      status,
      title,
      payload,
    };
  }
}
