import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PlatformKind = "macos" | "linux" | "windows" | "wsl";

export interface OpenCodePaths {
  home?: string;
  data?: string;
  bin?: string;
  log?: string;
  cache?: string;
  config?: string;
  state?: string;
  tmp?: string;
}

export interface PlatformAdapter {
  kind: PlatformKind;
  findOpenCode(): Promise<string>;
  debugPaths(executable: string): Promise<OpenCodePaths>;
}

export function detectPlatform(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): PlatformKind {
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return "wsl";
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

export function parseDebugPaths(output: string): OpenCodePaths {
  const result: OpenCodePaths = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\w+)\s+(.+)$/);
    if (!match) continue;
    const key = match[1] as keyof OpenCodePaths;
    result[key] = match[2]?.trim();
  }
  return result;
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(kind: PlatformKind): Promise<string | undefined> {
  const command = kind === "windows" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(command, ["opencode"], { timeout: 3_000 });
    return stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

export function createPlatformAdapter(kind = detectPlatform()): PlatformAdapter {
  return {
    kind,
    async findOpenCode() {
      const configured = process.env.OPENCODE_BIN;
      if (configured && (await isExecutable(configured))) return configured;

      const onPath = await findOnPath(kind);
      if (onPath) return onPath;

      const home = os.homedir();
      const candidates =
        kind === "windows"
          ? [
              path.join(home, ".opencode", "bin", "opencode.exe"),
              path.join(process.env.APPDATA ?? "", "npm", "opencode.cmd"),
              path.join(home, "scoop", "shims", "opencode.exe"),
            ]
          : [
              path.join(home, ".opencode", "bin", "opencode"),
              "/opt/homebrew/bin/opencode",
              "/usr/local/bin/opencode",
            ];

      for (const candidate of candidates) {
        if (candidate && (await isExecutable(candidate))) return candidate;
      }
      throw new Error("未找到 OpenCode。请先安装，或设置 OPENCODE_BIN。");
    },
    async debugPaths(executable: string) {
      const { stdout } = await execFileAsync(executable, ["debug", "paths"], {
        timeout: 5_000,
        windowsHide: true,
      });
      return parseDebugPaths(stdout);
    },
  };
}
