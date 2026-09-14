import { describe, expect, it } from "vitest";
import { applyCommand, createInitialState, validateState } from "./index";
import type { AppState, Material } from "../shared/types";

const now = new Date("2026-09-14T16:00:00Z");
function legacy(state: AppState) {
  const { programs: _, ...rest } = state;
  return {
    ...rest,
    version: 1,
    subjects: state.subjects.map(({ programId: _, ...subject }) => subject),
  };
}

describe("v1 to v2 study hierarchy migration", () => {
  it("creates the two initial study programs and keeps the entire mapped catalog", () => {
    const state = createInitialState(now);
    expect(state.version).toBe(2);
    expect(state.programs.map((program) => program.id)).toEqual([
      "senado-federal",
      "maua",
    ]);
    expect(
      state.subjects.filter(
        (subject) => subject.programId === "senado-federal",
      ),
    ).toHaveLength(14);
    expect(
      state.subjects.filter((subject) => subject.programId === "maua"),
    ).toHaveLength(1);
    expect(state.lessons).toHaveLength(271);
    expect(state.cards).toHaveLength(71);
    expect(state.courses).toHaveLength(20);
  });
  it("migrates a v1 backup without altering notes, files, exams, review scheduling or user history", () => {
    let state = createInitialState(now);
    state = applyCommand(
      state,
      {
        type: "lesson.update",
        id: "240830:aula:00",
        patch: { status: "done", notes: "Minha anotação preservada." },
      },
      now,
    );
    state = applyCommand(
      state,
      { type: "card.review", id: state.cards[0].id, rating: "again" },
      now,
    );
    state = applyCommand(
      state,
      { type: "card.flag", id: state.cards[0].id, flag: "outdated" },
      now,
    );
    state = applyCommand(
      state,
      {
        type: "exam.save",
        exam: {
          id: "my-exam",
          subjectId: "ciencia-da-computacao",
          title: "Prova anotada",
          date: "2026-10-01",
          time: "19:00",
          location: "Mauá",
          notes: "Levar material",
          completed: false,
        },
      },
      now,
    );
    state.materials.push({
      id: "my-material",
      name: "Minhas notas.pdf",
      storedName: "0e7aad73-6a22-4c22-93a2-0d01a1cc0d0f.pdf",
      type: "pdf",
      size: 20,
      subjectId: "banco-de-dados",
      lessonId: "240830:aula:00",
      createdAt: now.toISOString(),
      notes: "PDF anexado",
    });
    const old = legacy(state),
      originalJSON = JSON.stringify(old);
    expect(validateState(old)).toEqual(state);
    expect(JSON.stringify(old)).toBe(originalJSON);
    expect(validateState(JSON.parse(JSON.stringify(old)))).toEqual(state);
  });
  it("creates Outros only when an old personal subject requires it", () => {
    const state = applyCommand(
      createInitialState(now),
      {
        type: "subject.save",
        subject: {
          id: "personal",
          name: "Música",
          track: "pessoal",
          color: "#aabbcc",
        },
      },
      now,
    );
    const migrated = validateState(legacy(state));
    expect(
      migrated.programs.find((program) => program.id === "outros")?.name,
    ).toBe("Outros estudos");
    expect(
      migrated.subjects.find((subject) => subject.id === "personal")?.programId,
    ).toBe("outros");
    expect(
      validateState(legacy(createInitialState(now))).programs.some(
        (program) => program.id === "outros",
      ),
    ).toBe(false);
  });
  it("is idempotent for v2 and rejects unknown versions or malformed old backups", () => {
    const state = createInitialState(now);
    expect(validateState(validateState(state))).toEqual(state);
    expect(() =>
      validateState({ ...legacy(state), extra: "untrusted" }),
    ).toThrow();
    expect(() => validateState({ ...legacy(state), version: 3 })).toThrow();
    const malformed = legacy(state);
    malformed.subjects[0].track = "invalid" as never;
    expect(() => validateState(malformed)).toThrow();
  });
  it("rejects missing program references, track mismatches and duplicated program IDs", () => {
    const state = createInitialState(now);
    state.subjects[0].programId = "missing";
    expect(() => validateState(state)).toThrow(/curso/);
    const mismatch = createInitialState(now);
    mismatch.subjects[0].programId = "maua";
    expect(() => validateState(mismatch)).toThrow(/objetivo/);
    const duplicate = createInitialState(now);
    duplicate.programs.push(duplicate.programs[0]);
    expect(() => validateState(duplicate)).toThrow(/duplicados/);
  });
});

describe("study program editing and compatibility", () => {
  it("creates and renames programs without changing children or historical IDs", () => {
    const before = createInitialState(now),
      program = {
        id: "new-course",
        name: "Novo concurso",
        track: "concurso" as const,
        color: "#112233",
        description: "Objetivo pessoal.",
      };
    let state = applyCommand(before, { type: "program.save", program }, now);
    state = applyCommand(
      state,
      {
        type: "subject.save",
        subject: {
          id: "new-subject",
          programId: program.id,
          name: "Português",
          track: "concurso",
          color: "#223344",
        },
      },
      now,
    );
    state = applyCommand(
      state,
      {
        type: "program.save",
        program: { ...program, name: "Concurso corrigido", track: "pessoal" },
      },
      now,
    );
    expect(state.programs).toHaveLength(3);
    expect(
      state.subjects.find((subject) => subject.id === "new-subject"),
    ).toMatchObject({ programId: "new-course", track: "pessoal" });
    expect(state.cards).toEqual(before.cards);
    expect(state.lessons).toEqual(before.lessons);
    expect(before.programs).toHaveLength(2);
  });
  it("normalizes old subject.save commands without requiring new fields", () => {
    const initial = createInitialState(now);
    const state = applyCommand(
      initial,
      {
        type: "subject.save",
        subject: {
          id: "legacy-command",
          name: "Redes II",
          track: "faculdade",
          color: "#aabbcc",
        },
      },
      now,
    );
    expect(
      state.subjects.find((subject) => subject.id === "legacy-command")
        ?.programId,
    ).toBe("maua");
    const existing = state.subjects.find(
      (subject) => subject.id === "legacy-command",
    )!;
    const { programId: _, ...oldSubject } = existing;
    expect(
      applyCommand(
        state,
        {
          type: "subject.save",
          subject: { ...oldSubject, name: "Redes renomeada" },
        },
        now,
      ).subjects.find((subject) => subject.id === existing.id)?.programId,
    ).toBe("maua");
  });
  it("preserves a custom program when editing a subject through an old command", () => {
    let state = applyCommand(
      createInitialState(now),
      {
        type: "program.save",
        program: {
          id: "custom",
          name: "Concurso futuro",
          track: "concurso",
          color: "#223344",
          description: "",
        },
      },
      now,
    );
    state = applyCommand(
      state,
      {
        type: "subject.save",
        subject: {
          id: "custom-subject",
          programId: "custom",
          name: "Direito",
          track: "concurso",
          color: "#445566",
        },
      },
      now,
    );
    state = applyCommand(
      state,
      {
        type: "subject.save",
        subject: {
          id: "custom-subject",
          name: "Direito atualizado",
          track: "concurso",
          color: "#445566",
        },
      },
      now,
    );
    expect(
      state.subjects.find((subject) => subject.id === "custom-subject")
        ?.programId,
    ).toBe("custom");
  });
  it("moves a subject to another program while preserving its modules, cards and lessons", () => {
    const initial = createInitialState(now),
      subject = initial.subjects[0];
    const state = applyCommand(
      initial,
      {
        type: "subject.save",
        subject: { ...subject, programId: "maua", track: "faculdade" },
      },
      now,
    );
    expect(state.subjects[0].programId).toBe("maua");
    expect(state.cards).toEqual(initial.cards);
    expect(state.lessons).toEqual(initial.lessons);
    expect(state.courses).toEqual(initial.courses);
  });
  it("validates program labels and explicit subject links", () => {
    const initial = createInitialState(now);
    expect(() =>
      applyCommand(
        initial,
        {
          type: "program.save",
          program: {
            id: "bad",
            name: " ",
            track: "pessoal",
            color: "#123456",
            description: "",
          },
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyCommand(
        initial,
        {
          type: "subject.save",
          subject: { ...initial.subjects[0], programId: "missing" },
        },
        now,
      ),
    ).toThrow(/curso/);
  });
});

describe("large study media metadata", () => {
  const file = (type: string, size: number): Material => ({
    id: "media",
    name: `Aula.${type}`,
    storedName: `0e7aad73-6a22-4c22-93a2-0d01a1cc0d0f.${type}`,
    type,
    size,
    subjectId: "",
    lessonId: "",
    createdAt: now.toISOString(),
    notes: "",
  });
  it.each([
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
  ])("allows up to2GiB of %s without reading the file into memory", (type) => {
    expect(
      validateState({
        ...createInitialState(now),
        materials: [file(type, 2 * 1024 ** 3)],
      }).materials,
    ).toHaveLength(1);
    expect(() =>
      validateState({
        ...createInitialState(now),
        materials: [file(type, 2 * 1024 ** 3 + 1)],
      }),
    ).toThrow();
  });
  it("keeps the100MiB limit for ordinary documents and rejects executables", () => {
    expect(() =>
      validateState({
        ...createInitialState(now),
        materials: [file("pdf", 100 * 1024 ** 2 + 1)],
      }),
    ).toThrow(/100 MiB/);
    expect(() =>
      validateState({
        ...createInitialState(now),
        materials: [file("exe", 100)],
      }),
    ).toThrow();
  });
});
