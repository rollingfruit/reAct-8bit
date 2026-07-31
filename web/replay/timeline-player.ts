import type { PlaybackStatus, SceneCue } from "../../shared/types.js";

type FrameHandle = number | ReturnType<typeof setTimeout>;

export interface TimelineSnapshot {
  status: PlaybackStatus;
  time: number;
  duration: number;
  speed: number;
  cue?: SceneCue;
  cueIndex: number;
  progress: number;
}

export class TimelinePlayer {
  private cues: SceneCue[] = [];
  private status: PlaybackStatus = "paused";
  private time = 0;
  private speed = 1;
  private frame?: FrameHandle;
  private lastNow = 0;

  constructor(private onUpdate: (snapshot: TimelineSnapshot) => void) {}

  setCues(cues: SceneCue[], initialCueId?: string) {
    this.pause();
    this.cues = [...cues];
    this.time = 0;
    if (initialCueId) {
      const cue = this.cues.find((item) => item.id === initialCueId);
      if (cue) this.time = cue.start;
    }
    this.status = "paused";
    this.emit();
  }

  play() {
    if (!this.cues.length) return;
    if (this.time >= this.duration) this.time = 0;
    this.status = "playing";
    this.lastNow = this.now();
    this.schedule();
    this.emit();
  }

  pause() {
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
    if (this.status === "playing" || this.status === "live") this.status = "paused";
    this.emit();
  }

  toggle() {
    if (this.status === "playing") this.pause();
    else this.play();
  }

  seek(time: number) {
    const wasPlaying = this.status === "playing";
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
    this.status = "seeking";
    this.time = Math.max(0, Math.min(this.duration, time));
    this.emit();
    this.status = wasPlaying ? "playing" : "paused";
    if (wasPlaying) {
      this.lastNow = this.now();
      this.schedule();
    }
    this.emit();
  }

  step(direction: -1 | 1) {
    if (!this.cues.length) return;
    const current = this.cueIndex;
    const target = Math.max(0, Math.min(this.cues.length - 1, current + direction));
    this.pause();
    this.time = this.cues[target]!.start;
    this.emit();
  }

  setSpeed(speed: number) {
    this.speed = [0.5, 1, 2].includes(speed) ? speed : 1;
    this.emit();
  }

  get duration() {
    const last = this.cues.at(-1);
    return last ? last.start + last.duration : 0;
  }

  get cueIndex() {
    if (!this.cues.length) return -1;
    for (let index = this.cues.length - 1; index >= 0; index -= 1) {
      if (this.time >= this.cues[index]!.start) return index;
    }
    return 0;
  }

  get snapshot(): TimelineSnapshot {
    const cueIndex = this.cueIndex;
    const cue = cueIndex >= 0 ? this.cues[cueIndex] : undefined;
    return {
      status: this.status,
      time: this.time,
      duration: this.duration,
      speed: this.speed,
      cue,
      cueIndex,
      progress: cue ? Math.max(0, Math.min(1, (this.time - cue.start) / cue.duration)) : 0,
    };
  }

  dispose() {
    this.pause();
    this.cues = [];
  }

  private tick = () => {
    if (this.status !== "playing") return;
    const now = this.now();
    this.time += (now - this.lastNow) * this.speed;
    this.lastNow = now;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.status = "completed";
      this.frame = undefined;
      this.emit();
      return;
    }
    this.emit();
    this.schedule();
  };

  private emit() {
    this.onUpdate(this.snapshot);
  }

  private schedule() {
    this.frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(this.tick)
      : setTimeout(() => this.tick(), 16);
  }

  private cancel(handle: FrameHandle) {
    if (typeof cancelAnimationFrame === "function" && typeof handle === "number") cancelAnimationFrame(handle);
    else clearTimeout(handle as ReturnType<typeof setTimeout>);
  }

  private now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }
}

