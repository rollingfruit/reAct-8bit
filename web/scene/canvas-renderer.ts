import type { SceneCue, StudioEvent } from "../../shared/types.js";
import type { TimelineSnapshot } from "../replay/timeline-player.js";
import { personaFor, toolZone } from "../studio.js";

const WIDTH = 400;
const HEIGHT = 240;

type Point = { x: number; y: number };

const zones: Record<string, Point> = {
  center: { x: 200, y: 139 },
  terminal: { x: 49, y: 78 },
  archive: { x: 124, y: 65 },
  code: { x: 276, y: 65 },
  portal: { x: 350, y: 78 },
  todo: { x: 49, y: 205 },
  subagent: { x: 124, y: 205 },
  answer: { x: 276, y: 203 },
  generic: { x: 350, y: 205 },
};
const CENTER: Point = { x: 200, y: 139 };

function zonePoint(zone?: string) {
  return (zone && zones[zone]) || CENTER;
}

const stations = [
  { zone: "terminal", label: "SHELL", x: 49, y: 48, color: "#65e6a8" },
  { zone: "archive", label: "FILES", x: 124, y: 42, color: "#ffad7a" },
  { zone: "code", label: "CODE", x: 276, y: 42, color: "#56d7ff" },
  { zone: "portal", label: "WEB", x: 350, y: 48, color: "#b593ff" },
  { zone: "todo", label: "QUESTS", x: 49, y: 182, color: "#ffc857" },
  { zone: "subagent", label: "SPAWN", x: 124, y: 182, color: "#56d7ff" },
  { zone: "answer", label: "ANSWER", x: 276, y: 182, color: "#65e6a8" },
  { zone: "generic", label: "LAB", x: 350, y: 182, color: "#ffc857" },
] as const;

function ease(value: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export class CanvasSceneRenderer {
  private context: CanvasRenderingContext2D;
  private sprite?: HTMLImageElement;
  private actionSprite?: HTMLImageElement;
  private liveCue?: SceneCue;
  private liveStarted = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.context = this.canvas.getContext("2d", { alpha: false })!;
    this.context.imageSmoothingEnabled = false;
    const sprite = new Image();
    sprite.onload = () => {
      this.sprite = sprite;
    };
    sprite.src = "/assets/studio-v1/character/sheet-transparent.png";
    const actionSprite = new Image();
    actionSprite.onload = () => {
      this.actionSprite = actionSprite;
    };
    actionSprite.src = "/assets/studio-v1/actions/sheet-transparent.png";
    this.draw([], {
      status: "paused",
      time: 0,
      duration: 0,
      speed: 1,
      cueIndex: -1,
      progress: 0,
    });
  }

  draw(cues: SceneCue[], snapshot: TimelineSnapshot) {
    const cue = snapshot.cue ?? this.liveCue;
    const progress = snapshot.cue ? snapshot.progress : Math.min(1, (performance.now() - this.liveStarted) / 800);
    this.background(cue);
    this.drawStations(cue);
    this.drawProps(cue, progress);
    const position = this.actorPosition(cues, snapshot);
    this.drawActor(position, cue, progress);
    this.foreground(cue, progress);
  }

  showLive(event: StudioEvent) {
    const zone = event.phase === "action" || event.phase === "observation"
      ? toolZone(String((event.payload as any)?.tool ?? (event.payload as any)?.part?.tool ?? event.title))
      : event.phase === "answer"
        ? "answer"
        : "center";
    this.liveCue = {
      id: `live:${event.id}`,
      traceNodeIds: [event.id],
      evidence: "exact",
      track: "actor",
      phase: event.phase,
      action: event.phase === "action" ? "move" : event.phase === "observation" ? "result-arrive" : event.phase === "answer" ? "answer-type" : "reasoning-caption",
      start: 0,
      duration: 800,
      agentId: event.agentId,
      zone,
      caption: event.title,
      payload: event.payload,
    };
    this.liveStarted = performance.now();
    this.draw([], {
      status: "live",
      time: 0,
      duration: 800,
      speed: 1,
      cue: this.liveCue,
      cueIndex: 0,
      progress: 0,
    });
  }

  private background(cue?: SceneCue) {
    const ctx = this.context;
    ctx.fillStyle = "#101b24";
    ctx.fillRect(0, 0, WIDTH, 132);
    ctx.fillStyle = "#342925";
    ctx.fillRect(0, 132, WIDTH, HEIGHT - 132);
    ctx.strokeStyle = "rgba(115,145,164,.18)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
      ctx.stroke();
    }
    const glow = zonePoint(cue?.zone);
    const gradient = ctx.createRadialGradient(glow.x, glow.y, 3, glow.x, glow.y, 62);
    gradient.addColorStop(0, cue?.phase === "thought" ? "rgba(181,147,255,.18)" : "rgba(86,215,255,.16)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "#445362";
    ctx.strokeRect(1.5, 1.5, WIDTH - 3, HEIGHT - 3);
  }

  private drawStations(cue?: SceneCue) {
    const ctx = this.context;
    for (const station of stations) {
      const active = cue?.zone === station.zone;
      ctx.save();
      ctx.translate(station.x, station.y);
      ctx.fillStyle = active ? station.color : "#263541";
      ctx.globalAlpha = active ? 1 : 0.72;
      ctx.fillRect(-20, -13, 40, 24);
      ctx.fillStyle = "#081016";
      ctx.fillRect(-16, -9, 32, 16);
      ctx.fillStyle = active ? station.color : "#526371";
      if (station.zone === "portal") {
        ctx.fillRect(-7, -5, 14, 11);
        ctx.fillStyle = active ? "#d9caff" : "#465467";
        ctx.fillRect(-4, -2, 8, 7);
      } else if (station.zone === "archive") {
        for (let index = 0; index < 4; index += 1) {
          ctx.fillStyle = ["#e58d6d", "#63a9bb", "#a088d2", "#f1b879"][index]!;
          ctx.fillRect(-13 + index * 7, -4 - (index % 2) * 3, 5, 11 + (index % 2) * 3);
        }
      } else if (station.zone === "todo") {
        ctx.fillStyle = "#c4a56d";
        ctx.fillRect(-11, -7, 22, 14);
        ctx.fillStyle = "#33291f";
        ctx.fillRect(-7, -3, 3, 3);
        ctx.fillRect(-7, 2, 3, 3);
      } else {
        ctx.fillStyle = active ? station.color : "#60717d";
        ctx.fillRect(-8, -3, 16, 5);
      }
      ctx.fillStyle = "#0a0f14";
      ctx.fillRect(-23, 12, 46, 5);
      ctx.fillStyle = active ? station.color : "#93a1ad";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText(station.label, 0, -18);
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(86,215,255,.35)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.ellipse(CENTER.x, CENTER.y, 30, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(86,215,255,.55)";
    ctx.font = "5px monospace";
    ctx.textAlign = "center";
    ctx.fillText("THOUGHT", CENTER.x, CENTER.y + 29);
  }

  private drawProps(cue: SceneCue | undefined, progress: number) {
    if (!cue) return;
    const ctx = this.context;
    const point = zonePoint(cue.zone);
    const bob = Math.round(Math.sin(progress * Math.PI * 4) * 2);
    if (["message-arrive", "write-query-card", "send-query-card", "handoff-task"].includes(cue.action)) {
      const fromX = cue.action === "message-arrive" ? WIDTH + 20 : point.x - 12;
      const targetX = cue.action === "send-query-card" ? point.x + 14 : point.x;
      const x = fromX + (targetX - fromX) * ease(progress);
      const y = point.y - 31 + bob;
      ctx.fillStyle = "#f3e8b2";
      ctx.fillRect(x - 9, y - 6, 18, 12);
      ctx.strokeStyle = "#5f5134";
      ctx.strokeRect(x - 9.5, y - 6.5, 19, 13);
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 5);
      ctx.lineTo(x, y + 1);
      ctx.lineTo(x + 8, y - 5);
      ctx.stroke();
    }
    if (["pull-file", "open-code-file", "result-preview", "result-cards"].includes(cue.action)) {
      const count = cue.action === "result-cards" && Array.isArray(cue.payload) ? Math.min(3, cue.payload.length) : 1;
      for (let index = count - 1; index >= 0; index -= 1) {
        const offset = (count - index - 1) * 4;
        ctx.fillStyle = cue.action === "result-cards" ? "#d8f0ff" : "#f1ead1";
        ctx.fillRect(point.x - 12 + offset, point.y - 38 - offset + bob, 24, 17);
        ctx.strokeStyle = "#233442";
        ctx.strokeRect(point.x - 12.5 + offset, point.y - 38.5 - offset + bob, 25, 18);
        ctx.fillStyle = "#5f7c8f";
        ctx.fillRect(point.x - 8 + offset, point.y - 33 - offset + bob, 16, 2);
        ctx.fillRect(point.x - 8 + offset, point.y - 29 - offset + bob, 12, 2);
      }
    }
    if (cue.action === "terminal-type") {
      ctx.fillStyle = "#65e6a8";
      ctx.font = "5px monospace";
      ctx.textAlign = "left";
      const text = String(cue.caption ?? "").slice(0, Math.floor(String(cue.caption ?? "").length * progress));
      ctx.fillText(text.slice(0, 24), 24, 43);
    }
  }

  private actorPosition(cues: SceneCue[], snapshot: TimelineSnapshot) {
    let from = CENTER;
    let to = CENTER;
    for (let index = 0; index <= snapshot.cueIndex && index < cues.length; index += 1) {
      const cue = cues[index]!;
      if (cue.track === "actor" && cue.action === "move" && cue.zone && zones[cue.zone]) {
        from = to;
        to = zones[cue.zone]!;
      }
    }
    if (snapshot.cue?.action === "move") {
      const t = ease(snapshot.progress);
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    if (!cues.length && this.liveCue?.zone) return zonePoint(this.liveCue.zone);
    return to;
  }

  private drawActor(point: Point, cue: SceneCue | undefined, progress: number) {
    const ctx = this.context;
    const persona = personaFor(cue?.agentId ?? "build", cue?.sourceMessageId ?? "");
    const walking = cue?.action === "move";
    const bounce = walking ? (Math.floor(progress * 12) % 2) * 2 : cue?.phase === "thought" ? Math.round(Math.sin(progress * Math.PI * 2)) : 0;
    if (this.sprite && walking) {
      const cellWidth = this.sprite.width / 4;
      const cellHeight = this.sprite.height / 4;
      const column = Math.floor(progress * 8) % 4;
      const row = point.x < CENTER.x ? 1 : 2;
      ctx.drawImage(this.sprite, column * cellWidth, row * cellHeight, cellWidth, cellHeight, point.x - 10, point.y - 27 - bounce, 20, 28);
    } else if (this.actionSprite && cue) {
      const cellWidth = this.actionSprite.width / 4;
      const cellHeight = this.actionSprite.height / 4;
      const frame = Math.floor(progress * 8) % 4;
      let row = 3;
      let column = 0;
      if (cue.phase === "thought" || ["reasoning-caption", "context-load", "plan-card"].includes(cue.action)) {
        row = 0;
        column = frame;
      } else if (["terminal-type", "terminal-run", "diff-lines", "save-file", "todo-move"].includes(cue.action)) {
        row = 1;
        column = frame;
      } else if (["pull-file", "scan-pages", "result-preview", "result-cards", "scan-result", "open-code-file"].includes(cue.action)) {
        row = 2;
        column = frame;
      } else if (cue.action.includes("error")) {
        column = 3;
      } else if (cue.action.includes("success") || cue.action === "turn-complete") {
        column = 2;
      } else if (cue.phase === "answer" || cue.action === "answer-type") {
        column = 1;
      }
      ctx.drawImage(
        this.actionSprite,
        column * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight,
        point.x - 10,
        point.y - 27 - bounce,
        20,
        28,
      );
    } else {
      ctx.fillStyle = "#15181d";
      ctx.fillRect(Math.round(point.x - 7), Math.round(point.y - 24 - bounce), 14, 8);
      ctx.fillStyle = "#e4ad83";
      ctx.fillRect(Math.round(point.x - 6), Math.round(point.y - 19 - bounce), 12, 9);
      ctx.fillStyle = persona.color;
      ctx.fillRect(Math.round(point.x - 8), Math.round(point.y - 10 - bounce), 16, 11);
      ctx.fillStyle = persona.accent;
      ctx.fillRect(Math.round(point.x - 11), Math.round(point.y - 8 - bounce), 3, 9);
      ctx.fillRect(Math.round(point.x + 8), Math.round(point.y - 8 - bounce), 3, 9);
      ctx.fillStyle = "#263746";
      ctx.fillRect(Math.round(point.x - 6), Math.round(point.y + 1 - bounce), 5, 7);
      ctx.fillRect(Math.round(point.x + 1), Math.round(point.y + 1 - bounce), 5, 7);
      ctx.fillStyle = "#111";
      ctx.fillRect(Math.round(point.x - 3), Math.round(point.y - 16 - bounce), 2, 2);
      ctx.fillRect(Math.round(point.x + 2), Math.round(point.y - 16 - bounce), 2, 2);
    }
    ctx.fillStyle = "rgba(8,12,17,.86)";
    ctx.fillRect(point.x - 21, point.y + 10, 42, 10);
    ctx.fillStyle = persona.color;
    ctx.font = "5px monospace";
    ctx.textAlign = "center";
    ctx.fillText(persona.name, point.x, point.y + 17);
  }

  private foreground(cue: SceneCue | undefined, progress: number) {
    if (!cue) return;
    const ctx = this.context;
    const point = zonePoint(cue.zone);
    if (cue.action === "portal-charge" || cue.action === "context-load" || cue.action.startsWith("sparkle")) {
      const seed = hash(cue.id);
      ctx.fillStyle = cue.phase === "thought" ? "#b593ff" : "#56d7ff";
      for (let index = 0; index < 14; index += 1) {
        const angle = (seed % 100 + index * 137) * 0.1 + progress * 5;
        const radius = 9 + ((seed + index * 13) % 24) * progress;
        ctx.fillRect(Math.round(point.x + Math.cos(angle) * radius), Math.round(point.y - 14 + Math.sin(angle) * radius), 2, 2);
      }
    }
    if (cue.action === "result-arrive" || cue.action === "turn-complete") {
      ctx.strokeStyle = cue.action === "turn-complete" ? "#65e6a8" : "#ffc857";
      for (let index = 0; index < 4; index += 1) {
        const radius = progress * (10 + index * 7);
        ctx.strokeRect(point.x - radius, point.y - 16 - radius, radius * 2, radius * 2);
      }
    }
  }
}
