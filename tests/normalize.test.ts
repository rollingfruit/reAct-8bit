import assert from "node:assert/strict";
import test from "node:test";
import { EventNormalizer } from "../server/normalize.js";

test("normalizes native v2 tool lifecycle", () => {
  const normalizer = new EventNormalizer();
  const called = normalizer.normalize({
    id: "evt_1",
    type: "session.next.tool.called",
    properties: {
      timestamp: 10,
      sessionID: "ses_1",
      assistantMessageID: "msg_1",
      callID: "call_1",
      tool: "bash",
      input: { command: "pwd" },
    },
  });
  const success = normalizer.normalize({
    id: "evt_2",
    type: "session.next.tool.success",
    properties: {
      timestamp: 20,
      sessionID: "ses_1",
      assistantMessageID: "msg_1",
      callID: "call_1",
      result: "/tmp",
    },
  });
  assert.deepEqual(
    [called?.phase, called?.status, called?.callId, success?.phase, success?.status],
    ["action", "running", "call_1", "observation", "success"],
  );
});

test("normalizes legacy pending/running/completed and deduplicates event ids", () => {
  const normalizer = new EventNormalizer();
  const raw = (id: string, status: string) => ({
    id,
    type: "message.part.updated",
    properties: {
      sessionID: "ses_legacy",
      part: {
        type: "tool",
        tool: "read",
        callID: "call_read",
        messageID: "msg_2",
        state: { status, input: { filePath: "README.md" }, output: "ok" },
      },
    },
  });
  assert.equal(normalizer.normalize(raw("evt_a", "pending"))?.status, "pending");
  assert.equal(normalizer.normalize(raw("evt_b", "running"))?.status, "running");
  assert.equal(normalizer.normalize(raw("evt_c", "completed"))?.status, "success");
  assert.equal(normalizer.normalize(raw("evt_c", "completed")), undefined);
});
