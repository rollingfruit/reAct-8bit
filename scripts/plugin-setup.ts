import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfigDirectory } from "./plugin-utils.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDirectory = await resolveConfigDirectory();
const pluginsDirectory = path.join(configDirectory, "plugins");
const target = path.join(pluginsDirectory, "react-8bit-studio.js");
const captureConfig = path.join(configDirectory, "react-8bit-studio.json");

await mkdir(pluginsDirectory, { recursive: true });
try {
  const current = await readFile(target);
  const backup = `${target}.backup-${Date.now()}`;
  await writeFile(backup, current);
  console.log(`已备份旧插件：${backup}`);
} catch {
  // First install.
}

await copyFile(path.join(root, "plugin", "react-8bit-studio.js"), target);
try {
  const old = JSON.parse(await readFile(captureConfig, "utf8"));
  if (old.token) {
    await writeFile(
      captureConfig,
      JSON.stringify(
        {
          captureUrl: `http://127.0.0.1:${process.env.STUDIO_PORT ?? 4173}/internal/context`,
          token: old.token,
        },
        null,
        2,
      ),
    );
  }
} catch {
  await writeFile(
    captureConfig,
    JSON.stringify(
      {
        captureUrl: `http://127.0.0.1:${process.env.STUDIO_PORT ?? 4173}/internal/context`,
        token: randomBytes(32).toString("hex"),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

console.log("Context Capture 插件安装完成。重启 OpenCode 后生效。");
