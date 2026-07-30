import assert from "node:assert/strict";
import test from "node:test";
import { ActionDirector, personaFor, toolZone, type CharacterRenderer } from "../web/studio.js";

test("assigns stable named personas", () => {
  assert.equal(personaFor("build").role, "工匠");
  assert.equal(personaFor("plan").role, "策略家");
  assert.equal(personaFor("explore").role, "侦察员");
  assert.deepEqual(personaFor("custom-agent", "ses_1"), personaFor("custom-agent", "ses_1"));
});

test("routes known and unknown tools to workstations", () => {
  assert.equal(toolZone("bash"), "terminal");
  assert.equal(toolZone("read"), "archive");
  assert.equal(toolZone("apply_patch"), "code");
  assert.equal(toolZone("websearch"), "portal");
  assert.equal(toolZone("todowrite"), "todo");
  assert.equal(toolZone("task"), "subagent");
  assert.equal(toolZone("mystery"), "generic");
});

test("keeps one character for concurrent calls from the same agent", () => {
  const ensured: Array<{ key: string; clone?: boolean }> = [];
  let cleared = 0;
  const renderer: CharacterRenderer = {
    ensure(key, _persona, clone) {
      ensured.push({ key, clone });
      return {} as HTMLElement;
    },
    async move() {},
    state() {},
    retire() {},
    clear() {
      cleared += 1;
    },
  };
  const director = new ActionDirector(renderer);
  const base = {
    sequence: 1,
    timestamp: Date.now(),
    sessionId: "ses_one",
    agentId: "build",
    phase: "action",
    kind: "tool.running",
    status: "running",
    title: "bash",
  } as const;
  director.handle({ ...base, id: "evt_1", callId: "call_1" });
  director.handle({ ...base, id: "evt_2", callId: "call_2" });

  assert.deepEqual(ensured.map((item) => item.key), ["ses_one:build", "ses_one:build"]);
  assert.equal(ensured.some((item) => item.clone), false);
  director.reset();
  assert.equal(cleared, 1);
});

test("replays archived events through the accelerated renderer", async () => {
  const speeds: number[] = [];
  const renderer: CharacterRenderer = {
    ensure() {
      return {} as HTMLElement;
    },
    async move(_key, _zone, _state, speed) {
      speeds.push(speed ?? 1);
    },
    state() {},
    retire() {},
    clear() {},
  };
  const director = new ActionDirector(renderer);
  await director.replay([{
    id: "replay_1",
    sequence: 1,
    timestamp: 1,
    sessionId: "ses_replay",
    agentId: "build",
    phase: "thought",
    kind: "replay.reasoning",
    status: "running",
    title: "正在分析",
  }]);
  assert.deepEqual(speeds, [2.8]);
});
