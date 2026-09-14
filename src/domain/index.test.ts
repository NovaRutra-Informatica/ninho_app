import { afterEach, describe, expect, it } from "vitest";
import {
  applyCommand,
  createInitialState,
  getDashboardStats,
  getDueCards,
  localDate,
  validateState,
} from "./index";
import type {
  AppState,
  Command,
  Exam,
  Material,
  ReviewCard,
  StudySession,
  StudyTask,
} from "../shared/types";

const now = new Date("2026-09-14T16:00:00.000Z");
const tomorrow = new Date("2026-09-15T16:00:00.000Z");
const state = () => createInitialState(now);
const empty = () => ({ ...state(), cards: [] });
const subjectId = "banco-de-dados";
const lessonId = "240830:aula:00";
const cardContent = (id = "test-card") => ({
  id,
  subjectId,
  lessonId,
  question: "O que é uma transação?",
  answer: "Uma unidade lógica de trabalho.",
  source: "Anotação de estudo",
  sourceUrl: "",
});
const oneCard = () =>
  applyCommand(empty(), { type: "card.save", card: cardContent() }, now);
const exam = (patch: Partial<Exam> = {}): Exam => ({
  id: "exam-1",
  title: "Prova de algoritmos",
  subjectId: "ciencia-da-computacao",
  date: "2026-09-20",
  time: "19:00",
  location: "Mauá",
  notes: "",
  completed: false,
  ...patch,
});
const task = (patch: Partial<StudyTask> = {}): StudyTask => ({
  id: "task-1",
  title: "Ler uma aula",
  subjectId,
  date: "2026-09-14",
  completed: false,
  ...patch,
});
const session = (patch: Partial<StudySession> = {}): StudySession => ({
  id: "session-1",
  subjectId,
  lessonId,
  durationMinutes: 25,
  completedAt: now.toISOString(),
  kind: "focus",
  ...patch,
});
const material = (patch: Partial<Material> = {}): Material => ({
  id: "material-1",
  name: "Aula.pdf",
  storedName: "fdc5b413-3a60-4b44-8e99-8506ff054d75.pdf",
  type: "pdf",
  size: 1024,
  subjectId,
  lessonId,
  createdAt: now.toISOString(),
  notes: "",
  ...patch,
});
const command = (input: unknown) => input as Command;

describe("seed and validation", () => {
  it("loads every mapped subject, course and lesson without fabricating activity", () => {
    const initial = state();
    expect(initial.subjects).toHaveLength(15);
    expect(
      initial.subjects.filter((subject) => subject.track === "concurso"),
    ).toHaveLength(14);
    expect(
      initial.subjects.find((subject) => subject.id === "ciencia-da-computacao")
        ?.track,
    ).toBe("faculdade");
    expect(initial.courses).toHaveLength(20);
    expect(initial.lessons).toHaveLength(271);
    expect(initial.cards).toHaveLength(71);
    expect(
      initial.cards.filter((card) => card.subjectId === "literatura"),
    ).toHaveLength(46);
    expect(
      initial.cards.filter((card) => card.subjectId === "banco-de-dados"),
    ).toHaveLength(25);
    expect(
      initial.lessons.every(
        (lesson) =>
          lesson.status === "not-started" && !lesson.updatedAt && !lesson.notes,
      ),
    ).toBe(true);
    expect(
      initial.cards.every(
        (card) =>
          !card.lastReviewedAt &&
          card.repetitions === 0 &&
          card.dueAt === now.toISOString(),
      ),
    ).toBe(true);
    expect([
      initial.exams,
      initial.tasks,
      initial.materials,
      initial.sessions,
    ]).toEqual([[], [], [], []]);
    expect(initial.settings).toMatchObject({
      name: "Alessandro",
      dailyMinutes: 30,
      newCardsPerDay: 5,
      focusMinutes: 25,
      breakMinutes: 5,
      theme: "light",
    });
  });
  it("preserves safe original sources and normalizes Portuguese course references", () => {
    const initial = state();
    expect(
      initial.cards.every(
        (card) =>
          card.source.includes("Estratégia Concursos") &&
          card.source.includes("PDF p.") &&
          card.sourceUrl.startsWith("https://www.estrategiaconcursos.com.br/"),
      ),
    ).toBe(true);
    expect(
      initial.cards.every(
        (card) => !/<\/?(?:b|script|div|span|br)\b/i.test(card.answer),
      ),
    ).toBe(true);
    expect(
      initial.courses.find((course) => course.id === "241078")?.subjectId,
    ).toBe("lingua-portuguesa-e-redacao");
    expect(new Set(initial.lessons.map((lesson) => lesson.url)).size).toBe(271);
  });
  it("roundtrips JSON and isolates copies from each other", () => {
    const a = state();
    const b = state();
    expect(validateState(JSON.parse(JSON.stringify(a)))).toEqual(a);
    a.settings.name = "Other";
    a.cards[0].answer = "Changed";
    expect(b.settings.name).toBe("Alessandro");
    expect(b.cards[0].answer).not.toBe("Changed");
    const clone = validateState(b);
    clone.settings.name = "Clone";
    expect(b.settings.name).toBe("Alessandro");
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { ...state(), version: 2 },
    { ...state(), injected: true },
  ])("rejects malformed or unknown state %j", (input) => {
    expect(() => validateState(input)).toThrow();
  });
  it.each([
    "subjects",
    "courses",
    "lessons",
    "cards",
    "exams",
    "tasks",
    "materials",
    "sessions",
  ] as const)("rejects duplicated %s IDs", (key) => {
    const initial = {
      ...state(),
      exams: [exam()],
      tasks: [task()],
      materials: [material()],
      sessions: [session()],
    };
    (initial[key] as unknown[]).push(initial[key][0]);
    expect(() => validateState(initial)).toThrow(/duplicados/);
  });
  it.each([
    "courses",
    "lessons",
    "cards",
    "exams",
    "tasks",
    "materials",
    "sessions",
  ] as const)("rejects missing subject in %s", (key) => {
    const initial = {
      ...state(),
      exams: [exam()],
      tasks: [task()],
      materials: [material()],
      sessions: [session()],
    };
    initial[key][0].subjectId = "missing";
    expect(() => validateState(initial)).toThrow(/matéria/);
  });
  it("rejects missing or mismatching course and lesson references", () => {
    const initial = state();
    initial.lessons[0].courseId = "missing";
    expect(() => validateState(initial)).toThrow(/curso/);
    const initial2 = state();
    initial2.cards[0].lessonId = "missing";
    expect(() => validateState(initial2)).toThrow(/aula/);
    const initial3 = state();
    initial3.cards[0].lessonId = "240664:aula:00";
    expect(() => validateState(initial3)).toThrow(/aula/);
  });
  it.each([
    "javascript:alert(1)",
    "file:///C:/Windows/a.txt",
    "https://user:password@example.com/",
    "not a link",
    "data:text/html,hello",
  ])("rejects unsafe URLs: %s", (url) => {
    const initial = state();
    initial.cards[0].sourceUrl = url;
    expect(() => validateState(initial)).toThrow();
  });
  it("accepts unassigned general commitments and materials", () => {
    const initial = {
      ...state(),
      exams: [exam({ subjectId: "" })],
      tasks: [task({ subjectId: "" })],
      materials: [material({ subjectId: "", lessonId: "" })],
      sessions: [session({ subjectId: "", lessonId: "" })],
    };
    expect(validateState(initial)).toEqual(initial);
  });
  it.each([
    "../../x.pdf",
    "C:\\x.pdf",
    "fdc5b413-3a60-4b44-8e99-8506ff054d75.exe",
    "file.pdf",
    ".",
  ])("rejects unsafe material path: %s", (storedName) => {
    expect(() =>
      validateState({ ...state(), materials: [material({ storedName })] }),
    ).toThrow();
  });
  it("rejects oversized files and wrong extension metadata", () => {
    expect(() =>
      validateState({
        ...state(),
        materials: [material({ size: 100 * 1024 * 1024 + 1 })],
      }),
    ).toThrow();
    expect(() =>
      validateState({ ...state(), materials: [material({ type: "png" })] }),
    ).toThrow(/extensão/);
  });
  it("rejects inconsistent new card histories and impossible timestamps", () => {
    const initial = state();
    initial.cards[0].repetitions = 1;
    expect(() => validateState(initial)).toThrow(/novo/);
    const initial2 = state();
    initial2.cards[0].lastReviewedAt = "2026-01-01T00:00:00.000Z";
    expect(() => validateState(initial2)).toThrow(/criação/);
    const initial3 = state();
    initial3.cards[0].dueAt = "2026-01-01T00:00:00.000Z";
    expect(() => validateState(initial3)).toThrow(/agendamento/);
    const initial4 = state();
    initial4.cards[0].createdAt = "2026-02-30T00:00:00Z";
    expect(() => validateState(initial4)).toThrow();
  });
});

describe("commands", () => {
  it("updates settings immutably and retains unspecified preferences", () => {
    const initial = state();
    const before = JSON.stringify(initial);
    const next = applyCommand(
      initial,
      {
        type: "settings.update",
        patch: {
          name: " Ale ",
          theme: "dark",
          reducedMotion: true,
          sound: true,
        },
      },
      now,
    );
    expect(next.settings).toMatchObject({
      name: "Ale",
      theme: "dark",
      reducedMotion: true,
      sound: true,
      focusMinutes: 25,
    });
    expect(JSON.stringify(initial)).toBe(before);
  });
  it.each([
    { dailyMinutes: 0 },
    { dailyMinutes: 721 },
    { newCardsPerDay: -1 },
    { newCardsPerDay: 201 },
    { newCardsPerDay: 1.5 },
    { focusMinutes: 0 },
    { breakMinutes: 61 },
    { name: " " },
    { unknown: true },
  ])("rejects invalid settings %j", (patch) => {
    expect(() =>
      applyCommand(state(), command({ type: "settings.update", patch }), now),
    ).toThrow();
  });
  it("creates and edits subjects, courses and lessons while preserving lesson progress", () => {
    let current = applyCommand(
      state(),
      {
        type: "subject.save",
        subject: {
          id: "new-subject",
          name: "Compiladores",
          track: "faculdade",
          color: "#aabbcc",
        },
      },
      now,
    );
    current = applyCommand(
      current,
      {
        type: "subject.save",
        subject: {
          id: "new-subject",
          name: "Compiladores II",
          track: "faculdade",
          color: "#aabbcc",
        },
      },
      now,
    );
    expect(
      current.subjects.filter((subject) => subject.id === "new-subject"),
    ).toHaveLength(1);
    const course = {
      id: "new-course",
      subjectId: "new-subject",
      title: "Mauá",
      provider: "Material pessoal",
      url: "",
    };
    current = applyCommand(current, { type: "course.save", course }, now);
    current = applyCommand(
      current,
      { type: "course.save", course: { ...course, title: "Último semestre" } },
      now,
    );
    const lesson = {
      id: "new-lesson",
      subjectId: "new-subject",
      courseId: "new-course",
      title: "Análise léxica",
      description: "",
      url: "",
      order: 0,
    };
    current = applyCommand(current, { type: "lesson.save", lesson }, now);
    current = applyCommand(
      current,
      {
        type: "lesson.update",
        id: lesson.id,
        patch: { status: "done", notes: "Revisar exemplos." },
      },
      now,
    );
    current = applyCommand(
      current,
      {
        type: "lesson.save",
        lesson: { ...lesson, title: "Análise léxica e tokens" },
      },
      tomorrow,
    );
    expect(current.lessons.find((item) => item.id === lesson.id)).toMatchObject(
      {
        status: "done",
        notes: "Revisar exemplos.",
        updatedAt: now.toISOString(),
        title: "Análise léxica e tokens",
      },
    );
  });
  it("blocks course/lesson edits that would break attached references", () => {
    const initial = state();
    expect(() =>
      applyCommand(
        initial,
        {
          type: "course.save",
          course: { ...initial.courses[0], subjectId: "literatura" },
        },
        now,
      ),
    ).toThrow(/curso/);
    expect(() =>
      applyCommand(
        initial,
        {
          type: "lesson.save",
          lesson: { ...initial.lessons[0], subjectId: "missing" },
        } as Command,
        now,
      ),
    ).toThrow();
  });
  it("updates lesson status, notes and update timestamp", () => {
    const current = applyCommand(
      state(),
      {
        type: "lesson.update",
        id: lessonId,
        patch: { status: "in-progress", notes: "Continuar página 12" },
      },
      now,
    );
    expect(
      current.lessons.find((lesson) => lesson.id === lessonId),
    ).toMatchObject({
      status: "in-progress",
      notes: "Continuar página 12",
      updatedAt: now.toISOString(),
    });
    expect(() =>
      applyCommand(
        current,
        command({
          type: "lesson.update",
          id: lessonId,
          patch: { courseId: "bad" },
        }),
        now,
      ),
    ).toThrow();
  });
  it("creates, edits, unlinks, flags, suspends and deletes cards without losing history", () => {
    let current = oneCard();
    current = applyCommand(
      current,
      { type: "card.review", id: "test-card", rating: "good" },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.flag", id: "test-card", flag: "outdated" },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.suspend", id: "test-card", suspended: true },
      now,
    );
    const { lessonId: _, ...content } = cardContent();
    current = applyCommand(
      current,
      {
        type: "card.save",
        card: { ...content, question: "Pergunta alterada" },
      },
      now,
    );
    expect(current.cards[0]).toMatchObject({
      question: "Pergunta alterada",
      repetitions: 1,
      suspended: true,
      flag: "outdated",
    });
    expect(current.cards[0].lessonId).toBeUndefined();
    expect(() =>
      applyCommand(
        current,
        { type: "card.review", id: "test-card", rating: "good" },
        now,
      ),
    ).toThrow(/Reative/);
    current = applyCommand(
      current,
      { type: "card.suspend", id: "test-card", suspended: false },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.delete", id: "test-card" },
      now,
    );
    expect(current.cards).toHaveLength(0);
    expect(current.sessions).toHaveLength(1);
  });
  it("saves, completes, edits and deletes exams and tasks", () => {
    let current = applyCommand(
      state(),
      { type: "exam.save", exam: exam() },
      now,
    );
    current = applyCommand(
      current,
      {
        type: "exam.save",
        exam: exam({ completed: true, notes: "Trazer calculadora" }),
      },
      now,
    );
    expect(current.exams).toHaveLength(1);
    expect(current.exams[0].completed).toBe(true);
    current = applyCommand(current, { type: "task.save", task: task() }, now);
    current = applyCommand(
      current,
      { type: "task.save", task: task({ completed: true }) },
      now,
    );
    expect(current.tasks).toHaveLength(1);
    expect(current.tasks[0].completed).toBe(true);
    current = applyCommand(current, { type: "exam.delete", id: "exam-1" }, now);
    current = applyCommand(current, { type: "task.delete", id: "task-1" }, now);
    expect(current.exams).toHaveLength(0);
    expect(current.tasks).toHaveLength(0);
  });
  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-12",
    "2026-12-00",
    "2026-2-01",
    "1899-01-01",
    "2201-01-01",
  ])("rejects invalid calendar date %s", (date) => {
    expect(() =>
      applyCommand(state(), { type: "exam.save", exam: exam({ date }) }, now),
    ).toThrow();
    expect(() =>
      applyCommand(state(), { type: "task.save", task: task({ date }) }, now),
    ).toThrow();
  });
  it("accepts real leap days and empty times but rejects invalid times", () => {
    expect(
      applyCommand(
        state(),
        { type: "exam.save", exam: exam({ date: "2028-02-29", time: "" }) },
        now,
      ).exams,
    ).toHaveLength(1);
    for (const time of ["24:00", "12:60", "1:30", "13:10:00"])
      expect(() =>
        applyCommand(state(), { type: "exam.save", exam: exam({ time }) }, now),
      ).toThrow();
  });
  it("logs study sessions once and prevents future or reserved entries", () => {
    const current = applyCommand(
      state(),
      { type: "session.add", session: session() },
      now,
    );
    expect(current.sessions[0].durationMinutes).toBe(25);
    expect(() =>
      applyCommand(current, { type: "session.add", session: session() }, now),
    ).toThrow(/já/);
    expect(() =>
      applyCommand(
        state(),
        {
          type: "session.add",
          session: session({ completedAt: tomorrow.toISOString() }),
        },
        now,
      ),
    ).toThrow(/futuro/);
    expect(() =>
      applyCommand(
        state(),
        {
          type: "session.add",
          session: session({ id: "review:first:injected" }),
        },
        now,
      ),
    ).toThrow(/reservado/);
    expect(() =>
      applyCommand(
        state(),
        { type: "session.add", session: session({ durationMinutes: -1 }) },
        now,
      ),
    ).toThrow();
  });
  it("updates and removes materials without mutating the source state", () => {
    const initial = { ...state(), materials: [material()] };
    const current = applyCommand(
      initial,
      {
        type: "material.update",
        id: "material-1",
        patch: { subjectId: "", lessonId: "", notes: "Anotação" },
      },
      now,
    );
    expect(current.materials[0]).toMatchObject({
      subjectId: "",
      lessonId: "",
      notes: "Anotação",
    });
    expect(initial.materials[0].notes).toBe("");
    expect(
      applyCommand(current, { type: "material.remove", id: "material-1" }, now)
        .materials,
    ).toHaveLength(0);
  });
  it.each([
    "lesson.update",
    "card.review",
    "card.flag",
    "card.suspend",
    "card.delete",
    "exam.delete",
    "task.delete",
    "material.update",
    "material.remove",
  ])("rejects missing item for %s", (type) => {
    const extra =
      type === "lesson.update" || type === "material.update"
        ? { patch: {} }
        : type === "card.review"
          ? { rating: "good" }
          : type === "card.flag"
            ? { flag: "none" }
            : type === "card.suspend"
              ? { suspended: false }
              : {};
    expect(() =>
      applyCommand(state(), command({ type, id: "missing", ...extra }), now),
    ).toThrow(/não existe/);
  });
  it("rejects unknown commands and extra fields without modifying data", () => {
    const initial = state();
    const before = JSON.stringify(initial);
    expect(() =>
      applyCommand(initial, command({ type: "delete.everything" }), now),
    ).toThrow();
    expect(() =>
      applyCommand(
        initial,
        command({ type: "settings.update", patch: {}, root: "bad" }),
        now,
      ),
    ).toThrow();
    expect(JSON.stringify(initial)).toBe(before);
  });
});

describe("transparent spaced review", () => {
  it.each([
    ["again", 10 / 1440],
    ["hard", 1],
    ["good", 1],
    ["easy", 4],
  ] as const)("schedules %s correctly", (rating, interval) => {
    const current = applyCommand(
      oneCard(),
      { type: "card.review", id: "test-card", rating },
      now,
    );
    expect(current.cards[0].intervalDays).toBe(interval);
    expect(current.cards[0].repetitions).toBe(1);
    expect(current.cards[0].lapses).toBe(rating === "again" ? 1 : 0);
    expect(current.sessions[0]).toMatchObject({
      id: "review:first:test-card",
      durationMinutes: 0,
      kind: "review",
    });
    const expected = new Date(now);
    if (rating === "again") expected.setMinutes(expected.getMinutes() + 10);
    else expected.setDate(expected.getDate() + interval);
    expect(current.cards[0].dueAt).toBe(expected.toISOString());
  });
  it("expands successful intervals, resets hard to one day and preserves flags/lapses", () => {
    let current = oneCard();
    current = applyCommand(
      current,
      { type: "card.flag", id: "test-card", flag: "relearn" },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.review", id: "test-card", rating: "again" },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.review", id: "test-card", rating: "easy" },
      tomorrow,
    );
    expect(current.cards[0]).toMatchObject({
      lapses: 1,
      flag: "relearn",
      intervalDays: 4,
    });
    current = applyCommand(
      current,
      { type: "card.review", id: "test-card", rating: "good" },
      new Date("2026-09-19T16:00:00Z"),
    );
    expect(current.cards[0].intervalDays).toBe(10);
    current = applyCommand(
      current,
      { type: "card.review", id: "test-card", rating: "hard" },
      new Date("2026-09-29T16:00:00Z"),
    );
    expect(current.cards[0]).toMatchObject({
      intervalDays: 1,
      lapses: 1,
      flag: "relearn",
      repetitions: 4,
    });
  });
  it("caps ease and schedule growth, and keeps a minimum ease", () => {
    const reviewed: ReviewCard = {
      ...oneCard().cards[0],
      lastReviewedAt: now.toISOString(),
      repetitions: 2,
      intervalDays: 36_000,
      ease: 3.5,
    };
    const current = applyCommand(
      { ...empty(), cards: [reviewed] },
      { type: "card.review", id: "test-card", rating: "easy" },
      now,
    );
    expect(current.cards[0]).toMatchObject({ ease: 3.5, intervalDays: 36_500 });
    const low = applyCommand(
      { ...empty(), cards: [{ ...reviewed, ease: 1.3 }] },
      { type: "card.review", id: "test-card", rating: "again" },
      now,
    );
    expect(low.cards[0].ease).toBe(1.3);
  });
  it("allows maximum length card IDs to be reviewed", () => {
    const id = "a".repeat(200);
    const current = applyCommand(
      empty(),
      { type: "card.save", card: cardContent(id) },
      now,
    );
    expect(
      applyCommand(current, { type: "card.review", id, rating: "good" }, now)
        .cards[0].repetitions,
    ).toBe(1);
  });
  it("rejects time travel and invalid clock input", () => {
    expect(() =>
      applyCommand(
        oneCard(),
        { type: "card.review", id: "test-card", rating: "good" },
        new Date("2026-09-13T12:00:00Z"),
      ),
    ).toThrow(/tempo/);
    expect(() => createInitialState(new Date("invalid"))).toThrow(/Relógio/);
    expect(() => localDate(new Date("invalid"))).toThrow(/Relógio/);
  });
  it("prioritizes all due reviews ahead of the limited new queue", () => {
    let current = state();
    expect(getDueCards(current, now)).toHaveLength(5);
    const first = getDueCards(current, now)[0];
    current = applyCommand(
      current,
      { type: "card.review", id: first.id, rating: "again" },
      now,
    );
    expect(getDueCards(current, now)).toHaveLength(4);
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(getDueCards(current, later)).toHaveLength(5);
    expect(getDueCards(current, later)[0].id).toBe(first.id);
    current = applyCommand(
      current,
      { type: "card.review", id: first.id, rating: "good" },
      later,
    );
    expect(getDueCards(current, later)).toHaveLength(4);
    current = applyCommand(
      current,
      { type: "settings.update", patch: { newCardsPerDay: 0 } },
      later,
    );
    expect(getDueCards(current, later)).toHaveLength(0);
    expect(getDueCards(current, new Date("2026-09-16T16:00:00Z"))).toHaveLength(
      1,
    );
  });
  it("keeps the daily limit after first cards are reviewed again or deleted", () => {
    let current = state();
    for (let index = 0; index < 5; index++) {
      const next = getDueCards(current, now)[0];
      current = applyCommand(
        current,
        { type: "card.review", id: next.id, rating: "good" },
        now,
      );
      current = applyCommand(
        current,
        { type: "card.review", id: next.id, rating: "good" },
        now,
      );
      if (index === 0)
        current = applyCommand(
          current,
          { type: "card.delete", id: next.id },
          now,
        );
    }
    expect(getDueCards(current, now)).toHaveLength(0);
    expect(
      getDueCards(current, tomorrow).filter((card) => !card.lastReviewedAt),
    ).toHaveLength(5);
  });
  it("excludes future and suspended cards without mutating the queue", () => {
    const current = state();
    const originalOrder = current.cards.map((card) => card.id);
    current.cards[0].suspended = true;
    current.cards[1].dueAt = tomorrow.toISOString();
    const due = getDueCards(current, now);
    expect(due.map((card) => card.id)).not.toContain(current.cards[0].id);
    expect(due.map((card) => card.id)).not.toContain(current.cards[1].id);
    expect(current.cards.map((card) => card.id)).toEqual(originalOrder);
  });
  it("supports first reviews from old states without duplicate counters", () => {
    const current = applyCommand(
      state(),
      { type: "card.review", id: state().cards[0].id, rating: "good" },
      now,
    );
    current.sessions = [];
    expect(getDueCards(current, now)).toHaveLength(4);
  });
  it("applies the global new quota after selecting a subject", () => {
    let current = state();
    const literature = getDueCards(current, now, "literatura");
    expect(literature).toHaveLength(5);
    expect(literature.every((card) => card.subjectId === "literatura")).toBe(
      true,
    );
    current = applyCommand(
      current,
      { type: "card.review", id: literature[0].id, rating: "good" },
      now,
    );
    expect(getDueCards(current, now, "banco-de-dados")).toHaveLength(4);
    expect(getDueCards(current, now, "literatura")).toHaveLength(4);
    expect(getDueCards(current, now, "missing")).toHaveLength(0);
  });
});

describe("dashboard and local dates", () => {
  const originalTimezone = process.env.TZ;
  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });
  it("starts with honest zero progress and five available new cards", () => {
    expect(getDashboardStats(state(), now)).toMatchObject({
      dueCards: 5,
      newCards: 5,
      reviewCards: 0,
      todayMinutes: 0,
      weekMinutes: 0,
      streak: 0,
      lessonsDone: 0,
      totalLessons: 271,
      upcomingExams: [],
      flaggedCards: 0,
      todayTasks: [],
      dailyGoalProgress: 0,
    });
  });
  it("sums recent activity, caps goal progress and counts zero-minute real reviews in streaks", () => {
    let current = applyCommand(
      state(),
      { type: "session.add", session: session({ durationMinutes: 45 }) },
      now,
    );
    current.sessions.push(
      session({
        id: "yesterday",
        completedAt: "2026-09-13T16:00:00Z",
        durationMinutes: 20,
      }),
    );
    current.sessions.push(
      session({
        id: "two-days",
        completedAt: "2026-09-12T16:00:00Z",
        durationMinutes: 0,
        kind: "review",
      }),
    );
    current.sessions.push(
      session({
        id: "old",
        completedAt: "2026-08-01T16:00:00Z",
        durationMinutes: 60,
      }),
    );
    current.sessions.push(
      session({
        id: "future",
        completedAt: "2026-09-16T16:00:00Z",
        durationMinutes: 100,
      }),
    );
    current = applyCommand(
      current,
      { type: "lesson.update", id: lessonId, patch: { status: "done" } },
      now,
    );
    current = applyCommand(
      current,
      { type: "card.flag", id: current.cards[0].id, flag: "outdated" },
      now,
    );
    const stats = getDashboardStats(current, now);
    expect(stats).toMatchObject({
      todayMinutes: 45,
      weekMinutes: 65,
      streak: 3,
      dailyGoalProgress: 100,
      lessonsDone: 1,
      flaggedCards: 1,
    });
    expect(stats.studiedDays).toHaveLength(7);
    expect(stats.studiedDays.at(-1)).toEqual({
      date: localDate(now),
      minutes: 45,
    });
  });
  it("retains yesterday streak until today is over, but stops at a missed day", () => {
    const current = state();
    current.sessions = [
      session({ completedAt: "2026-09-13T16:00:00Z" }),
      session({ id: "older", completedAt: "2026-09-11T16:00:00Z" }),
    ];
    expect(getDashboardStats(current, now).streak).toBe(1);
    expect(getDashboardStats(current, tomorrow).streak).toBe(0);
  });
  it("sorts unfinished upcoming exams and returns only today tasks", () => {
    const current = state();
    current.exams = [
      exam({ id: "later", date: "2026-09-21" }),
      exam({ id: "today", date: localDate(now) }),
      exam({ id: "past", date: "2026-09-10" }),
      exam({ id: "done", completed: true }),
    ];
    current.tasks = [task(), task({ id: "other-day", date: "2026-09-15" })];
    const stats = getDashboardStats(current, now);
    expect(stats.upcomingExams.map((exam) => exam.id)).toEqual([
      "today",
      "later",
    ]);
    expect(stats.todayTasks.map((task) => task.id)).toEqual(["task-1"]);
  });
  it("uses local calendar day rather than UTC at midnight", () => {
    process.env.TZ = "America/Sao_Paulo";
    const midnightUtc = new Date("2026-09-15T01:00:00Z");
    expect(localDate(midnightUtc)).toBe(
      `${midnightUtc.getFullYear()}-${String(midnightUtc.getMonth() + 1).padStart(2, "0")}-${String(midnightUtc.getDate()).padStart(2, "0")}`,
    );
    if (midnightUtc.getTimezoneOffset() === 180)
      expect(localDate(midnightUtc)).toBe("2026-09-14");
  });
  it("resets new card quota on a local date boundary and respects year transitions", () => {
    const late = new Date(2026, 11, 31, 23, 55);
    let current = createInitialState(late);
    for (let index = 0; index < 5; index++)
      current = applyCommand(
        current,
        {
          type: "card.review",
          id: getDueCards(current, late)[0].id,
          rating: "good",
        },
        late,
      );
    expect(getDueCards(current, late)).toHaveLength(0);
    const early = new Date(2027, 0, 1, 0, 5);
    expect(localDate(early)).toBe("2027-01-01");
    expect(
      getDueCards(current, early).filter((card) => !card.lastReviewedAt),
    ).toHaveLength(5);
  });
  it("uses calendar-day intervals through a DST transition", () => {
    process.env.TZ = "America/New_York";
    const before = new Date(2026, 2, 7, 12, 0);
    const initial = applyCommand(
      { ...createInitialState(before), cards: [] },
      { type: "card.save", card: cardContent() },
      before,
    );
    const reviewed = applyCommand(
      initial,
      { type: "card.review", id: "test-card", rating: "good" },
      before,
    );
    const due = new Date(reviewed.cards[0].dueAt);
    expect(due.getDate()).toBe(8);
    expect(due.getHours()).toBe(12);
  });
});
