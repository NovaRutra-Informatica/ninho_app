import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, Command } from "../shared/types";
import { soundAfterCommand, soundCues, StudySoundPlayer } from "./sounds";

const now = new Date("2026-09-14T16:00:00Z");
function fixture() {
  const state = createInitialState(now);
  state.settings.sound = true;
  return state;
}
function outcome(command: Command, before = fixture()) {
  return soundAfterCommand(command, before, applyCommand(before, command, now));
}
describe("sounds from persisted study actions", () => {
  it.each(["again", "hard", "good", "easy"] as const)(
    "acknowledges a %s review without judging the rating",
    (rating) => {
      const before = fixture();
      expect(
        outcome(
          { type: "card.review", id: before.cards[0].id, rating },
          before,
        ),
      ).toBe("review");
    },
  );
  it("recognizes lesson completion only on transition and notes as a save", () => {
    const before = fixture();
    const id = before.lessons[0].id;
    const command: Command = {
      type: "lesson.update",
      id,
      patch: { status: "done" },
    };
    const after = applyCommand(before, command, now);
    expect(soundAfterCommand(command, before, after)).toBe("complete");
    expect(outcome(command, after)).toBeNull();
    expect(
      outcome(
        { type: "lesson.update", id, patch: { notes: "Ler página 20" } },
        after,
      ),
    ).toBe("save");
    expect(
      outcome(
        { type: "lesson.update", id, patch: { status: "in-progress" } },
        after,
      ),
    ).toBe("save");
  });
  it("acknowledges task and exam completion only when their state changes", () => {
    const before = fixture();
    const task = {
      id: "sound-task",
      title: "Estudar",
      subjectId: "",
      date: "2026-09-14",
      completed: false,
    };
    const saved = applyCommand(before, { type: "task.save", task }, now);
    expect(
      outcome({ type: "task.save", task: { ...task, completed: true } }, saved),
    ).toBe("complete");
    expect(outcome({ type: "task.save", task }, saved)).toBeNull();
    const exam = {
      id: "sound-exam",
      title: "Prova",
      subjectId: "",
      date: "2026-10-01",
      time: "",
      location: "",
      notes: "",
      completed: false,
    };
    const planned = applyCommand(before, { type: "exam.save", exam }, now);
    expect(
      outcome(
        { type: "exam.save", exam: { ...exam, completed: true } },
        planned,
      ),
    ).toBe("complete");
    expect(
      outcome(
        { type: "exam.save", exam: { ...exam, notes: "Rever conteúdo" } },
        planned,
      ),
    ).toBe("save");
  });
  it("plays one focus cue for a newly saved session and none for duplicate/review time", () => {
    const before = fixture();
    const command: Command = {
      type: "session.add",
      session: {
        id: "sound-focus",
        subjectId: "",
        lessonId: "",
        durationMinutes: 2,
        completedAt: now.toISOString(),
        kind: "focus",
      },
    };
    const after = applyCommand(before, command, now);
    expect(soundAfterCommand(command, before, after)).toBe("focusDone");
    expect(() => applyCommand(after, command, now)).toThrow(
      "Esta sessão já foi registrada",
    );
    expect(
      soundAfterCommand(command, after, structuredClone(after)),
    ).toBeNull();
    expect(
      outcome(
        { ...command, session: { ...command.session, kind: "review" } },
        before,
      ),
    ).toBeNull();
    expect(
      outcome(
        { ...command, session: { ...command.session, durationMinutes: 0 } },
        before,
      ),
    ).toBeNull();
  });
  it("respects saved sound preference including enabling and disabling it", () => {
    const before = fixture();
    expect(
      outcome({ type: "settings.update", patch: { sound: false } }, before),
    ).toBeNull();
    before.settings.sound = false;
    expect(
      outcome({ type: "settings.update", patch: { sound: true } }, before),
    ).toBe("save");
    expect(
      outcome(
        {
          type: "lesson.update",
          id: before.lessons[0].id,
          patch: { status: "done" },
        },
        before,
      ),
    ).toBeNull();
  });
  it("recognizes saved edits and remains silent for unchanged metadata", () => {
    const before = fixture();
    const {
      status: _status,
      updatedAt: _updatedAt,
      notes: _notes,
      ...lesson
    } = before.lessons[0];
    const { id, subjectId, lessonId, question, answer, source, sourceUrl } =
      before.cards[0];
    const cases: Command[] = [
      {
        type: "program.save",
        program: { ...before.programs[0], name: "Meu concurso" },
      },
      {
        type: "subject.save",
        subject: { ...before.subjects[0], name: "Matéria revisada" },
      },
      {
        type: "course.save",
        course: { ...before.courses[0], title: "Módulo revisado" },
      },
      { type: "lesson.save", lesson: { ...lesson, title: "Aula revisada" } },
      {
        type: "card.save",
        card: {
          id,
          subjectId,
          lessonId,
          question: `${question} Revisada?`,
          answer,
          source,
          sourceUrl,
        },
      },
      { type: "card.flag", id: before.cards[0].id, flag: "outdated" },
      { type: "card.suspend", id: before.cards[0].id, suspended: true },
      { type: "card.delete", id: before.cards[0].id },
    ];
    for (const command of cases) {
      expect(outcome(command, before)).toBe("save");
      expect(
        soundAfterCommand(command, before, structuredClone(before)),
      ).toBeNull();
    }
  });
  it("acknowledges successful material and agenda changes", () => {
    const before = fixture();
    before.materials = [
      {
        id: "sound-material",
        name: "Resumo.txt",
        type: "txt",
        storedName: "ba2c552e-395c-4501-853b-b2b85a042df7.txt",
        size: 20,
        createdAt: now.toISOString(),
        subjectId: "",
        lessonId: "",
        notes: "",
      },
    ];
    before.tasks = [
      {
        id: "sound-task",
        title: "Ler",
        subjectId: "",
        date: "2026-09-14",
        completed: false,
      },
    ];
    before.exams = [
      {
        id: "sound-exam",
        title: "Prova",
        subjectId: "",
        date: "2026-10-01",
        time: "",
        location: "",
        notes: "",
        completed: false,
      },
    ];
    for (const command of [
      {
        type: "material.update",
        id: "sound-material",
        patch: { notes: "Retomar leitura" },
      },
      { type: "material.remove", id: "sound-material" },
      { type: "task.delete", id: "sound-task" },
      { type: "exam.delete", id: "sound-exam" },
    ] satisfies Command[])
      expect(outcome(command, before)).toBe("save");
  });
});

function parameter() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}
function fakeContext(initial: AudioContextState = "running") {
  const oscillators: {
    frequency: ReturnType<typeof parameter>;
    type: string;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const gains: {
    gain: ReturnType<typeof parameter>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    state: initial,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: "sine",
        frequency: parameter(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  return {
    context,
    oscillators,
    gains,
    asAudio: () => context as unknown as AudioContext,
  };
}
describe("optional synthesized audio lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("creates nothing at startup or when sounds are disabled", async () => {
    const create = vi.fn(() => fakeContext().asAudio());
    const player = new StudySoundPlayer(create);
    await player.play("save");
    player.setEnabled(true);
    expect(create).not.toHaveBeenCalled();
    player.setEnabled(false);
    await player.play("focusDone");
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["save", "review", "complete", "focusDone"] as const)(
    "schedules %s as brief pitched notes with gentle envelope",
    async (cue) => {
      const fake = fakeContext();
      const player = new StudySoundPlayer(fake.asAudio);
      player.setEnabled(true);
      await player.play(cue);
      expect(fake.oscillators.length).toBeGreaterThanOrEqual(2);
      expect(fake.oscillators.length).toBeLessThanOrEqual(3);
      for (const [index, oscillator] of fake.oscillators.entries()) {
        const gain = fake.gains[index];
        expect(oscillator.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(fake.context.destination);
        expect(gain.gain.setValueAtTime.mock.calls[0][0]).toBe(0);
        expect(gain.gain.linearRampToValueAtTime.mock.calls[0][0]).toBeLessThan(
          0.1,
        );
        expect(
          gain.gain.exponentialRampToValueAtTime.mock.calls[0][0],
        ).toBeGreaterThan(0);
        expect(oscillator.stop.mock.calls[0][0]).toBeLessThan(
          fake.context.currentTime + 0.55,
        );
        oscillator.onended?.();
        expect(oscillator.disconnect).toHaveBeenCalledOnce();
        expect(gain.disconnect).toHaveBeenCalledOnce();
      }
      await vi.advanceTimersByTimeAsync(1800);
      expect(fake.context.close).toHaveBeenCalledOnce();
    },
  );
  it("uses distinct short melodies for the four events", () => {
    const signatures = Object.values(soundCues).map((tones) =>
      JSON.stringify(tones),
    );
    expect(new Set(signatures).size).toBe(4);
  });
  it("limits spam and lets important completion replace a smaller cue", async () => {
    const fake = fakeContext();
    const player = new StudySoundPlayer(fake.asAudio);
    player.setEnabled(true);
    await player.play("save");
    await player.play("save");
    expect(fake.oscillators).toHaveLength(2);
    await player.play("focusDone");
    expect(fake.oscillators).toHaveLength(5);
    expect(fake.oscillators[0].stop).toHaveBeenCalledTimes(2);
    await player.play("review");
    expect(fake.oscillators).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(250);
    await player.play("review");
    expect(fake.oscillators).toHaveLength(7);
    player.close();
  });
  it("reuses the live context, closes after idle, and lazily creates a new one", async () => {
    const contexts: ReturnType<typeof fakeContext>[] = [];
    const player = new StudySoundPlayer(() => {
      const next = fakeContext();
      contexts.push(next);
      return next.asAudio();
    });
    player.setEnabled(true);
    await player.play("save");
    await vi.advanceTimersByTimeAsync(1_000);
    await player.play("review");
    expect(contexts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(contexts[0].context.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(contexts[0].context.close).toHaveBeenCalledOnce();
    await player.play("save");
    expect(contexts).toHaveLength(2);
    player.close();
  });
  it("muting stops all voices and invalidates an outstanding resume", async () => {
    const fake = fakeContext("suspended");
    let resume!: () => void;
    fake.context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = () => {
            fake.context.state = "running";
            resolve();
          };
        }),
    );
    const player = new StudySoundPlayer(fake.asAudio);
    player.setEnabled(true);
    const pending = player.play("complete");
    player.setEnabled(false);
    resume();
    await pending;
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(fake.oscillators).toHaveLength(0);
  });
  it("abandons a blocked resume after two seconds without a late surprise sound", async () => {
    const fake = fakeContext("suspended");
    let resume!: () => void;
    fake.context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = () => {
            fake.context.state = "running";
            resolve();
          };
        }),
    );
    const player = new StudySoundPlayer(fake.asAudio);
    player.setEnabled(true);
    const pending = player.play("save");
    await vi.advanceTimersByTimeAsync(2_000);
    resume();
    await pending;
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(fake.oscillators).toHaveLength(0);
  });
  it("closes active voices immediately on mute or component teardown", async () => {
    const fake = fakeContext();
    const player = new StudySoundPlayer(fake.asAudio);
    player.setEnabled(true);
    await player.play("focusDone");
    player.setEnabled(false);
    expect(fake.context.close).toHaveBeenCalledOnce();
    for (const oscillator of fake.oscillators) {
      expect(oscillator.stop).toHaveBeenCalledTimes(2);
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
    }
    player.close();
    expect(fake.context.close).toHaveBeenCalledOnce();
  });
  it("swallows unavailable hardware, failed resume, and node/close errors", async () => {
    const unavailable = new StudySoundPlayer(() => {
      throw new Error("No audio device");
    });
    unavailable.setEnabled(true);
    await expect(unavailable.play("save")).resolves.toBeUndefined();
    const fake = fakeContext("suspended");
    fake.context.resume.mockRejectedValue(new Error("Denied"));
    fake.context.close.mockRejectedValue(new Error("Already gone"));
    const player = new StudySoundPlayer(fake.asAudio);
    player.setEnabled(true);
    await expect(player.play("save")).resolves.toBeUndefined();
    expect(fake.context.close).toHaveBeenCalledOnce();
    const broken = fakeContext();
    broken.context.createOscillator.mockImplementation(() => {
      throw new Error("Device lost");
    });
    const another = new StudySoundPlayer(broken.asAudio);
    another.setEnabled(true);
    await expect(another.play("review")).resolves.toBeUndefined();
    expect(broken.context.close).toHaveBeenCalledOnce();
  });
});
