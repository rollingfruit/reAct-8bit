import { expect, test } from "@playwright/test";

test("renders the complete workshop and responsive chat controls", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("ReAct // Agent Studio");
  await expect(page.getByRole("heading", { name: "Agent 工作室" })).toBeVisible();
  await expect(page.locator('[data-zone="terminal"]')).toContainText("SHELL");
  await expect(page.locator('[data-zone="archive"]')).toContainText("FILES");
  await expect(page.locator('[data-zone="code"]')).toContainText("CODE");
  await expect(page.locator('[data-zone="portal"]')).toContainText("WEB");
  await expect(page.locator('[data-zone="subagent"]')).toContainText("SPAWN");
  await expect(page.getByLabel("输入任务")).toBeVisible();
  await expect(page.getByRole("button", { name: "SEND ↗" })).toBeVisible();
});

test("opens the attach dialog with explicit connection fields", async ({ page }) => {
  await page.goto("/");
  await page.locator("#attachButton").click({ force: true });
  await expect(page.getByText("连接 OpenCode")).toBeVisible();
  await expect(page.getByLabel("Server URL")).toHaveValue("http://127.0.0.1:4096");
  await expect(page.getByLabel("用户名")).toHaveValue("opencode");
});

test("keeps the frame fixed and gives each submitted user message a routable URL", async ({ page }) => {
  const session = { id: "ses_route_test", title: "Routing test", time: { updated: Date.now() } };
  const history = Array.from({ length: 36 }, (_, index) => ({
    info: { id: `msg_history_${index}`, role: index % 2 ? "assistant" : "user" },
    parts: [{ type: "text", text: `history line ${index} ${"content ".repeat(15)}` }],
  }));
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: [session] });
    } else {
      await route.fulfill({ status: 201, json: session });
    }
  });
  await page.route("**/api/sessions/ses_route_test/messages", (route) => route.fulfill({ json: history }));
  await page.route("**/api/sessions/ses_route_test/prompt", (route) => route.fulfill({
    status: 202,
    json: { accepted: true, sessionId: session.id, messageId: "msg_unique_route" },
  }));

  await page.goto(`/?session=${session.id}`);
  await expect(page.locator(".message-card")).toHaveCount(36);
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerHeight,
    document: document.documentElement.scrollHeight,
    room: document.querySelector<HTMLElement>("#room")!.getBoundingClientRect(),
    messagesClient: document.querySelector<HTMLElement>("#messages")!.clientHeight,
    messagesScroll: document.querySelector<HTMLElement>("#messages")!.scrollHeight,
  }));
  expect(dimensions.document).toBe(dimensions.viewport);
  expect(dimensions.room.bottom).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.messagesScroll).toBeGreaterThan(dimensions.messagesClient);

  await page.getByLabel("输入任务").fill("find the exact log");
  await page.getByRole("button", { name: "SEND ↗" }).click();
  await expect(page).toHaveURL(/session=ses_route_test.*message=msg_unique_route/);
  await expect(page.locator('[data-message-id="msg_unique_route"]')).toHaveClass(/log-target/);
});

test("replays a completed ReAct turn from its user message card", async ({ page }) => {
  const now = Date.now();
  const session = { id: "ses_replay_test", title: "Replay test", time: { updated: now } };
  const history = [
    {
      info: { id: "msg_user_replay", sessionID: session.id, role: "user", time: { created: now } },
      parts: [{ id: "part_user", type: "text", text: "inspect the project" }],
    },
    {
      info: {
        id: "msg_assistant_replay",
        sessionID: session.id,
        role: "assistant",
        parentID: "msg_user_replay",
        agent: "build",
        finish: "stop",
        time: { created: now + 1, completed: now + 8 },
      },
      parts: [
        { id: "part_step", type: "step-start" },
        { id: "part_reason", type: "reasoning", text: "Inspecting.", time: { start: now + 2, end: now + 3 } },
        {
          id: "part_tool",
          type: "tool",
          callID: "call_replay",
          tool: "bash",
          state: { status: "completed", input: { command: "pwd" }, output: "/project", time: { start: now + 4, end: now + 5 } },
        },
        { id: "part_text", type: "text", text: "Done.", time: { start: now + 6, end: now + 7 } },
      ],
    },
  ];
  await page.route("**/api/sessions", (route) => route.fulfill({ json: [session] }));
  await page.route("**/api/sessions/ses_replay_test/messages", (route) => route.fulfill({ json: history }));

  await page.goto(`/?session=${session.id}&message=msg_user_replay`);
  const replay = page.getByRole("button", { name: "▶ 回放" });
  await expect(replay).toBeVisible();
  await replay.click();
  await expect(page.locator("#room")).toHaveClass(/is-replaying/);
  await expect(page.locator("#currentActivity")).toContainText("回放");
  await expect(page.getByText("ReAct 回放完成")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#room")).not.toHaveClass(/is-replaying/);
});
