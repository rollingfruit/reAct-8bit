import type { ModelContextSnapshot, TraceNode, TurnTrace } from "../../shared/types.js";

type OpenCodeMessage = {
  info?: Record<string, any>;
  parts?: Array<Record<string, any>>;
};

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function node(
  message: OpenCodeMessage,
  part: Record<string, any>,
  kind: TraceNode["kind"],
  sequence: number,
  fields: Partial<TraceNode> = {},
): TraceNode {
  const messageId = String(message.info?.id ?? "");
  return {
    id: `trace:${messageId}:${String(part.id ?? sequence)}:${kind}`,
    kind,
    sourceMessageIds: messageId ? [messageId] : [],
    sourcePartIds: part.id ? [String(part.id)] : [],
    startedAt: number(part.time?.start ?? part.state?.time?.start, number(message.info?.time?.created, sequence)),
    endedAt: number(part.time?.end ?? part.state?.time?.end, number(message.info?.time?.completed, sequence)) || undefined,
    agentId: String(message.info?.agent ?? message.info?.mode ?? "build"),
    ...fields,
  };
}

export function compileTurnTraces(
  history: OpenCodeMessage[],
  contexts: Iterable<ModelContextSnapshot> = [],
): Map<string, TurnTrace> {
  const users = new Map<string, OpenCodeMessage>();
  const assistants = new Map<string, OpenCodeMessage[]>();
  for (const message of history) {
    const role = message.info?.role;
    if (role === "user" && message.info?.id) users.set(String(message.info.id), message);
    if (role === "assistant" && message.info?.parentID) {
      const parentId = String(message.info.parentID);
      const group = assistants.get(parentId) ?? [];
      group.push(message);
      assistants.set(parentId, group);
    }
  }

  const contextsByUser = new Map<string, ModelContextSnapshot[]>();
  for (const context of contexts) {
    const group = contextsByUser.get(context.userMessageId) ?? [];
    group.push(context);
    contextsByUser.set(context.userMessageId, group);
  }

  const traces = new Map<string, TurnTrace>();
  for (const [userMessageId, userMessage] of users) {
    const children = (assistants.get(userMessageId) ?? [])
      .sort((a, b) => number(a.info?.time?.created, 0) - number(b.info?.time?.created, 0));
    if (!children.length) continue;
    const nodes: TraceNode[] = [];
    let sequence = 0;
    const userText = (userMessage.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n");
    nodes.push(node(userMessage, userMessage.parts?.[0] ?? {}, "user-prompt", ++sequence, {
      exactText: userText,
      endedAt: number(userMessage.info?.time?.created, sequence),
      agentId: String(userMessage.info?.agent ?? children[0]?.info?.agent ?? "build"),
    }));

    for (const context of (contextsByUser.get(userMessageId) ?? []).sort((a, b) => a.callIndex - b.callIndex)) {
      nodes.push({
        id: `trace:context:${context.id}`,
        kind: "model-call",
        sourceMessageIds: [userMessageId],
        sourcePartIds: [],
        startedAt: context.capturedAt,
        endedAt: context.capturedAt,
        contextSnapshotId: context.id,
        agentId: context.agent || "build",
        input: {
          callIndex: context.callIndex,
          model: context.model,
          messageCount: context.messages.length,
          toolCount: Object.keys(context.tools).length,
        },
      });
    }

    let terminalMessage: OpenCodeMessage | undefined;
    for (const message of children) {
      // A turn is semantically closed by its first terminal assistant message.
      // Some server/plugin combinations may briefly expose duplicate stop
      // messages or a trailing empty step-start; those belong outside this turn.
      if (terminalMessage) break;
      const parts = message.parts ?? [];
      for (const part of parts) {
        if (part.type === "step-start") {
          nodes.push(node(message, part, "reasoning", ++sequence, { exactText: "" }));
        } else if (part.type === "reasoning") {
          nodes.push(node(message, part, "reasoning", ++sequence, { exactText: String(part.text ?? "") }));
        } else if (part.type === "tool") {
          const state = part.state ?? {};
          nodes.push(node(message, part, "tool-call", ++sequence, {
            tool: String(part.tool ?? "tool"),
            callId: part.callID ? String(part.callID) : undefined,
            input: state.input,
            endedAt: number(state.time?.start, number(message.info?.time?.created, sequence)),
          }));
          const failed = state.status === "error";
          nodes.push(node(message, part, failed ? "error" : "tool-result", ++sequence, {
            tool: String(part.tool ?? "tool"),
            callId: part.callID ? String(part.callID) : undefined,
            input: state.input,
            output: failed ? state.error : state.output,
          }));
        } else if (part.type === "text") {
          nodes.push(node(message, part, "answer", ++sequence, { exactText: String(part.text ?? "") }));
        }
      }
      if (message.info?.finish === "stop" || message.info?.finish === "error") {
        terminalMessage = message;
      }
    }

    const finalMessage = terminalMessage ?? children.at(-1);
    const status = finalMessage?.info?.finish === "stop"
      ? "complete"
      : finalMessage?.info?.finish === "error"
        ? "error"
        : "running";
    nodes.push({
      id: `trace:${userMessageId}:turn-end`,
      kind: status === "error" ? "error" : "turn-end",
      sourceMessageIds: finalMessage?.info?.id ? [String(finalMessage.info.id)] : [userMessageId],
      sourcePartIds: [],
      startedAt: number(finalMessage?.info?.time?.completed, Date.now()),
      endedAt: number(finalMessage?.info?.time?.completed, Date.now()),
      agentId: String(finalMessage?.info?.agent ?? userMessage.info?.agent ?? "build"),
    });
    nodes.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    traces.set(userMessageId, {
      id: `turn:${String(userMessage.info?.sessionID ?? "")}:${userMessageId}`,
      sessionId: String(userMessage.info?.sessionID ?? finalMessage?.info?.sessionID ?? ""),
      userMessageId,
      agentId: nodes[0]?.agentId ?? "build",
      status,
      nodes,
    });
  }
  return traces;
}
