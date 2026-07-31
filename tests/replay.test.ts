import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileScene } from "../web/replay/scene-compiler.js";
import { TimelinePlayer } from "../web/replay/timeline-player.js";
import { compileTurnTraces } from "../web/replay/trace-compiler.js";

function weatherHistory() {
  const time = 1_000;
  return [
    {
      info: { id: "msg_user", sessionID: "ses_weather", role: "user", agent: "build", time: { created: time } },
      parts: [{ id: "prt_user", type: "text", text: "查看今天南京天气" }],
    },
    {
      info: {
        id: "msg_assistant_1",
        sessionID: "ses_weather",
        role: "assistant",
        parentID: "msg_user",
        agent: "build",
        finish: "tool-calls",
        time: { created: time + 10, completed: time + 100 },
      },
      parts: [
        { id: "prt_start_1", type: "step-start" },
        { id: "prt_reason_1", type: "reasoning", text: "The user asks for Nanjing weather. I should search the web.", time: { start: time + 20, end: time + 30 } },
        {
          id: "prt_tool",
          type: "tool",
          callID: "call_weather",
          tool: "websearch",
          state: {
            status: "completed",
            input: { query: "南京天气" },
            output: JSON.stringify({ results: [
              { title: "南京天气 A", url: "https://a.example" },
              { title: "南京天气 B", url: "https://b.example" },
              { title: "南京天气 C", url: "https://c.example" },
              { title: "南京天气 D", url: "https://d.example" },
            ] }),
            time: { start: time + 40, end: time + 90 },
          },
        },
      ],
    },
    {
      info: {
        id: "msg_assistant_2",
        sessionID: "ses_weather",
        role: "assistant",
        parentID: "msg_user",
        agent: "build",
        finish: "stop",
        time: { created: time + 101, completed: time + 160 },
      },
      parts: [
        { id: "prt_start_2", type: "step-start" },
        { id: "prt_reason_2", type: "reasoning", text: "The results show cloudy weather. The temperature is 27 to 36 degrees.", time: { start: time + 110, end: time + 120 } },
        { id: "prt_answer", type: "text", text: "南京今天多云，27~36°C。高温天气，注意防暑。", time: { start: time + 130, end: time + 150 } },
      ],
    },
  ];
}

test("groups assistant rounds by parent message into a complete trace", () => {
  const traces = compileTurnTraces(weatherHistory());
  const trace = traces.get("msg_user")!;
  assert.equal(trace.status, "complete");
  assert.equal(trace.sessionId, "ses_weather");
  assert.equal(trace.nodes.filter((node) => node.kind === "reasoning").length, 4);
  assert.equal(trace.nodes.filter((node) => node.kind === "tool-call").length, 1);
  assert.equal(trace.nodes.filter((node) => node.kind === "tool-result").length, 1);
  assert.equal(trace.nodes.find((node) => node.kind === "tool-call")?.callId, "call_weather");
});

test("compiles a deterministic cinematic web trace with source evidence", () => {
  const trace = compileTurnTraces(weatherHistory()).get("msg_user")!;
  const first = compileScene(trace, "director");
  const second = compileScene(trace, "director");
  assert.deepEqual(first, second);
  assert.ok(first.length >= 25, `expected at least 25 cues, got ${first.length}`);
  assert.ok(first.some((cue) => cue.action === "write-query-card" && cue.caption === "南京天气"));
  assert.ok(first.some((cue) => cue.action === "result-cards" && cue.caption === "4 条结果"));
  assert.ok(first.every((cue) => cue.evidence === "ambient" || cue.traceNodeIds.length > 0));
  assert.ok(first.at(-1)!.start + first.at(-1)!.duration >= 15_000);
  assert.ok(compileScene(trace, "compact").length < first.length);
});

test("timeline supports seek, stepping and speed without changing cue data", () => {
  const cues = compileScene(compileTurnTraces(weatherHistory()).get("msg_user")!);
  const snapshots: number[] = [];
  const player = new TimelinePlayer((snapshot) => snapshots.push(snapshot.cueIndex));
  player.setCues(cues);
  player.seek(cues[5]!.start);
  assert.equal(player.snapshot.cue?.id, cues[5]!.id);
  player.step(1);
  assert.equal(player.snapshot.cue?.id, cues[6]!.id);
  player.setSpeed(2);
  assert.equal(player.snapshot.speed, 2);
  player.dispose();
  assert.ok(snapshots.length >= 4);
});

test("generated character sheet passes sprite QC", async () => {
  const meta = JSON.parse(await readFile(
    new URL("../public/assets/studio-v1/character/pipeline-meta.json", import.meta.url),
    "utf8",
  ));
  assert.equal(meta.rows, 4);
  assert.equal(meta.cols, 4);
  assert.equal(meta.frames.length, 16);
  assert.deepEqual(meta.edge_touch_frames, []);
});

test("generated action sheet preserves all sixteen named animation cells", async () => {
  const meta = JSON.parse(await readFile(
    new URL("../public/assets/studio-v1/actions/pipeline-meta.json", import.meta.url),
    "utf8",
  ));
  assert.equal(meta.rows, 4);
  assert.equal(meta.cols, 4);
  assert.equal(meta.frames.length, 16);
  assert.ok(meta.frames.every((frame: { output_size: number[] }) =>
    frame.output_size.length === 2 && frame.output_size.every((size) => size > 0)));
  assert.ok(await readFile(
    new URL("../public/assets/studio-v1/actions/animation.gif", import.meta.url),
  ));
});
