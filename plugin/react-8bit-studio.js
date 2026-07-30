import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(pluginDirectory, "..", "react-8bit-studio.json");

async function captureConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
}

async function send(fragment) {
  const config = await captureConfig();
  if (!config?.captureUrl || !config?.token) return;
  try {
    await fetch(config.captureUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-react-studio-token": config.token,
      },
      body: JSON.stringify(fragment),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Studio is optional. Never block or break the OpenCode request path.
  }
}

function modelShape(model, variant) {
  return {
    providerId: model?.providerID ?? model?.providerId ?? "unknown",
    modelId: model?.modelID ?? model?.id ?? "unknown",
    ...(variant ? { variant } : {}),
  };
}

export const React8BitStudio = async () => ({
  "chat.message": async (input, output) => {
    await send({
      kind: "message",
      sessionId: input.sessionID,
      userMessageId: input.messageID ?? output.message?.id ?? "unknown",
      message: output.message,
      parts: output.parts,
    });
  },

  "chat.params": async (input, output) => {
    await send({
      kind: "params",
      sessionId: input.sessionID,
      userMessageId: input.message?.id ?? "unknown",
      agent: input.agent,
      model: modelShape(input.model, input.message?.variant),
      params: {
        temperature: output.temperature,
        topP: output.topP,
        topK: output.topK,
        maxOutputTokens: output.maxOutputTokens,
        options: output.options,
      },
    });
  },

  "experimental.chat.messages.transform": async (_input, output) => {
    const last = output.messages?.at(-1);
    const sessionId = last?.info?.sessionID;
    if (!sessionId) return;
    await send({
      kind: "messages",
      sessionId,
      messages: output.messages,
    });
  },

  "experimental.chat.system.transform": async (input, output) => {
    if (!input.sessionID) return;
    await send({
      kind: "system",
      sessionId: input.sessionID,
      system: output.system,
    });
  },

  "tool.definition": async (input, output) => {
    await send({
      kind: "tool",
      toolId: input.toolID,
      definition: {
        description: output.description,
        parameters: output.parameters,
      },
    });
  },
});
