import type { StudioEvent } from "../shared/types.js";

export interface Persona {
  id: string;
  name: string;
  role: string;
  color: string;
  accent: string;
  speed: number;
  glyph: string;
}

const palettes = [
  ["#4fc3f7", "#1565c0"],
  ["#ffb74d", "#ef6c00"],
  ["#81c784", "#2e7d32"],
  ["#f06292", "#ad1457"],
  ["#9575cd", "#512da8"],
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function personaFor(agentId: string, sessionId = ""): Persona {
  const normalized = agentId.toLowerCase();
  if (normalized.includes("plan")) {
    return { id: agentId, name: "紫苑", role: "策略家", color: "#a78bfa", accent: "#5b21b6", speed: 0.105, glyph: "◆" };
  }
  if (normalized.includes("explore") || normalized.includes("research")) {
    return { id: agentId, name: "苔原", role: "侦察员", color: "#5ee09b", accent: "#087f5b", speed: 0.16, glyph: "⌁" };
  }
  if (normalized.includes("build") || normalized === "default") {
    return { id: agentId, name: "阿蓝", role: "工匠", color: "#55c2ff", accent: "#1565c0", speed: 0.135, glyph: "✦" };
  }
  const index = hash(`${agentId}:${sessionId}`) % palettes.length;
  const palette = palettes[index]!;
  return {
    id: agentId,
    name: `单元 ${String(hash(agentId) % 100).padStart(2, "0")}`,
    role: "自由 Agent",
    color: palette[0],
    accent: palette[1],
    speed: 0.11 + (hash(sessionId || agentId) % 5) * 0.01,
    glyph: ["●", "▲", "■", "✦", "◇"][index]!,
  };
}

export type ZoneId = "center" | "terminal" | "archive" | "code" | "portal" | "todo" | "subagent" | "generic" | "answer";

export function toolZone(tool: string): ZoneId {
  const value = tool.toLowerCase();
  if (value.includes("bash") || value.includes("shell") || value.includes("terminal")) return "terminal";
  if (/(read|glob|grep|search_file|list)/.test(value)) return "archive";
  if (/(todo|plan_update)/.test(value)) return "todo";
  if (/(edit|write|patch|apply)/.test(value)) return "code";
  if (/(web|browser|fetch|url|navigate)/.test(value)) return "portal";
  if (/(task|agent|subagent)/.test(value)) return "subagent";
  return "generic";
}

export interface CharacterRenderer {
  ensure(key: string, persona: Persona, clone?: boolean): HTMLElement;
  move(key: string, zone: ZoneId, state: string, speedMultiplier?: number): Promise<void>;
  state(key: string, state: string, label?: string): void;
  retire(key: string): void;
  clear(): void;
}

interface Actor {
  element: HTMLElement;
  x: number;
  y: number;
  persona: Persona;
  animation?: number;
  resolveMove?: () => void;
}

export class CssCharacterRenderer implements CharacterRenderer {
  private actors = new Map<string, Actor>();

  constructor(
    private room: HTMLElement,
    private layer: HTMLElement,
  ) {}

  ensure(key: string, persona: Persona, clone = false) {
    const existing = this.actors.get(key);
    if (existing) return existing.element;

    const element = document.createElement("div");
    element.className = `agent actor-idle${clone ? " actor-clone" : ""}`;
    element.style.setProperty("--agent-color", persona.color);
    element.style.setProperty("--agent-accent", persona.accent);
    element.innerHTML = `
      <div class="agent-bubble"></div>
      <div class="pixel-person">
        <div class="agent-hair"></div>
        <div class="agent-head"><i></i><i></i></div>
        <div class="agent-body"><b>${persona.glyph}</b></div>
        <div class="agent-legs"><i></i><i></i></div>
      </div>
      <div class="agent-tag"><strong>${persona.name}</strong><span>${persona.role}</span></div>
    `;
    this.layer.append(element);
    const start = this.zonePoint("center");
    const actor = { element, x: start.x, y: start.y, persona };
    this.actors.set(key, actor);
    this.position(actor);
    requestAnimationFrame(() => element.classList.add("actor-visible"));
    return element;
  }

  async move(key: string, zone: ZoneId, state: string, speedMultiplier = 1) {
    const actor = this.actors.get(key);
    if (!actor) return;
    if (actor.animation) {
      cancelAnimationFrame(actor.animation);
      actor.animation = undefined;
      actor.resolveMove?.();
      actor.resolveMove = undefined;
    }
    const target = this.zonePoint(zone);
    actor.element.className = this.classes(actor.element, "walk");
    const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
    if (distance < 3) {
      this.state(key, state);
      return;
    }
    const started = performance.now();
    const origin = { x: actor.x, y: actor.y };
    const duration = Math.max(220, distance / actor.persona.speed / speedMultiplier);
    await new Promise<void>((resolve) => {
      actor.resolveMove = resolve;
      const frame = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        actor.x = origin.x + (target.x - origin.x) * eased;
        actor.y = origin.y + (target.y - origin.y) * eased;
        actor.element.classList.toggle("face-left", target.x < origin.x);
        this.position(actor);
        if (t < 1) actor.animation = requestAnimationFrame(frame);
        else {
          actor.animation = undefined;
          actor.resolveMove = undefined;
          this.state(key, state);
          resolve();
        }
      };
      actor.animation = requestAnimationFrame(frame);
    });
  }

  state(key: string, state: string, label?: string) {
    const actor = this.actors.get(key);
    if (!actor) return;
    actor.element.className = this.classes(actor.element, state);
    const bubble = actor.element.querySelector<HTMLElement>(".agent-bubble");
    if (bubble) {
      bubble.textContent = label ?? "";
      bubble.classList.toggle("show", Boolean(label));
    }
  }

  retire(key: string) {
    const actor = this.actors.get(key);
    if (!actor) return;
    if (actor.animation) cancelAnimationFrame(actor.animation);
    actor.resolveMove?.();
    actor.element.classList.add("actor-retire");
    setTimeout(() => actor.element.remove(), 350);
    this.actors.delete(key);
  }

  clear() {
    for (const actor of this.actors.values()) {
      if (actor.animation) cancelAnimationFrame(actor.animation);
      actor.resolveMove?.();
      actor.element.remove();
    }
    this.actors.clear();
  }

  private classes(element: HTMLElement, state: string) {
    return [...element.classList]
      .filter((name) => !name.startsWith("actor-") || name === "actor-visible")
      .concat(`actor-${state}`)
      .join(" ");
  }

  private zonePoint(zone: ZoneId) {
    const target = this.room.querySelector<HTMLElement>(`[data-zone="${zone}"]`) ??
      this.room.querySelector<HTMLElement>('[data-zone="generic"]')!;
    const roomRect = this.room.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left - roomRect.left + rect.width / 2,
      y: rect.top - roomRect.top + rect.height - 14,
    };
  }

  private position(actor: Actor) {
    actor.element.style.transform = `translate3d(${actor.x - 22}px, ${actor.y - 70}px, 0)`;
    actor.element.style.zIndex = String(10 + Math.round(actor.y));
  }
}

function toolFrom(event: StudioEvent) {
  const payload = event.payload as any;
  return String(payload?.tool ?? payload?.part?.tool ?? event.title ?? "tool");
}

export class ActionDirector {
  private queues = new Map<string, Promise<void>>();
  private generation = 0;
  private replaying = false;

  constructor(private renderer: CharacterRenderer) {}

  handle(event: StudioEvent) {
    if (this.replaying) return;
    const actorKey = `${event.sessionId}:${event.agentId}`;
    const persona = personaFor(event.agentId, event.sessionId);
    this.renderer.ensure(actorKey, persona);
    this.enqueue(actorKey, () => this.perform(actorKey, event, false));
  }

  async replay(events: StudioEvent[], onStep?: (event: StudioEvent, index: number, total: number) => void) {
    this.reset();
    this.replaying = true;
    const generation = this.generation;
    try {
      for (let index = 0; index < events.length; index += 1) {
        if (generation !== this.generation) return;
        const event = events[index]!;
        const actorKey = `${event.sessionId}:${event.agentId}`;
        this.renderer.ensure(actorKey, personaFor(event.agentId, event.sessionId));
        onStep?.(event, index, events.length);
        await this.perform(actorKey, event, true);
        const next = events[index + 1];
        if (next) {
          const compressedGap = Math.max(90, Math.min(650, (next.timestamp - event.timestamp) * 0.08));
          await this.wait(compressedGap);
        }
      }
    } finally {
      if (generation === this.generation) this.replaying = false;
    }
  }

  reset() {
    this.generation += 1;
    this.replaying = false;
    this.queues.clear();
    this.renderer.clear();
  }

  private async perform(actorKey: string, event: StudioEvent, replay: boolean) {
    const speed = replay ? 2.8 : 1;
    if (event.phase === "thought") {
      await this.renderer.move(actorKey, "center", "think", speed);
      this.renderer.state(actorKey, event.status === "complete" ? "idle" : "think", event.status === "running" ? "THINK…" : "");
      return;
    }
    if (event.phase === "action") {
      const tool = toolFrom(event);
      await this.renderer.move(actorKey, toolZone(tool), "work", speed);
      this.renderer.state(actorKey, "work", tool.toUpperCase());
      await this.wait(replay ? 180 : 320);
      return;
    }
    if (event.phase === "observation") {
      this.renderer.state(actorKey, event.status === "error" ? "error" : "success", event.status === "error" ? "ERR!" : "OK!");
      await this.wait(replay ? 350 : 650);
      return;
    }
    if (event.phase === "answer") {
      await this.renderer.move(actorKey, "answer", "speak", speed);
      this.renderer.state(actorKey, event.status === "complete" ? "idle" : "speak", event.status === "running" ? "…" : "");
      return;
    }
    if (event.status === "error") this.renderer.state(actorKey, "error", "ERR!");
    else if (event.status === "complete") await this.renderer.move(actorKey, "center", "idle", speed);
  }

  private enqueue(key: string, work: () => Promise<void>) {
    const generation = this.generation;
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation) return;
        await work();
      })
      .catch(() => undefined);
    this.queues.set(key, next);
    void next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    });
  }

  private wait(duration: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, duration));
  }
}
