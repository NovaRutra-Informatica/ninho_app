import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createInitialState,
  getLessonStudyStats,
  validateState,
} from "./index";
import type { AppState, StudySession } from "../shared/types";

const now = new Date("2026-09-14T16:00:00Z");
const a = "240830:aula:00",
  b = "240830:aula:01",
  subjectId = "banco-de-dados";
const session = (patch: Partial<StudySession> = {}): StudySession => ({
  id: "focus-lesson",
  subjectId,
  lessonId: a,
  durationMinutes: 1.25 / 60,
  completedAt: now.toISOString(),
  kind: "focus",
  ...patch,
});

describe("recorded time per lesson", () => {
  it("starts every real lesson at zero with no synthetic sessions", () => {
    const state = createInitialState(now),
      stats = getLessonStudyStats(state);
    expect(Object.keys(stats)).toHaveLength(271);
    expect(stats[a]).toEqual({ durationMinutes: 0, sessionCount: 0 });
    expect(stats[""]).toBeUndefined();
  });
  it("sums precise durations separately and excludes untimed reviews and generic focus", () => {
    const state = createInitialState(now);
    state.sessions = [
      session(),
      session({ id: "second", durationMinutes: 10 }),
      session({ id: "other", lessonId: b, durationMinutes: 25 }),
      session({ id: "general", lessonId: "", durationMinutes: 30 }),
      session({ id: "review", kind: "review", durationMinutes: 0 }),
    ];
    const original = JSON.stringify(state),
      stats = getLessonStudyStats(state);
    expect(stats[a]).toEqual({
      durationMinutes: 10 + 1.25 / 60,
      sessionCount: 2,
    });
    expect(stats[b]).toEqual({ durationMinutes: 25, sessionCount: 1 });
    expect(JSON.stringify(state)).toBe(original);
  });
  it("saves lesson focus through the existing command without marking a lesson done", () => {
    const state = createInitialState(now);
    const next = applyCommand(
      state,
      { type: "session.add", session: session() },
      now,
    );
    expect(next.lessons).toEqual(state.lessons);
    expect(next.version).toBe(2);
    expect(getLessonStudyStats(next)[a].sessionCount).toBe(1);
    expect(() =>
      applyCommand(next, { type: "session.add", session: session() }, now),
    ).toThrow(/já foi registrada/);
  });
  it.each([
    { lessonId: "missing" },
    { subjectId: "literatura" },
    { subjectId: "" },
  ])("rejects missing or mismatched session references: %j", (patch) => {
    const state = createInitialState(now),
      invalid = session(patch);
    expect(() =>
      applyCommand(state, { type: "session.add", session: invalid }, now),
    ).toThrow(/aula/);
    expect(() => validateState({ ...state, sessions: [invalid] })).toThrow(
      /aula/,
    );
  });
  it("preserves lesson attribution and totals through JSON backup migration and v2 reload", () => {
    const state = applyCommand(
      createInitialState(now),
      { type: "session.add", session: session({ durationMinutes: 12.5 }) },
      now,
    );
    const reloaded = validateState(JSON.parse(JSON.stringify(state)));
    const { programs: _, ...base } = state;
    const legacy = {
      ...base,
      version: 1,
      subjects: state.subjects.map(({ programId: _, ...subject }) => subject),
    };
    expect(validateState(legacy)).toEqual(reloaded);
    expect(getLessonStudyStats(reloaded)[a]).toEqual({
      durationMinutes: 12.5,
      sessionCount: 1,
    });
    expect(reloaded.sessions).toEqual(state.sessions);
  });
  it("does not attribute a malformed orphan session to another existing lesson", () => {
    const state: AppState = createInitialState(now);
    state.sessions = [
      session({ lessonId: "missing" }),
      session({ subjectId: "literatura" }),
    ];
    expect(getLessonStudyStats(state)[a]).toEqual({
      durationMinutes: 0,
      sessionCount: 0,
    });
  });
});
