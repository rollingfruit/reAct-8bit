import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { OpenCodeBridge } from "../server/opencode.js";

test("connects to a fake OpenCode server and consumes native SSE", async () => {
  let promptBody: any;
  const fake = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/global/health") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ healthy: true, version: "1.16.2-test" }));
      return;
    }
    if (url.pathname === "/api/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      response.write(
        `data: ${JSON.stringify({
          id: "evt_fake_tool",
          type: "session.next.tool.called",
          properties: {
            timestamp: Date.now(),
            sessionID: "ses_fake",
            assistantMessageID: "msg_fake",
            callID: "call_fake",
            tool: "bash",
            input: { command: "pwd" },
            provider: { executed: false },
          },
        })}\n\n`,
      );
      return;
    }
    if (url.pathname === "/session") {
      response.setHeader("content-type", "application/json");
      response.end("[]");
      return;
    }
    if (url.pathname === "/session/ses_fake/prompt_async" && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        promptBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.setHeader("content-type", "application/json");
        response.end("true");
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const address = fake.address() as AddressInfo;
  const bridge = new OpenCodeBridge({
    baseUrl: `http://127.0.0.1:${address.port}`,
    managed: false,
    directory: "/tmp/project",
  });
  const event = new Promise<{ phase: string; callId?: string }>((resolve) => {
    bridge.onEvent = (item) => resolve({ phase: item.phase, callId: item.callId });
  });
  await bridge.initialize();
  assert.deepEqual(await Promise.race([
    event,
    new Promise((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 2_000)),
  ]), { phase: "action", callId: "call_fake" });
  assert.equal(bridge.status.eventMode, "v2");
  await bridge.prompt("ses_fake", "inspect this", "build", "msg_studio_unique");
  assert.equal(promptBody.messageID, "msg_studio_unique");
  assert.equal(promptBody.parts[0].text, "inspect this");
  await bridge.close();
  await new Promise<void>((resolve) => fake.close(() => resolve()));
});
