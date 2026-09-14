import { z } from "zod";
import seed from "../../resources/seed.json";
import type {
  AppState,
  Command,
  Exam,
  ReviewCard,
  StudyTask,
  StudyProgram,
  Track,
} from "../shared/types";
export { getMentorOverview, answerMentor } from "./mentor";
export type {
  MentorAction,
  MentorOverview,
  MentorReply,
  MentorStatus,
  SubjectInsight,
} from "./mentor";

const id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/, "Identificador inválido.");
const optionalId = z.union([id, z.literal("")]);
const text = (max: number) => z.string().max(max);
const label = (max: number) =>
  z.string().trim().min(1, "Preencha este campo.").max(max);
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Data inválida.");
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 2200) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Use uma data válida.");
const webUrl = z
  .string()
  .max(4000)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        ["https:", "http:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use um endereço HTTP ou HTTPS válido.");

export const settingsSchema = z
  .object({
    name: label(100),
    dailyMinutes: integer(5, 720),
    newCardsPerDay: integer(0, 200),
    focusMinutes: integer(1, 180),
    breakMinutes: integer(1, 60),
    theme: z.enum(["light", "dark", "system"]),
    sound: z.boolean(),
    reducedMotion: z.boolean(),
  })
  .strict();
const subjectSchema = z
  .object({
    id,
    programId: id,
    name: label(150),
    track: z.enum(["concurso", "faculdade", "pessoal"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
const programSchema = subjectSchema
  .omit({ programId: true })
  .extend({ description: text(5000) })
  .strict();
const legacySubjectSchema = subjectSchema.omit({ programId: true }).strict();
const subjectCommandSchema = subjectSchema
  .extend({ programId: id.optional() })
  .strict();
const courseSchema = z
  .object({
    id,
    subjectId: id,
    title: label(500),
    provider: label(200),
    url: webUrl,
  })
  .strict();
const lessonSchema = z
  .object({
    id,
    courseId: id,
    subjectId: id,
    title: label(500),
    description: text(20_000),
    url: webUrl,
    order: integer(0, 100_000),
    status: z.enum(["not-started", "in-progress", "done"]),
    updatedAt: timestamp.nullable(),
    notes: text(100_000),
  })
  .strict();
const flagSchema = z.enum(["none", "outdated", "relearn"]);
const cardContent = z
  .object({
    id,
    subjectId: id,
    lessonId: id.optional(),
    question: label(10_000),
    answer: label(50_000),
    source: text(5_000),
    sourceUrl: webUrl,
  })
  .strict();
const cardSchema = cardContent
  .extend({
    dueAt: timestamp,
    lastReviewedAt: timestamp.nullable(),
    intervalDays: z.number().min(0).max(36_500),
    ease: z.number().min(1.3).max(3.5),
    repetitions: integer(0, 1_000_000),
    lapses: integer(0, 1_000_000),
    flag: flagSchema,
    suspended: z.boolean(),
    createdAt: timestamp,
  })
  .strict();
const examSchema = z
  .object({
    id,
    title: label(300),
    subjectId: optionalId,
    date: calendarDate,
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/),
    location: text(500),
    notes: text(20_000),
    completed: z.boolean(),
  })
  .strict();
const materialSchema = z
  .object({
    id,
    name: label(500),
    storedName: z
      .string()
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|png|jpe?g|webp|txt|md|docx|pptx|xlsx|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|aac|flac)$/i,
      ),
    type: z.enum([
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "txt",
      "md",
      "docx",
      "pptx",
      "xlsx",
      "mp4",
      "webm",
      "mov",
      "mkv",
      "mp3",
      "wav",
      "ogg",
      "m4a",
      "aac",
      "flac",
    ]),
    size: integer(0, 2 * 1024 * 1024 * 1024),
    subjectId: optionalId,
    lessonId: optionalId,
    createdAt: timestamp,
    notes: text(100_000),
  })
  .strict();
const sessionSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/),
    subjectId: optionalId,
    lessonId: optionalId,
    durationMinutes: z.number().min(0).max(1440),
    completedAt: timestamp,
    kind: z.enum(["focus", "lesson", "review"]),
  })
  .strict();
const taskSchema = z
  .object({
    id,
    title: label(500),
    date: calendarDate,
    subjectId: optionalId,
    completed: z.boolean(),
  })
  .strict();
export const stateSchema = z
  .object({
    version: z.literal(2),
    settings: settingsSchema,
    programs: z.array(programSchema).max(500),
    subjects: z.array(subjectSchema).max(500),
    courses: z.array(courseSchema).max(5_000),
    lessons: z.array(lessonSchema).max(100_000),
    cards: z.array(cardSchema).max(100_000),
    exams: z.array(examSchema).max(10_000),
    materials: z.array(materialSchema).max(10_000),
    sessions: z.array(sessionSchema).max(500_000),
    tasks: z.array(taskSchema).max(100_000),
  })
  .strict();
const legacyStateSchema = stateSchema
  .omit({ programs: true })
  .extend({
    version: z.literal(1),
    subjects: z.array(legacySubjectSchema).max(500),
  })
  .strict();

function defaultProgram(track: Track): StudyProgram {
  if (track === "concurso")
    return {
      id: "senado-federal",
      name: "Senado Federal",
      track,
      color: "#527969",
      description:
        "Analista Legislativo — Informática, Análise e Suporte a Sistemas.",
    };
  if (track === "faculdade")
    return {
      id: "maua",
      name: "Mauá",
      track,
      color: "#738cba",
      description: "Ciência da Computação · Instituto Mauá de Tecnologia.",
    };
  return {
    id: "outros",
    name: "Outros estudos",
    track,
    color: "#a87659",
    description: "Seus conteúdos e objetivos pessoais.",
  };
}

/** Upgrade only the known v1 shape; unknown versions and malformed backups remain errors. */
export function migrateState(input: unknown): unknown {
  if (
    !input ||
    typeof input !== "object" ||
    !("version" in input) ||
    input.version !== 1
  )
    return input;
  const legacy = legacyStateSchema.parse(input);
  const programs = [defaultProgram("concurso"), defaultProgram("faculdade")];
  if (legacy.subjects.some((subject) => subject.track === "pessoal"))
    programs.push(defaultProgram("pessoal"));
  return {
    ...legacy,
    version: 2,
    programs,
    subjects: legacy.subjects.map((subject) => ({
      ...subject,
      programId: defaultProgram(subject.track).id,
    })),
  };
}

const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("settings.update"),
      patch: settingsSchema.partial().strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("subject.save"), subject: subjectCommandSchema })
    .strict(),
  z
    .object({ type: z.literal("program.save"), program: programSchema })
    .strict(),
  z.object({ type: z.literal("course.save"), course: courseSchema }).strict(),
  z
    .object({
      type: z.literal("lesson.save"),
      lesson: lessonSchema.pick({
        id: true,
        courseId: true,
        subjectId: true,
        title: true,
        description: true,
        url: true,
        order: true,
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("lesson.update"),
      id,
      patch: lessonSchema
        .pick({ status: true, notes: true })
        .partial()
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("card.save"), card: cardContent }).strict(),
  z
    .object({
      type: z.literal("card.review"),
      id,
      rating: z.enum(["again", "hard", "good", "easy"]),
    })
    .strict(),
  z.object({ type: z.literal("card.flag"), id, flag: flagSchema }).strict(),
  z
    .object({ type: z.literal("card.suspend"), id, suspended: z.boolean() })
    .strict(),
  z.object({ type: z.literal("card.delete"), id }).strict(),
  z.object({ type: z.literal("exam.save"), exam: examSchema }).strict(),
  z.object({ type: z.literal("exam.delete"), id }).strict(),
  z.object({ type: z.literal("task.save"), task: taskSchema }).strict(),
  z.object({ type: z.literal("task.delete"), id }).strict(),
  z.object({ type: z.literal("session.add"), session: sessionSchema }).strict(),
  z
    .object({
      type: z.literal("material.update"),
      id,
      patch: materialSchema
        .pick({ subjectId: true, lessonId: true, notes: true })
        .partial()
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("material.remove"), id }).strict(),
]);

/** Validate both shape and referential integrity; returns a detached, safe data object. */
export function validateState(input: unknown): AppState {
  const state = stateSchema.parse(migrateState(input));
  for (const collection of [
    state.programs,
    state.subjects,
    state.courses,
    state.lessons,
    state.cards,
    state.exams,
    state.materials,
    state.sessions,
    state.tasks,
  ]) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      throw new Error("Há identificadores duplicados.");
  }
  const subjects = new Set(state.subjects.map((item) => item.id));
  const programs = new Map(state.programs.map((item) => [item.id, item]));
  for (const subject of state.subjects) {
    const program = programs.get(subject.programId);
    if (!program) throw new Error("O curso desta matéria não existe.");
    if (subject.track !== program.track)
      throw new Error("O objetivo da matéria deve corresponder ao seu curso.");
  }
  const courses = new Map(state.courses.map((item) => [item.id, item]));
  const lessons = new Map(state.lessons.map((item) => [item.id, item]));
  const checkSubject = (subjectId: string) => {
    if (subjectId && !subjects.has(subjectId))
      throw new Error("A matéria vinculada não existe.");
  };
  const checkLesson = (item: { lessonId?: string; subjectId: string }) => {
    checkSubject(item.subjectId);
    if (item.lessonId) {
      const lesson = lessons.get(item.lessonId);
      if (!lesson || lesson.subjectId !== item.subjectId)
        throw new Error("A aula não pertence à matéria selecionada.");
    }
  };
  state.courses.forEach((item) => checkSubject(item.subjectId));
  state.lessons.forEach((item) => {
    checkSubject(item.subjectId);
    if (courses.get(item.courseId)?.subjectId !== item.subjectId)
      throw new Error("A aula não pertence ao curso selecionado.");
  });
  state.cards.forEach(checkLesson);
  state.materials.forEach(checkLesson);
  state.materials.forEach((item) => {
    if (
      ![
        "mp4",
        "webm",
        "mov",
        "mkv",
        "mp3",
        "wav",
        "ogg",
        "m4a",
        "aac",
        "flac",
      ].includes(item.type) &&
      item.size > 100 * 1024 * 1024
    )
      throw new Error("Este arquivo ultrapassa o limite de 100 MiB.");
    if (item.storedName.split(".").at(-1)?.toLowerCase() !== item.type)
      throw new Error("O tipo do arquivo não corresponde à extensão.");
  });
  state.sessions.forEach(checkLesson);
  state.exams.forEach((item) => checkSubject(item.subjectId));
  state.tasks.forEach((item) => checkSubject(item.subjectId));
  for (const card of state.cards) {
    if (
      Date.parse(card.dueAt) < Date.parse(card.createdAt) ||
      (card.lastReviewedAt &&
        Date.parse(card.dueAt) < Date.parse(card.lastReviewedAt))
    )
      throw new Error("O agendamento do cartão é anterior ao seu histórico.");
    if (
      card.lastReviewedAt &&
      Date.parse(card.lastReviewedAt) < Date.parse(card.createdAt)
    )
      throw new Error("A revisão não pode anteceder a criação do cartão.");
    if (
      !card.lastReviewedAt &&
      (card.repetitions !== 0 || card.lapses !== 0 || card.intervalDays !== 0)
    )
      throw new Error("Um cartão novo não pode ter histórico de revisão.");
  }
  return state;
}

function validNow(date: Date): Date {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new Error("Relógio inválido.");
  return date;
}

/** Calendar date in the user's local timezone, never a UTC-sliced date. */
export function localDate(date: Date = new Date()): string {
  validNow(date);
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

export function createInitialState(now: Date = new Date()): AppState {
  const instant = validNow(now).toISOString();
  const state = validateState(seed);
  return {
    ...state,
    cards: state.cards.map((card) => ({
      ...card,
      createdAt: instant,
      dueAt: instant,
    })),
  };
}

export interface LessonStudyStats {
  durationMinutes: number;
  sessionCount: number;
}

/** Recorded time only. Zero-minute review events never imply study duration. */
export function getLessonStudyStats(
  state: AppState,
): Record<string, LessonStudyStats> {
  const totals: Record<string, LessonStudyStats> = Object.create(null);
  const subjects = new Map(
    state.lessons.map((lesson) => [lesson.id, lesson.subjectId]),
  );
  for (const lesson of state.lessons)
    totals[lesson.id] = { durationMinutes: 0, sessionCount: 0 };
  for (const session of state.sessions) {
    if (
      !session.lessonId ||
      session.durationMinutes <= 0 ||
      subjects.get(session.lessonId) !== session.subjectId
    )
      continue;
    const total = totals[session.lessonId];
    total.durationMinutes += session.durationMinutes;
    total.sessionCount++;
  }
  return totals;
}

function requireItem<T extends { id: string }>(
  items: T[],
  targetId: string,
): T {
  const item = items.find((value) => value.id === targetId);
  if (!item) throw new Error("Este item não existe mais.");
  return item;
}
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((value) => value.id === item.id)
    ? items.map((value) => (value.id === item.id ? item : value))
    : [...items, item];
}

function scheduleCard(
  card: ReviewCard,
  rating: "again" | "hard" | "good" | "easy",
  now: Date,
): ReviewCard {
  let intervalDays: number;
  let ease = card.ease;
  if (rating === "again") {
    intervalDays = 10 / 1440;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === "hard") {
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.15);
  } else if (rating === "good")
    intervalDays =
      card.intervalDays < 1
        ? 1
        : Math.max(1, Math.round(card.intervalDays * ease));
  else {
    intervalDays =
      card.intervalDays < 1
        ? 4
        : Math.max(4, Math.round(card.intervalDays * ease * 1.3));
    ease = Math.min(3.5, ease + 0.15);
  }
  intervalDays = Math.min(36_500, intervalDays);
  // Calendar days keep the same local review time through daylight-saving changes.
  const due = new Date(now);
  if (rating === "again") due.setTime(due.getTime() + 10 * 60_000);
  else due.setDate(due.getDate() + intervalDays);
  return {
    ...card,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
    intervalDays,
    ease,
    repetitions: card.repetitions + 1,
    lapses: card.lapses + (rating === "again" ? 1 : 0),
  };
}

/** Pure command reducer; all input validation runs before a result is returned. */
export function applyCommand(
  input: AppState,
  rawCommand: Command,
  now: Date = new Date(),
): AppState {
  const state = validateState(input);
  const command = commandSchema.parse(rawCommand);
  const instant = validNow(now).toISOString();
  let next = state;
  switch (command.type) {
    case "settings.update":
      next = { ...state, settings: { ...state.settings, ...command.patch } };
      break;
    case "program.save":
      next = {
        ...state,
        programs: upsert(state.programs, command.program),
        subjects: state.subjects.map((subject) =>
          subject.programId === command.program.id
            ? { ...subject, track: command.program.track }
            : subject,
        ),
      };
      break;
    case "subject.save": {
      const previous = state.subjects.find(
        (subject) => subject.id === command.subject.id,
      );
      let programId =
        command.subject.programId ??
        (previous?.track === command.subject.track
          ? previous.programId
          : undefined);
      let programs = state.programs;
      if (!programId) {
        const preferred = defaultProgram(command.subject.track);
        programId =
          programs.find(
            (program) =>
              program.id === preferred.id &&
              program.track === command.subject.track,
          )?.id ??
          programs.find((program) => program.track === command.subject.track)
            ?.id;
        if (!programId) {
          programId = preferred.id;
          let suffix = 2;
          while (programs.some((program) => program.id === programId))
            programId = `${preferred.id}-${suffix++}`;
          programs = [...programs, { ...preferred, id: programId }];
        }
      }
      next = {
        ...state,
        programs,
        subjects: upsert(state.subjects, { ...command.subject, programId }),
      };
      break;
    }
    case "course.save":
      next = { ...state, courses: upsert(state.courses, command.course) };
      break;
    case "lesson.save": {
      const previous = state.lessons.find(
        (lesson) => lesson.id === command.lesson.id,
      );
      next = {
        ...state,
        lessons: upsert(state.lessons, {
          status: "not-started",
          notes: "",
          updatedAt: null,
          ...previous,
          ...command.lesson,
        }),
      };
      break;
    }
    case "lesson.update": {
      const lesson = requireItem(state.lessons, command.id);
      next = {
        ...state,
        lessons: upsert(state.lessons, {
          ...lesson,
          ...command.patch,
          updatedAt: instant,
        }),
      };
      break;
    }
    case "card.save": {
      const previous = state.cards.find((card) => card.id === command.card.id);
      const base: ReviewCard = previous ?? {
        ...command.card,
        createdAt: instant,
        dueAt: instant,
        lastReviewedAt: null,
        intervalDays: 0,
        ease: 2.5,
        repetitions: 0,
        lapses: 0,
        flag: "none",
        suspended: false,
      };
      const { lessonId: ignoredLesson, ...withoutLesson } = base;
      void ignoredLesson;
      next = {
        ...state,
        cards: upsert(state.cards, { ...withoutLesson, ...command.card }),
      };
      break;
    }
    case "card.review": {
      const card = requireItem(state.cards, command.id);
      if (card.suspended) throw new Error("Reative o cartão antes de revisar.");
      if (
        Date.parse(card.createdAt) > now.getTime() ||
        (card.lastReviewedAt && Date.parse(card.lastReviewedAt) > now.getTime())
      )
        throw new Error("A revisão não pode voltar no tempo.");
      const sessionId = !card.lastReviewedAt
        ? `review:first:${card.id}`
        : `review:${card.id}:${now.getTime()}:${card.repetitions}`;
      const session = {
        id: sessionId,
        subjectId: card.subjectId,
        lessonId: card.lessonId ?? "",
        durationMinutes: 0,
        completedAt: instant,
        kind: "review" as const,
      };
      next = {
        ...state,
        cards: upsert(state.cards, scheduleCard(card, command.rating, now)),
        sessions: [...state.sessions, session],
      };
      break;
    }
    case "card.flag":
      next = {
        ...state,
        cards: upsert(state.cards, {
          ...requireItem(state.cards, command.id),
          flag: command.flag,
        }),
      };
      break;
    case "card.suspend":
      next = {
        ...state,
        cards: upsert(state.cards, {
          ...requireItem(state.cards, command.id),
          suspended: command.suspended,
        }),
      };
      break;
    case "card.delete":
      requireItem(state.cards, command.id);
      next = {
        ...state,
        cards: state.cards.filter((card) => card.id !== command.id),
      };
      break;
    case "exam.save":
      next = { ...state, exams: upsert(state.exams, command.exam) };
      break;
    case "exam.delete":
      requireItem(state.exams, command.id);
      next = {
        ...state,
        exams: state.exams.filter((exam) => exam.id !== command.id),
      };
      break;
    case "task.save":
      next = { ...state, tasks: upsert(state.tasks, command.task) };
      break;
    case "task.delete":
      requireItem(state.tasks, command.id);
      next = {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== command.id),
      };
      break;
    case "session.add": {
      if (state.sessions.some((session) => session.id === command.session.id))
        throw new Error("Esta sessão já foi registrada.");
      if (command.session.id.startsWith("review:"))
        throw new Error("Identificador reservado para revisões.");
      if (Date.parse(command.session.completedAt) > now.getTime() + 60_000)
        throw new Error("A sessão não pode terminar no futuro.");
      next = { ...state, sessions: [...state.sessions, command.session] };
      break;
    }
    case "material.update":
      next = {
        ...state,
        materials: upsert(state.materials, {
          ...requireItem(state.materials, command.id),
          ...command.patch,
        }),
      };
      break;
    case "material.remove":
      requireItem(state.materials, command.id);
      next = {
        ...state,
        materials: state.materials.filter(
          (material) => material.id !== command.id,
        ),
      };
      break;
  }
  return validateState(next);
}

export function getDueCards(
  state: AppState,
  now: Date = new Date(),
  subjectId?: string,
): ReviewCard[] {
  const today = localDate(now);
  // Persist the first exposure separately: a second review must not reset the daily count.
  const firstReviews = state.sessions.filter(
    (session) =>
      session.kind === "review" &&
      session.id.startsWith("review:first:") &&
      localDate(new Date(session.completedAt)) === today,
  );
  const trackedIds = new Set(
    state.sessions
      .filter((session) => session.id.startsWith("review:first:"))
      .map((session) => session.id.slice("review:first:".length)),
  );
  const legacyFirstReviews = state.cards.filter(
    (card) =>
      !trackedIds.has(card.id) &&
      card.repetitions === 1 &&
      card.lastReviewedAt &&
      localDate(new Date(card.lastReviewedAt)) === today,
  ).length;
  const availableNew = Math.max(
    0,
    state.settings.newCardsPerDay - firstReviews.length - legacyFirstReviews,
  );
  const due = state.cards.filter(
    (card) =>
      !card.suspended &&
      (!subjectId || card.subjectId === subjectId) &&
      Date.parse(card.dueAt) <= validNow(now).getTime(),
  );
  const reviews = due
    .filter((card) => card.lastReviewedAt !== null)
    .sort(
      (a, b) =>
        Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
        b.lapses - a.lapses ||
        a.id.localeCompare(b.id),
    );
  const fresh = due
    .filter((card) => card.lastReviewedAt === null)
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  return [...reviews, ...fresh.slice(0, availableNew)];
}

export interface DashboardStats {
  dueCards: number;
  reviewCards: number;
  newCards: number;
  lessonsDone: number;
  totalLessons: number;
  todayMinutes: number;
  weekMinutes: number;
  streak: number;
  upcomingExams: Exam[];
  flaggedCards: number;
  todayTasks: StudyTask[];
  dailyGoalProgress: number;
  studiedDays: { date: string; minutes: number }[];
}

export function getDashboardStats(
  state: AppState,
  now: Date = new Date(),
): DashboardStats {
  const today = localDate(now);
  const due = getDueCards(state, now);
  const minutesByDay = new Map<string, number>();
  const activeDays = new Set<string>();
  for (const session of state.sessions) {
    if (Date.parse(session.completedAt) > now.getTime()) continue;
    const date = localDate(new Date(session.completedAt));
    minutesByDay.set(
      date,
      (minutesByDay.get(date) ?? 0) + session.durationMinutes,
    );
    if (session.durationMinutes > 0 || session.kind === "review")
      activeDays.add(date);
  }
  const studiedDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + index);
    const key = localDate(date);
    return { date: key, minutes: minutesByDay.get(key) ?? 0 };
  });
  const day = new Date(now);
  if (!activeDays.has(today)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (activeDays.has(localDate(day))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  const todayMinutes = minutesByDay.get(today) ?? 0;
  return {
    dueCards: due.length,
    reviewCards: due.filter((card) => card.lastReviewedAt).length,
    newCards: due.filter((card) => !card.lastReviewedAt).length,
    lessonsDone: state.lessons.filter((lesson) => lesson.status === "done")
      .length,
    totalLessons: state.lessons.length,
    todayMinutes,
    weekMinutes: studiedDays.reduce((sum, day) => sum + day.minutes, 0),
    streak,
    upcomingExams: state.exams
      .filter((exam) => !exam.completed && exam.date >= today)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      ),
    flaggedCards: state.cards.filter((card) => card.flag !== "none").length,
    todayTasks: state.tasks.filter((task) => task.date === today),
    dailyGoalProgress: Math.min(
      100,
      (todayMinutes / state.settings.dailyMinutes) * 100,
    ),
    studiedDays,
  };
}
