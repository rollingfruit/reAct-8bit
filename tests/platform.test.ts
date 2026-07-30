import assert from "node:assert/strict";
import test from "node:test";
import { detectPlatform, parseDebugPaths } from "../server/platform.js";

test("detects macOS, Windows, and WSL independently", () => {
  assert.equal(detectPlatform("darwin", {}), "macos");
  assert.equal(detectPlatform("win32", {}), "windows");
  assert.equal(detectPlatform("linux", { WSL_DISTRO_NAME: "Ubuntu" }), "wsl");
});

test("parses opencode debug paths without assuming Unix paths", () => {
  const mac = parseDebugPaths("home       /Users/dev\ndata       /Users/dev/.local/share/opencode\nconfig     /Users/dev/.config/opencode\n");
  assert.equal(mac.config, "/Users/dev/.config/opencode");
  const windows = parseDebugPaths("home       C:\\Users\\dev\nconfig     C:\\Users\\dev\\.config\\opencode\r\n");
  assert.equal(windows.config, "C:\\Users\\dev\\.config\\opencode");
});
