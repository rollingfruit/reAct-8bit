import { createHash } from "node:crypto";
import type { ContextFragment, ModelContextSnapshot } from "../shared/types.js";

const SENSITIVE_KEY = /(authorization|cookie|api[-_]?key|token|secret|password|credential)/i;

export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]" as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item, seen);
  }
  return output as T;
}

export class ContextAssembler {
  private messages = new Map<string, unknown[]>();
  private system = new Map<string, string[]>();
  private tools: Record<string, unknown> = {};
  private counts = new Map<string, number>();

  ingest(fragment: ContextFragment): ModelContextSnapshot | undefined {
    if (fragment.kind === "messages") {
      this.messages.set(fragment.sessionId, redact(fragment.messages));
      return undefined;
    }
    if (fragment.kind === "system") {
      this.system.set(fragment.sessionId, redact(fragment.system));
      return undefined;
    }
    if (fragment.kind === "tool") {
      this.tools[fragment.toolId] = redact(fragment.definition);
      return undefined;
    }
    if (fragment.kind === "message") {
      if (!this.messages.has(fragment.sessionId)) {
        this.messages.set(fragment.sessionId, [redact({ info: fragment.message, parts: fragment.parts })]);
      }
      return undefined;
    }

    const count = (this.counts.get(fragment.sessionId) ?? 0) + 1;
    this.counts.set(fragment.sessionId, count);
    const seed = `${fragment.sessionId}:${fragment.userMessageId}:${count}:${Date.now()}`;
    return {
      id: `ctx_${createHash("sha1").update(seed).digest("hex").slice(0, 20)}`,
      sessionId: fragment.sessionId,
      userMessageId: fragment.userMessageId,
      callIndex: count,
      capturedAt: Date.now(),
      model: redact(fragment.model),
      agent: fragment.agent,
      system: this.system.get(fragment.sessionId) ?? [],
      messages: this.messages.get(fragment.sessionId) ?? [],
      tools: redact(this.tools),
      params: redact(fragment.params),
      redacted: true,
    };
  }
}
