import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ContextFragment,
  ModelContextSnapshot,
  StudioConnectionStatus,
  StudioEvent,
} from "../shared/types.js";
import { ContextAssembler } from "./context.js";
import { OpenCodeBridge } from "./opencode.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.STUDIO_PORT ?? 4173);
const host = "127.0.0.1";
const bridge = new OpenCodeBridge();
const assembler = new ContextAssembler();
const clients = new Set<ServerResponse>();
const recentEvents: StudioEvent[] = [];
const contexts = new Map<string, ModelContextSnapshot>();
let status: StudioConnectionStatus = bridge.status;
let captureToken = process.env.REACT_STUDIO_CAPTURE_TOKEN ?? "";

function createMessageId() {
  return `msg_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function sendSse(response: ServerResponse, kind: string, payload: unknown) {
  response.write(`event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(kind: string, payload: unknown) {
  for (const client of clients) sendSse(client, kind, payload);
}

bridge.onEvent = (event) => {
  recentEvents.push(event);
  if (recentEvents.length > 500) recentEvents.shift();
  broadcast("studio-event", event);
};
bridge.onStatus = (next) => {
  status = next;
  broadcast("status", status);
};

async function bodyJson(request: IncomingMessage, limit = 20 * 1024 * 1024): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, code: number, value: unknown) {
  response.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function isLoopback(address?: string) {
  return !address || address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function api(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  const method = request.method ?? "GET";

  if (url.pathname === "/api/status" && method === "GET") {
    json(response, 200, { ...status, directory: bridge.location });
    return true;
  }
  if (url.pathname === "/api/stream" && method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(": connected\n\n");
    clients.add(response);
    sendSse(response, "status", status);
    sendSse(response, "bootstrap", {
      events: recentEvents,
      contexts: [...contexts.values()],
    });
    const heartbeat = setInterval(() => response.write(": ping\n\n"), 20_000);
    request.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(response);
    });
    return true;
  }
  if (url.pathname === "/api/sessions" && method === "GET") {
    json(response, 200, await bridge.listSessions());
    return true;
  }
  if (url.pathname === "/api/sessions" && method === "POST") {
    const body = await bodyJson(request);
    json(response, 201, await bridge.createSession(body.title));
    return true;
  }
  const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (messagesMatch && method === "GET") {
    json(response, 200, await bridge.messages(decodeURIComponent(messagesMatch[1]!)));
    return true;
  }
  const promptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/prompt$/);
  if (promptMatch && method === "POST") {
    const body = await bodyJson(request);
    if (!body.text || typeof body.text !== "string") throw new Error("Prompt text is required");
    const sessionId = decodeURIComponent(promptMatch[1]!);
    const messageId = createMessageId();
    json(response, 202, {
      accepted: await bridge.prompt(sessionId, body.text, body.agent, messageId),
      sessionId,
      messageId,
    });
    return true;
  }
  const abortMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/abort$/);
  if (abortMatch && method === "POST") {
    json(response, 200, { aborted: await bridge.abort(decodeURIComponent(abortMatch[1]!)) });
    return true;
  }
  if (url.pathname === "/api/connect" && method === "POST") {
    const body = await bodyJson(request);
    await bridge.configure({
      baseUrl: body.baseUrl,
      username: body.username,
      password: body.password,
      directory: body.directory,
      managed: Boolean(body.managed),
    });
    json(response, 200, bridge.status);
    return true;
  }
  if (url.pathname === "/internal/context" && method === "POST") {
    if (!isLoopback(request.socket.remoteAddress)) {
      json(response, 403, { error: "loopback only" });
      return true;
    }
    if (!captureToken || request.headers["x-react-studio-token"] !== captureToken) {
      json(response, 401, { error: "invalid capture token" });
      return true;
    }
    const fragment = (await bodyJson(request)) as ContextFragment;
    const snapshot = assembler.ingest(fragment);
    if (snapshot) {
      contexts.set(snapshot.id, snapshot);
      broadcast("context", snapshot);
    }
    json(response, 202, { accepted: true, snapshotId: snapshot?.id });
    return true;
  }
  return false;
}

async function loadCaptureConfig() {
  try {
    const executable = await bridge.platform.findOpenCode();
    const paths = await bridge.platform.debugPaths(executable);
    if (!paths.config) return;
    const configPath = path.join(paths.config, "react-8bit-studio.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    captureToken = config.token ?? captureToken;
    const captureUrl = `http://127.0.0.1:${port}/internal/context`;
    if (config.captureUrl !== captureUrl && captureToken) {
      await writeFile(
        configPath,
        JSON.stringify({ ...config, captureUrl, token: captureToken }, null, 2),
        { mode: 0o600 },
      );
    }
    bridge.setPluginInstalled(Boolean(captureToken));
  } catch {
    bridge.setPluginInstalled(false);
  }
}

let vite: Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | undefined;
const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");
if (!production) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
}

async function serveProduction(request: IncomingMessage, response: ServerResponse) {
  const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const safePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  let filePath = path.join(root, "dist", safePath);
  if (!filePath.startsWith(path.join(root, "dist"))) {
    response.writeHead(403).end();
    return;
  }
  try {
    await access(filePath);
  } catch {
    filePath = path.join(root, "dist", "index.html");
  }
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
  };
  response.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    if (await api(request, response)) return;
    if (vite) {
      vite.middlewares(request, response, () => {
        if (!response.writableEnded) response.writeHead(404).end("Not found");
      });
      return;
    }
    await serveProduction(request, response);
  } catch (error) {
    if (!response.headersSent) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    } else {
      response.end();
    }
  }
});

server.listen(port, host, async () => {
  console.log(`ReAct Agent Studio: http://${host}:${port}`);
  await loadCaptureConfig();
  try {
    await bridge.initialize();
  } catch (error) {
    status = {
      ...bridge.status,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
    broadcast("status", status);
  }
});

async function shutdown() {
  await bridge.close();
  await vite?.close();
  server.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
