import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { OpenCodeSession, StudioConnectionStatus, StudioEvent } from "../shared/types.js";
import { EventNormalizer } from "./normalize.js";
import { createPlatformAdapter, type PlatformAdapter } from "./platform.js";

interface ConnectOptions {
  baseUrl?: string;
  username?: string;
  password?: string;
  directory?: string;
  managed?: boolean;
}

export class OpenCodeBridge {
  readonly platform: PlatformAdapter;
  private baseUrl: string;
  private username: string;
  private password: string;
  private directory: string;
  private managedPreferred: boolean;
  private managedProcess?: ChildProcess;
  private controller?: AbortController;
  private normalizer = new EventNormalizer();
  private reconnectAttempt = 0;
  private stopped = false;
  private statusValue: StudioConnectionStatus;

  onEvent?: (event: StudioEvent) => void;
  onStatus?: (status: StudioConnectionStatus) => void;

  constructor(options: ConnectOptions = {}) {
    this.platform = createPlatformAdapter();
    this.baseUrl = options.baseUrl ?? process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
    this.username = options.username ?? process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    this.password = options.password ?? process.env.OPENCODE_SERVER_PASSWORD ?? "";
    this.directory = options.directory ?? process.env.OPENCODE_DIRECTORY ?? process.cwd();
    this.managedPreferred =
      options.managed ??
      (process.env.OPENCODE_MANAGED === "1" || !process.env.OPENCODE_URL);
    this.statusValue = {
      connected: false,
      managed: false,
      eventMode: "offline",
      pluginInstalled: false,
      platform: this.platform.kind,
    };
  }

  get status() {
    return { ...this.statusValue };
  }

  get location() {
    return this.directory;
  }

  async initialize() {
    this.stopped = false;
    await this.ensureServer();
    void this.streamLoop();
  }

  async configure(options: ConnectOptions) {
    this.stopStream();
    if (this.managedProcess) {
      this.managedProcess.kill();
      this.managedProcess = undefined;
    }
    this.baseUrl = options.baseUrl ?? this.baseUrl;
    this.username = options.username ?? "opencode";
    this.password = options.password ?? "";
    this.directory = options.directory ?? this.directory;
    this.managedPreferred = options.managed ?? false;
    this.normalizer = new EventNormalizer();
    await this.initialize();
  }

  setPluginInstalled(installed: boolean) {
    this.updateStatus({ pluginInstalled: installed });
  }

  async listSessions(): Promise<OpenCodeSession[]> {
    return this.request<OpenCodeSession[]>("/session", { query: { directory: this.directory } });
  }

  async messages(sessionId: string): Promise<unknown[]> {
    return this.request(`/session/${encodeURIComponent(sessionId)}/message`, {
      query: { directory: this.directory },
    });
  }

  async createSession(title?: string): Promise<OpenCodeSession> {
    return this.request("/session", {
      method: "POST",
      query: { directory: this.directory },
      body: title ? { title } : {},
    });
  }

  async prompt(sessionId: string, text: string, agent?: string, messageId?: string): Promise<boolean> {
    await this.request(`/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      method: "POST",
      query: { directory: this.directory },
      body: {
        parts: [{ type: "text", text }],
        ...(agent ? { agent } : {}),
        ...(messageId ? { messageID: messageId } : {}),
      },
    });
    return true;
  }

  async abort(sessionId: string): Promise<boolean> {
    return this.request(`/session/${encodeURIComponent(sessionId)}/abort`, {
      method: "POST",
      query: { directory: this.directory },
    });
  }

  async close() {
    this.stopped = true;
    this.stopStream();
    if (this.managedProcess) {
      this.managedProcess.kill("SIGTERM");
      this.managedProcess = undefined;
    }
  }

  private stopStream() {
    this.controller?.abort();
    this.controller = undefined;
  }

  private async ensureServer() {
    const health = await this.tryHealth();
    if (health) {
      this.updateStatus({
        connected: true,
        managed: false,
        opencodeVersion: health.version,
        error: undefined,
      });
      return;
    }
    if (!this.managedPreferred) throw new Error(`无法连接 OpenCode：${this.baseUrl}`);

    const executable = await this.platform.findOpenCode();
    const url = new URL(this.baseUrl);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      throw new Error("Managed 模式只允许绑定 localhost。");
    }
    this.password ||= randomBytes(24).toString("hex");
    const args = [
      "serve",
      "--hostname",
      url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
      "--port",
      url.port || "4096",
    ];
    this.managedProcess = spawn(executable, args, {
      cwd: this.directory,
      env: { ...process.env, OPENCODE_SERVER_PASSWORD: this.password },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.managedProcess.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      if (/error|failed/i.test(text)) console.error(`[opencode] ${text.trim()}`);
    });
    this.managedProcess.once("exit", (code) => {
      if (!this.stopped) this.updateStatus({ connected: false, eventMode: "offline", error: `OpenCode 已退出 (${code ?? "signal"})` });
    });

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await delay(200);
      const started = await this.tryHealth();
      if (started) {
        this.updateStatus({
          connected: true,
          managed: true,
          opencodeVersion: started.version,
          error: undefined,
        });
        return;
      }
    }
    throw new Error("OpenCode Server 启动超时。");
  }

  private async tryHealth(): Promise<{ healthy: boolean; version?: string } | undefined> {
    try {
      const response = await fetch(new URL("/global/health", this.baseUrl), {
        headers: this.headers(),
        signal: AbortSignal.timeout(1_000),
      });
      if (!response.ok) return undefined;
      return (await response.json()) as { healthy: boolean; version?: string };
    } catch {
      return undefined;
    }
  }

  private async streamLoop() {
    while (!this.stopped) {
      try {
        const used = await this.connectStream();
        this.reconnectAttempt = 0;
        this.updateStatus({ connected: true, eventMode: used, error: undefined });
      } catch (error) {
        if (this.stopped || (error as Error).name === "AbortError") return;
        this.updateStatus({
          connected: false,
          eventMode: "offline",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      const wait = Math.min(10_000, 500 * 2 ** this.reconnectAttempt++);
      await delay(wait);
    }
  }

  private async connectStream(): Promise<"v2" | "legacy"> {
    this.controller = new AbortController();
    const v2 = new URL("/api/event", this.baseUrl);
    v2.searchParams.set("location[directory]", this.directory);
    let response = await fetch(v2, { headers: this.headers(), signal: this.controller.signal });
    let mode: "v2" | "legacy" = "v2";
    if (!response.ok) {
      const legacy = new URL("/event", this.baseUrl);
      legacy.searchParams.set("directory", this.directory);
      response = await fetch(legacy, { headers: this.headers(), signal: this.controller.signal });
      mode = "legacy";
    }
    if (!response.ok || !response.body) throw new Error(`SSE 连接失败 (${response.status})`);
    this.updateStatus({ connected: true, eventMode: mode, error: undefined });
    await this.consumeSse(response.body);
    return mode;
  }

  private async consumeSse(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        try {
          const event = this.normalizer.normalize(JSON.parse(data));
          if (event) this.onEvent?.(event);
        } catch {
          // Ignore malformed heartbeat/event frames and keep the stream alive.
        }
      }
    }
  }

  private headers(extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { Accept: "application/json", ...extra };
    if (this.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`;
    }
    return headers;
  }

  private async request<T>(
    pathname: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = new URL(pathname, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: this.headers(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenCode ${response.status}: ${detail.slice(0, 300)}`);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") return true as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : true) as T;
  }

  private updateStatus(patch: Partial<StudioConnectionStatus>) {
    this.statusValue = { ...this.statusValue, ...patch };
    this.onStatus?.(this.status);
  }
}
