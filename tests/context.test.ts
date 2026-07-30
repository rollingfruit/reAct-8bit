import assert from "node:assert/strict";
import test from "node:test";
import { ContextAssembler, redact } from "../server/context.js";

test("redacts credential-like fields recursively without truncating content", () => {
  const longText = "x".repeat(20_000);
  const result = redact({
    apiKey: "secret",
    nested: { Authorization: "Bearer secret", content: longText },
    list: [{ refresh_token: "secret", safe: "yes" }],
  });
  assert.equal(result.apiKey, "[REDACTED]");
  assert.equal(result.nested.Authorization, "[REDACTED]");
  assert.equal(result.nested.content.length, 20_000);
  assert.equal(result.list[0]?.refresh_token, "[REDACTED]");
  assert.equal(result.list[0]?.safe, "yes");
});

test("assembles a separate semantic context for every params fragment", () => {
  const assembler = new ContextAssembler();
  assembler.ingest({ kind: "system", sessionId: "ses_1", system: ["You are helpful"] });
  assembler.ingest({ kind: "messages", sessionId: "ses_1", messages: [{ role: "user", content: "hi" }] });
  assembler.ingest({ kind: "tool", toolId: "bash", definition: { description: "run shell" } });
  const first = assembler.ingest({
    kind: "params",
    sessionId: "ses_1",
    userMessageId: "msg_1",
    agent: "build",
    model: { providerId: "opencode", modelId: "model" },
    params: { temperature: 0 },
  });
  const second = assembler.ingest({
    kind: "params",
    sessionId: "ses_1",
    userMessageId: "msg_1",
    agent: "build",
    model: { providerId: "opencode", modelId: "model" },
    params: { temperature: 0 },
  });
  assert.equal(first?.callIndex, 1);
  assert.equal(second?.callIndex, 2);
  assert.equal(first?.messages.length, 1);
  assert.ok(first?.tools.bash);
});
