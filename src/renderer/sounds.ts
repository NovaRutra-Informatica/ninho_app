import type { AppState, Command } from "../shared/types";

export type SoundCue = "save" | "review" | "complete" | "focusDone";
type Tone = { frequency: number; delay: number; duration: number };
export const soundCues: Readonly<Record<SoundCue, readonly Tone[]>> = {
  save: [{ frequency: 523.25, delay: 0, duration: 0.12 }],
  review: [{ frequency: 587.33, delay: 0, duration: 0.18 }],
  complete: [
    { frequency: 523.25, delay: 0, duration: 0.2 },
    { frequency: 659.25, delay: 0.12, duration: 0.24 },
  ],
  focusDone: [
    { frequency: 440, delay: 0, duration: 0.32 },
    { frequency: 659.25, delay: 0.24, duration: 0.4 },
  ],
};
const priority: Record<SoundCue, number> = {
  save: 1,
  review: 2,
  complete: 3,
  focusDone: 4,
};
const changed = (before: unknown, after: unknown) =>
  JSON.stringify(before) !== JSON.stringify(after);
const item = <T extends { id: string }>(items: T[], id: string) =>
  items.find((entry) => entry.id === id);

export function soundAfterCommand(
  command: Command,
  before: AppState,
  after: AppState,
): SoundCue | null {
  if (!after.settings.sound) return null;
  switch (command.type) {
    case "settings.update":
    case "profile.save":
    case "profile.plan":
    case "profile.tutorial":
      return null;
    case "lesson.update": {
      const old = item(before.lessons, command.id);
      const next = item(after.lessons, command.id);
      if (!next || (old?.status === next.status && old?.notes === next.notes))
        return null;
      return next.status === "done" && old?.status !== "done"
        ? "complete"
        : "save";
    }
    case "card.review":
      return changed(
        item(before.cards, command.id),
        item(after.cards, command.id),
      )
        ? "review"
        : null;
    case "task.save": {
      const old = item(before.tasks, command.task.id);
      const next = item(after.tasks, command.task.id);
      if (!next || !changed(old, next)) return null;
      return next.completed && !old?.completed ? "complete" : "save";
    }
    case "exam.save": {
      const old = item(before.exams, command.exam.id);
      const next = item(after.exams, command.exam.id);
      if (!next || !changed(old, next)) return null;
      return next.completed && !old?.completed ? "complete" : "save";
    }
    case "session.add": {
      const next = item(after.sessions, command.session.id);
      return !item(before.sessions, command.session.id) &&
        next?.kind === "focus" &&
        next.durationMinutes > 0
        ? "focusDone"
        : null;
    }
    case "program.save":
      return changed(
        item(before.programs, command.program.id),
        item(after.programs, command.program.id),
      )
        ? "save"
        : null;
    case "subject.save":
      return changed(
        item(before.subjects, command.subject.id),
        item(after.subjects, command.subject.id),
      )
        ? "save"
        : null;
    case "course.save":
      return changed(
        item(before.courses, command.course.id),
        item(after.courses, command.course.id),
      )
        ? "save"
        : null;
    case "lesson.save":
      return changed(
        item(before.lessons, command.lesson.id),
        item(after.lessons, command.lesson.id),
      )
        ? "save"
        : null;
    case "card.save":
      return changed(
        item(before.cards, command.card.id),
        item(after.cards, command.card.id),
      )
        ? "save"
        : null;
    case "card.flag":
    case "card.suspend":
    case "card.delete":
      return changed(
        item(before.cards, command.id),
        item(after.cards, command.id),
      )
        ? "save"
        : null;
    case "exam.delete":
      return changed(
        item(before.exams, command.id),
        item(after.exams, command.id),
      )
        ? "save"
        : null;
    case "task.delete":
      return changed(
        item(before.tasks, command.id),
        item(after.tasks, command.id),
      )
        ? "save"
        : null;
    case "material.update":
    case "material.remove":
      return changed(
        item(before.materials, command.id),
        item(after.materials, command.id),
      )
        ? "save"
        : null;
  }
}

type Voice = { oscillator: OscillatorNode; gain: GainNode };
export class StudySoundPlayer {
  private context: AudioContext | null = null;
  private enabled = false;
  private generation = 0;
  private voices = new Set<Voice>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPlayed = -Infinity;
  private lastPriority = 0;
  constructor(
    private readonly createContext = () => new AudioContext(),
    private readonly now = () => Date.now(),
  ) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.lastPlayed = -Infinity;
      this.close();
    }
  }

  async play(cue: SoundCue): Promise<void> {
    if (!this.enabled) return;
    const time = this.now();
    if (time - this.lastPlayed < 220 && priority[cue] <= this.lastPriority)
      return;
    this.lastPlayed = time;
    this.lastPriority = priority[cue];
    const generation = ++this.generation;
    try {
      const context =
        this.context?.state !== "closed" && this.context
          ? this.context
          : (this.context = this.createContext());
      // Abandon a slow resume so it cannot retain audio resources or play a stale cue.
      this.scheduleClose(context, 2_000);
      if (context.state === "suspended") await context.resume();
      if (
        !this.enabled ||
        generation !== this.generation ||
        context !== this.context ||
        context.state !== "running"
      )
        return;
      this.stopVoices();
      const start = context.currentTime + 0.006;
      for (const tone of soundCues[cue]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const voice = { oscillator, gain };
        this.voices.add(voice);
        const at = start + tone.delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(tone.frequency, at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.022, at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          this.voices.delete(voice);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(at);
        oscillator.stop(at + tone.duration + 0.012);
      }
      this.scheduleClose(context, 1_800);
    } catch {
      // Audio errors must not reject a saved action.
      if (generation === this.generation) this.close();
    }
  }

  close() {
    this.generation++;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.stopVoices();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") {
      try {
        void context.close().catch(() => {});
      } catch {
      }
    }
  }

  private scheduleClose(context: AudioContext, delay: number) {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.context === context) this.close();
    }, delay);
  }

  private stopVoices() {
    for (const { oscillator, gain } of this.voices) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
      }
      try {
        oscillator.disconnect();
        gain.disconnect();
      } catch {
      }
    }
    this.voices.clear();
  }
}
