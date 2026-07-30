import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function findOpenCodeForSetup() {
  if (process.env.OPENCODE_BIN && (await exists(process.env.OPENCODE_BIN))) {
    return process.env.OPENCODE_BIN;
  }
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(lookup, ["opencode"]);
    const found = stdout.split(/\r?\n/).find(Boolean);
    if (found) return found.trim();
  } catch {
    // Check common per-user installation below.
  }
  const fallback = path.join(
    os.homedir(),
    ".opencode",
    "bin",
    process.platform === "win32" ? "opencode.exe" : "opencode",
  );
  if (await exists(fallback)) return fallback;
  throw new Error("未找到 OpenCode，请设置 OPENCODE_BIN。");
}

export async function resolveConfigDirectory() {
  const executable = await findOpenCodeForSetup();
  const { stdout } = await execFileAsync(executable, ["debug", "paths"]);
  const line = stdout.split(/\r?\n/).find((item) => item.startsWith("config "));
  if (!line) throw new Error("OpenCode 未返回 config 路径。");
  return line.replace(/^config\s+/, "").trim();
}
