import type { SceneCue, StudioEvent } from "../../shared/types.js";
import type { TimelineSnapshot } from "../replay/timeline-player.js";
import { personaFor, toolZone } from "../studio.js";

const WIDTH = 400;
const HEIGHT = 240;
const FRAME_SIZE = 96;
const ACTOR_SOURCE = { x: 18, y: 0, width: 60, height: 94 };
const ACTOR_WIDTH = 38;
const ACTOR_HEIGHT = 56;

type Point = { x: number; y: number };

const zones: Record<string, Point> = {
  center: { x: 200, y: 139 },
  terminal: { x: 48, y: 91 },
  archive: { x: 132, y: 91 },
  code: { x: 268, y: 91 },
  portal: { x: 352, y: 91 },
  todo: { x: 48, y: 215 },
  subagent: { x: 132, y: 215 },
  answer: { x: 268, y: 215 },
  generic: { x: 352, y: 215 },
};
const CENTER: Point = { x: 200, y: 139 };

function zonePoint(zone?: string) {
  return (zone && zones[zone]) || CENTER;
}

const stations = [
  { zone: "terminal", label: "SHELL", x: 48, y: 48, color: "#65e6a8" },
  { zone: "archive", label: "FILES", x: 132, y: 48, color: "#ffad7a" },
  { zone: "code", label: "CODE", x: 268, y: 48, color: "#56d7ff" },
  { zone: "portal", label: "WEB", x: 352, y: 48, color: "#b593ff" },
  { zone: "todo", label: "QUESTS", x: 48, y: 176, color: "#ffc857" },
  { zone: "subagent", label: "SPAWN", x: 132, y: 176, color: "#56d7ff" },
  { zone: "answer", label: "ANSWER", x: 268, y: 176, color: "#65e6a8" },
  { zone: "generic", label: "LAB", x: 352, y: 176, color: "#ffc857" },
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
    const room = this.canvas.parentElement;
    if (room && typeof ResizeObserver !== "undefined") {
      const resize = () => {
        const availableWidth = room.clientWidth;
        const availableHeight = room.clientHeight;
        const rawScale = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);
        const scale = rawScale >= 2 ? Math.max(1, Math.floor(rawScale)) : rawScale;
        this.canvas.style.width = `${Math.floor(WIDTH * scale)}px`;
        this.canvas.style.height = `${Math.floor(HEIGHT * scale)}px`;
      };
      new ResizeObserver(resize).observe(room);
      resize();
    }
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
    ctx.fillStyle = "#0d1821";
    ctx.fillRect(0, 0, WIDTH, 132);
    ctx.fillStyle = "#302723";
    ctx.fillRect(0, 132, WIDTH, HEIGHT - 132);
    ctx.fillStyle = "#081018";
    ctx.fillRect(0, 0, WIDTH, 9);
    ctx.fillStyle = "#1a2b36";
    ctx.fillRect(0, 9, WIDTH, 4);
    ctx.fillStyle = "rgba(86,215,255,.16)";
    for (let x = 16; x < WIDTH; x += 48) ctx.fillRect(x, 5, 18, 2);
    ctx.strokeStyle = "rgba(115,145,164,.16)";
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
    ctx.fillStyle = "rgba(7,13,18,.36)";
    ctx.fillRect(0, 123, WIDTH, 9);
    ctx.fillStyle = "#181f24";
    ctx.fillRect(0, 128, WIDTH, 4);
    ctx.strokeStyle = "rgba(255,200,87,.11)";
    for (let x = 8; x < WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(200, 132);
      ctx.lineTo(x, HEIGHT);
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
      if (active) {
        ctx.fillStyle = `${station.color}22`;
        ctx.fillRect(-32, -28, 64, 57);
        ctx.strokeStyle = station.color;
        ctx.strokeRect(-31.5, -27.5, 63, 56);
      }
      ctx.globalAlpha = active ? 1 : 0.92;
      ctx.fillStyle = "#314351";
      ctx.fillRect(-25, -16, 50, 29);
      ctx.fillStyle = "#0a1117";
      ctx.fillRect(-21, -12, 42, 21);
      ctx.fillStyle = active ? station.color : "#718494";
      if (station.zone === "portal") {
        ctx.fillRect(-13, -10, 26, 20);
        ctx.fillStyle = "#191334";
        ctx.fillRect(-9, -7, 18, 17);
        ctx.fillStyle = active ? "#d9caff" : "#6c5c99";
        ctx.fillRect(-5, -3, 10, 10);
      } else if (station.zone === "archive") {
        ctx.fillStyle = "#49372f";
        ctx.fillRect(-18, -9, 36, 17);
        for (let index = 0; index < 5; index += 1) {
          ctx.fillStyle = ["#e58d6d", "#63a9bb", "#a088d2", "#f1b879", "#69c58b"][index]!;
          ctx.fillRect(-15 + index * 7, -5 - (index % 2) * 3, 5, 12 + (index % 2) * 3);
        }
      } else if (station.zone === "todo") {
        ctx.fillStyle = "#c4a56d";
        ctx.fillRect(-16, -10, 32, 20);
        ctx.fillStyle = "#33291f";
        ctx.fillRect(-11, -5, 3, 3);
        ctx.fillRect(-11, 1, 3, 3);
        ctx.fillStyle = active ? "#65e6a8" : "#806e4e";
        ctx.fillRect(-5, -5, 14, 2);
        ctx.fillRect(-5, 1, 10, 2);
      } else if (station.zone === "subagent") {
        ctx.fillStyle = active ? "#17485f" : "#1b303d";
        ctx.fillRect(-15, -10, 30, 20);
        ctx.fillStyle = active ? station.color : "#547183";
        ctx.fillRect(-2, -7, 4, 14);
        ctx.fillRect(-7, -2, 14, 4);
      } else if (station.zone === "answer") {
        ctx.fillStyle = "#10251f";
        ctx.fillRect(-17, -9, 34, 17);
        ctx.fillStyle = active ? station.color : "#688378";
        ctx.fillRect(-11, -4, 22, 3);
        ctx.fillRect(-8, 2, 16, 3);
      } else if (station.zone === "generic") {
        ctx.fillStyle = "#202532";
        ctx.fillRect(-16, -10, 32, 19);
        ctx.fillStyle = active ? station.color : "#8c7d51";
        ctx.fillRect(-2, -7, 4, 4);
        ctx.fillRect(-5, -3, 10, 3);
        ctx.fillRect(-2, 2, 4, 4);
      } else if (station.zone === "code") {
        ctx.fillStyle = active ? "#153340" : "#172630";
        ctx.fillRect(-18, -9, 36, 17);
        ctx.fillStyle = "#65e6a8";
        ctx.fillRect(-13, -4, 10, 2);
        ctx.fillRect(-10, 1, 7, 2);
        ctx.fillStyle = "#ff6b76";
        ctx.fillRect(3, -4, 10, 2);
        ctx.fillRect(3, 1, 7, 2);
      } else {
        ctx.fillStyle = "#071912";
        ctx.fillRect(-18, -9, 36, 17);
        ctx.fillStyle = active ? station.color : "#547365";
        ctx.fillRect(-13, 2, 16, 2);
        ctx.fillRect(-13, -3, 8, 2);
      }
      ctx.fillStyle = "#0a0f14";
      ctx.fillRect(-29, 13, 58, 6);
      ctx.fillStyle = "#26333d";
      ctx.fillRect(-24, 19, 5, 5);
      ctx.fillRect(19, 19, 5, 5);
      ctx.fillStyle = active ? station.color : "#93a1ad";
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.fillText(station.label, 0, -22);
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
    if (cue.action === "diff-lines") {
      const visible = Math.max(1, Math.ceil(progress * 5));
      for (let index = 0; index < visible; index += 1) {
        ctx.fillStyle = index % 2 ? "#ff6b76" : "#65e6a8";
        ctx.fillRect(point.x - 17, point.y - 42 + index * 5, 7, 2);
        ctx.fillStyle = index % 2 ? "#553039" : "#285443";
        ctx.fillRect(point.x - 7, point.y - 42 + index * 5, 24 - index * 2, 2);
      }
    }
    if (cue.action === "update-board") {
      const count = Math.max(1, Math.ceil(progress * 3));
      for (let index = 0; index < count; index += 1) {
        ctx.fillStyle = ["#ffc857", "#65e6a8", "#56d7ff"][index]!;
        ctx.fillRect(point.x - 18 + index * 12, point.y - 43 + (index % 2) * 5, 10, 8);
        ctx.fillStyle = "#3a3020";
        ctx.fillRect(point.x - 16 + index * 12, point.y - 40 + (index % 2) * 5, 6, 1);
      }
    }
    if (cue.action === "lab-input") {
      ctx.fillStyle = "#8bdcff";
      ctx.fillRect(point.x - 5, point.y - 43, 10, 3);
      ctx.fillRect(point.x - 3, point.y - 40, 6, 7);
      ctx.fillStyle = progress > 0.5 ? "#ffc857" : "#b593ff";
      ctx.fillRect(point.x - 7, point.y - 34, 14, 8);
      ctx.fillRect(point.x - 5, point.y - 36, 10, 2);
    }
    if (cue.action === "seal-answer") {
      ctx.fillStyle = "#f3e8b2";
      ctx.fillRect(point.x - 15, point.y - 43, 30, 19);
      ctx.fillStyle = "#b44752";
      ctx.fillRect(point.x - 7, point.y - 36, 14, 7);
      ctx.fillStyle = "#f7c0c5";
      ctx.font = "bold 5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DONE", point.x, point.y - 31);
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
      const column = Math.floor(progress * 8) % 4;
      const row = point.x < CENTER.x ? 1 : 2;
      ctx.drawImage(
        this.sprite,
        column * FRAME_SIZE + ACTOR_SOURCE.x,
        row * FRAME_SIZE + ACTOR_SOURCE.y,
        ACTOR_SOURCE.width,
        ACTOR_SOURCE.height,
        Math.round(point.x - ACTOR_WIDTH / 2),
        Math.round(point.y - ACTOR_HEIGHT - bounce),
        ACTOR_WIDTH,
        ACTOR_HEIGHT,
      );
    } else if (this.actionSprite && cue) {
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
        column * FRAME_SIZE + ACTOR_SOURCE.x,
        row * FRAME_SIZE + ACTOR_SOURCE.y,
        ACTOR_SOURCE.width,
        ACTOR_SOURCE.height,
        Math.round(point.x - ACTOR_WIDTH / 2),
        Math.round(point.y - ACTOR_HEIGHT - bounce),
        ACTOR_WIDTH,
        ACTOR_HEIGHT,
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
    ctx.fillRect(point.x - 24, point.y + 3, 48, 11);
    ctx.fillStyle = persona.color;
    ctx.font = "bold 6px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${persona.glyph} ${persona.name}`, point.x, point.y + 11);
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
