export type Track = "concurso" | "faculdade" | "pessoal";
export type LessonStatus = "not-started" | "in-progress" | "done";
export type Rating = "again" | "hard" | "good" | "easy";
export interface Settings {
  name: string;
  dailyMinutes: number;
  newCardsPerDay: number;
  focusMinutes: number;
  breakMinutes: number;
  theme: "light" | "dark" | "system";
  sound: boolean;
  reducedMotion: boolean;
}
export interface Subject {
  id: string;
  name: string;
  track: Track;
  color: string;
}
export interface Course {
  id: string;
  subjectId: string;
  title: string;
  provider: string;
  url: string;
}
export interface Lesson {
  id: string;
  courseId: string;
  subjectId: string;
  title: string;
  description: string;
  url: string;
  order: number;
  status: LessonStatus;
  updatedAt: string | null;
  notes: string;
}
export interface ReviewCard {
  id: string;
  subjectId: string;
  lessonId?: string;
  question: string;
  answer: string;
  source: string;
  sourceUrl: string;
  dueAt: string;
  lastReviewedAt: string | null;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  flag: "none" | "outdated" | "relearn";
  suspended: boolean;
  createdAt: string;
}
export interface Exam {
  id: string;
  title: string;
  subjectId: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  completed: boolean;
}
export interface Material {
  id: string;
  name: string;
  storedName: string;
  type: string;
  size: number;
  subjectId: string;
  lessonId: string;
  createdAt: string;
  notes: string;
}
export interface StudySession {
  id: string;
  subjectId: string;
  lessonId: string;
  durationMinutes: number;
  completedAt: string;
  kind: "focus" | "lesson" | "review";
}
export interface StudyTask {
  id: string;
  title: string;
  date: string;
  subjectId: string;
  completed: boolean;
}
export interface AppState {
  version: 1;
  settings: Settings;
  subjects: Subject[];
  courses: Course[];
  lessons: Lesson[];
  cards: ReviewCard[];
  exams: Exam[];
  materials: Material[];
  sessions: StudySession[];
  tasks: StudyTask[];
}
export type Command =
  | { type: "settings.update"; patch: Partial<Settings> }
  | { type: "subject.save"; subject: Subject }
  | { type: "course.save"; course: Course }
  | {
      type: "lesson.save";
      lesson: Pick<
        Lesson,
        | "id"
        | "courseId"
        | "subjectId"
        | "title"
        | "description"
        | "url"
        | "order"
      >;
    }
  | {
      type: "lesson.update";
      id: string;
      patch: Partial<Pick<Lesson, "status" | "notes">>;
    }
  | {
      type: "card.save";
      card: Pick<
        ReviewCard,
        "id" | "subjectId" | "question" | "answer" | "source" | "sourceUrl"
      > & { lessonId?: string };
    }
  | { type: "card.review"; id: string; rating: Rating }
  | { type: "card.flag"; id: string; flag: ReviewCard["flag"] }
  | { type: "card.suspend"; id: string; suspended: boolean }
  | { type: "card.delete"; id: string }
  | { type: "exam.save"; exam: Exam }
  | { type: "exam.delete"; id: string }
  | { type: "task.save"; task: StudyTask }
  | { type: "task.delete"; id: string }
  | { type: "session.add"; session: StudySession }
  | {
      type: "material.update";
      id: string;
      patch: Partial<Pick<Material, "subjectId" | "lessonId" | "notes">>;
    }
  | { type: "material.remove"; id: string };
export interface MaterialPreview {
  kind: "pdf" | "image" | "text" | "external";
  name: string;
  data?: string;
  mime?: string;
}
export interface NativeApi {
  load(): Promise<AppState>;
  dispatch(command: Command): Promise<AppState>;
  importMaterials(context?: {
    subjectId?: string;
    lessonId?: string;
  }): Promise<AppState | null>;
  previewMaterial(id: string): Promise<MaterialPreview>;
  openMaterial(id: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  exportBackup(): Promise<string | null>;
  restoreBackup(): Promise<AppState | null>;
  getPaths(): Promise<{ data: string; backup: string }>;
}
declare global {
  interface Window {
    ninho?: NativeApi;
  }
}
