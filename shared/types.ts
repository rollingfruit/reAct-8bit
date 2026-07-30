export type ReactPhase = "thought" | "action" | "observation" | "answer" | "system";
export type StudioStatus = "pending" | "running" | "success" | "error" | "complete";

export interface StudioEvent {
  id: string;
  sequence: number;
  timestamp: number;
  sessionId: string;
  messageId?: string;
  callId?: string;
  agentId: string;
  phase: ReactPhase;
  kind: string;
  status: StudioStatus;
  title: string;
  payload?: unknown;
}

export interface ModelContextSnapshot {
  id: string;
  sessionId: string;
  userMessageId: string;
  callIndex: number;
  capturedAt: number;
  model: { providerId: string; modelId: string; variant?: string };
  agent: string;
  system: string[];
  messages: unknown[];
  tools: Record<string, unknown>;
  params: Record<string, unknown>;
  redacted: true;
}

export type ContextFragment =
  | { kind: "message"; sessionId: string; userMessageId: string; message: unknown; parts: unknown[] }
  | { kind: "messages"; sessionId: string; messages: unknown[] }
  | { kind: "system"; sessionId: string; system: string[] }
  | { kind: "tool"; toolId: string; definition: unknown }
  | {
      kind: "params";
      sessionId: string;
      userMessageId: string;
      agent: string;
      model: { providerId: string; modelId: string; variant?: string };
      params: Record<string, unknown>;
    };

export interface OpenCodeSession {
  id: string;
  title: string;
  directory?: string;
  parentID?: string;
  agent?: string;
  model?: { id?: string; modelID?: string; providerID?: string; variant?: string };
  time?: { created?: number; updated?: number };
}

export interface StudioConnectionStatus {
  connected: boolean;
  managed: boolean;
  eventMode: "v2" | "legacy" | "offline";
  opencodeVersion?: string;
  pluginInstalled: boolean;
  platform: string;
  error?: string;
}
