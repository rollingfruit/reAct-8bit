import { rm } from "node:fs/promises";
import path from "node:path";
import { resolveConfigDirectory } from "./plugin-utils.js";

const configDirectory = await resolveConfigDirectory();
await rm(path.join(configDirectory, "plugins", "react-8bit-studio.js"), { force: true });
await rm(path.join(configDirectory, "react-8bit-studio.json"), { force: true });
console.log("Context Capture 插件已卸载；历史备份未删除。");
