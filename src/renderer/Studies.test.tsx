// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, Material, NativeApi } from "../shared/types";
import { AppProvider, useApp } from "./store";
import Studies from "./Studies";
import { FocusModal, useFocus } from "./Focus";

const now = new Date("2026-09-14T16:00:00Z");
function Harness({
  initialSubject = "",
  initialLesson = "",
}: {
  initialSubject?: string;
  initialLesson?: string;
}) {
  const [selected, setSelected] = useState(initialSubject);
  const { act } = useApp();
  const focus = useFocus();
  const [focusOpen, setFocusOpen] = useState(false);
  return (
    <>
      <Studies
        selected={selected}
        setSelected={setSelected}
        selectedLesson={initialLesson}
        openLessonFocus={(lesson) => {
          focus.selectLesson(lesson.id);
          setFocusOpen(true);
        }}
        activeFocus={
          focus.timer.mode === "focus" && focus.hasProgress
            ? { lessonId: focus.timer.lessonId, running: focus.timer.running }
            : undefined
        }
        renderMaterials={(subjectId) => (
          <div data-testid="embedded-materials">
            Materiais vinculados a {subjectId}
            <button
              onClick={() =>
                void act({ type: "settings.update", patch: { sound: true } })
              }
            >
              Atualizar sem sair dos materiais
            </button>
          </div>
        )}
      />
      {focusOpen && (
        <FocusModal focus={focus} close={() => setFocusOpen(false)} />
      )}
    </>
  );
}
async function mount(
  initial = createInitialState(now),
  props: { initialSubject?: string; initialLesson?: string } = {},
) {
  let state = initial;
  const api: NativeApi = {
    load: vi.fn(async () => state),
    dispatch: vi.fn(async (command) => {
      state = applyCommand(state, command, new Date());
      return state;
    }),
    importMaterials: vi.fn(),
    previewMaterial: vi.fn(),
    openMaterial: vi.fn(),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    getPaths: vi.fn(),
  };
  await act(async () => {
    render(
      <AppProvider nativeApi={api}>
        <Harness {...props} />
      </AppProvider>,
    );
  });
  return {
    api,
    get: () => state,
    replaceStored: (next: AppState) => {
      state = next;
      return state;
    },
  };
}
async function save(name: string) {
  const dialog = screen.queryByRole("dialog");
  await act(async () =>
    fireEvent.click(
      (dialog ? within(dialog) : screen).getByRole("button", { name }),
    ),
  );
}
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

function materialsFixture() {
  const state = createInitialState(now);
  const material = (
    id: string,
    index: number,
    name: string,
    lessonId: string,
    subjectId = "banco-de-dados",
  ): Material => ({
    id,
    name,
    storedName: `5fa7d2ad-a99d-4000-8000-${String(index).padStart(12, "0")}.pdf`,
    type: "pdf",
    size: 28,
    subjectId,
    lessonId,
    notes: "",
    createdAt: now.toISOString(),
  });
  state.materials = [
    material("doc-a", 1, "Banco de Dados — Aula 00.pdf", "240830:aula:00"),
    material("doc-b", 2, "Banco de Dados — Aula 01.pdf", "240830:aula:01"),
    material("doc-general", 3, "Material geral da matéria.pdf", ""),
    material(
      "doc-literatura",
      4,
      "Literatura — Aula 00.pdf",
      state.lessons.find((lesson) => lesson.subjectId === "literatura")!.id,
      "literatura",
    ),
  ];
  return state;
}

describe("courses first study hierarchy", () => {
  it("starts with Senado and Mauá programs, then shows only their own subjects", async () => {
    await mount();
    expect(screen.getByTestId("program-senado-federal")).toHaveTextContent(
      "14 matérias",
    );
    expect(screen.getByTestId("program-maua")).toHaveTextContent("1 matéria");
    expect(screen.queryByTestId("subject-literatura")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("program-senado-federal"));
    expect(screen.getByTestId("subject-literatura")).toBeInTheDocument();
    expect(
      screen.queryByTestId("subject-ciencia-da-computacao"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todos os cursos" }));
    fireEvent.click(screen.getByTestId("program-maua"));
    expect(
      screen.getByTestId("subject-ciencia-da-computacao"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("subject-literatura")).not.toBeInTheDocument();
  });
  it("creates a new course and its subject at the right hierarchy levels", async () => {
    const { get } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Novo curso" }));
    change("Nome do curso", "Inglês pessoal");
    change("Objetivo", "pessoal");
    change("Descrição", "Meu curso de idiomas.");
    await save("Criar curso");
    const program = get().programs.find(
      (program) => program.name === "Inglês pessoal",
    )!;
    expect(program).toBeTruthy();
    fireEvent.click(screen.getByTestId(`program-${program.id}`));
    fireEvent.click(screen.getByRole("button", { name: "Nova matéria" }));
    expect(screen.getByLabelText("Curso")).toHaveValue(program.id);
    change("Nome da matéria", "Conversação");
    await save("Criar matéria");
    const subject = get().subjects.find(
      (subject) => subject.name === "Conversação",
    )!;
    expect(subject).toMatchObject({ programId: program.id, track: "pessoal" });
    expect(screen.getByTestId(`subject-${subject.id}`)).toBeInTheDocument();
  });
  it("edits course metadata without changing child IDs or recorded history", async () => {
    const initial = createInitialState(now),
      { get } = await mount(initial);
    fireEvent.click(screen.getByTestId("program-maua"));
    fireEvent.click(screen.getByRole("button", { name: "Editar curso" }));
    change("Nome do curso", "Mauá — último semestre");
    change("Descrição", "Ciência da Computação");
    await save("Salvar curso");
    expect(
      screen.getByRole("heading", { level: 1, name: "Mauá — último semestre" }),
    ).toBeInTheDocument();
    expect(get().subjects).toEqual(initial.subjects);
    expect(get().cards).toEqual(initial.cards);
    expect(get().lessons).toEqual(initial.lessons);
  });
  it("resolves an incoming subject and lesson deep link without forcing program navigation", async () => {
    await mount(createInitialState(now), {
      initialSubject: "banco-de-dados",
      initialLesson: "240830:aula:02",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Banco de dados" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Voltar para Senado Federal" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lesson-row-240830:aula:02")).toHaveClass(
      "expanded",
    );
    expect(
      screen.getByTestId("lesson-notes-240830:aula:02"),
    ).toBeInTheDocument();
  });
  it("keeps subject materials scoped and open after an unrelated state update", async () => {
    await mount(createInitialState(now), { initialSubject: "literatura" });
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    expect(screen.getByTestId("embedded-materials")).toHaveTextContent(
      "literatura",
    );
    await save("Atualizar sem sair dos materiais");
    expect(screen.getByRole("tab", { name: /Materiais/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Aulas" }));
    expect(screen.queryByTestId("embedded-materials")).not.toBeInTheDocument();
  });
  it("adds modules and lessons inside a subject instead of creating an extra top-level course", async () => {
    const { get } = await mount(createInitialState(now), {
      initialSubject: "ciencia-da-computacao",
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar módulo" }));
    change("Nome do módulo", "Sistemas distribuídos");
    change("Instituição ou fonte", "Mauá");
    await save("Adicionar módulo");
    expect(get().programs).toHaveLength(2);
    const module = get().courses.find(
      (course) => course.title === "Sistemas distribuídos",
    )!;
    expect(module.subjectId).toBe("ciencia-da-computacao");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar aula" }));
    change("Nome da aula", "Consenso");
    await save("Adicionar aula");
    expect(get().lessons.at(-1)).toMatchObject({
      courseId: module.id,
      title: "Consenso",
    });
  });
  it("searches course contents and preserves back navigation to the program", async () => {
    await mount();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar curso ou conteúdo…" }),
      { target: { value: "Literatura" } },
    );
    expect(screen.getByTestId("program-senado-federal")).toBeInTheDocument();
    expect(screen.queryByTestId("program-maua")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("program-senado-federal"));
    fireEvent.click(screen.getByTestId("subject-literatura"));
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar para Senado Federal" }),
    );
    expect(
      screen.getByRole("heading", { name: "Senado Federal", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("subject-literatura")).toBeInTheDocument();
  });
  it("shows exact recorded time and session counts separately for each lesson", async () => {
    const initial = createInitialState(now);
    initial.sessions = [
      {
        id: "a-1",
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:00",
        durationMinutes: 60,
        kind: "focus",
        completedAt: now.toISOString(),
      },
      {
        id: "a-2",
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:00",
        durationMinutes: 2,
        kind: "focus",
        completedAt: now.toISOString(),
      },
      {
        id: "b",
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:01",
        durationMinutes: 0.5,
        kind: "focus",
        completedAt: now.toISOString(),
      },
      {
        id: "general",
        subjectId: "banco-de-dados",
        lessonId: "",
        durationMinutes: 25,
        kind: "focus",
        completedAt: now.toISOString(),
      },
      {
        id: "review",
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:01",
        durationMinutes: 0,
        kind: "review",
        completedAt: now.toISOString(),
      },
    ];
    await mount(initial, { initialSubject: "banco-de-dados" });
    expect(screen.getByTestId("lesson-time-240830:aula:00")).toHaveTextContent(
      "1 h 2 min · 2 sessões",
    );
    expect(screen.getByTestId("lesson-time-240830:aula:01")).toHaveTextContent(
      "30 s · 1 sessão",
    );
    expect(screen.getByTestId("lesson-time-240830:aula:02")).toHaveTextContent(
      "0 s · 0 sessões",
    );
  });

  it("opens a lesson timer without starting it, keeps the running indicator across modal closing and updates the saved total", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { get } = await mount(createInitialState(now), {
      initialSubject: "banco-de-dados",
    });
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:00"));
    expect(screen.getByTestId("focus-lesson")).toHaveTextContent(
      "Banco de dados · Aula 00",
    );
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByTestId("focus-timer")).toHaveTextContent("25:00");
    expect(get().sessions).toHaveLength(0);
    await save("Começar foco");
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    expect(
      screen.getByTestId("lesson-focus-active-240830:aula:00"),
    ).toHaveTextContent("Cronômetro rodando");
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:00"));
    await save("Pausar");
    expect(
      screen.getByTestId("lesson-focus-active-240830:aula:00"),
    ).toHaveTextContent("Cronômetro pausado");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await save("Concluir sessão");
    expect(screen.getByTestId("lesson-time-240830:aula:00")).toHaveTextContent(
      "1 s · 1 sessão",
    );
    expect(
      screen.queryByTestId("lesson-focus-active-240830:aula:00"),
    ).not.toBeInTheDocument();
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 1.5 / 60,
    });
    expect(
      get().lessons.find((lesson) => lesson.id === "240830:aula:00")?.status,
    ).toBe("not-started");
  });

  it("opens the original paused session when another lesson asks for focus and never transfers its time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { get } = await mount(createInitialState(now), {
      initialSubject: "banco-de-dados",
    });
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:00"));
    await save("Começar foco");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await save("Pausar");
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:01"));
    expect(screen.getByRole("status")).toHaveTextContent("Conclua ou reinicie");
    expect(screen.getByLabelText("Aula")).toHaveValue("240830:aula:00");
    await save("Concluir sessão");
    expect(get().sessions[0].lessonId).toBe("240830:aula:00");
    expect(screen.getByTestId("lesson-time-240830:aula:01")).toHaveTextContent(
      "0 s · 0 sessões",
    );
  });
  it("shows existing files only inside their exact lesson, with a visible count and no reimport", async () => {
    const initial = materialsFixture();
    const { api } = await mount(initial, { initialSubject: "banco-de-dados" });
    expect(
      screen.getByTestId("lesson-open-materials-240830:aula:00"),
    ).toHaveTextContent("Materiais (1)");
    expect(
      screen.queryByTestId("lesson-materials-240830:aula:00"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes de Aula 00" }),
    );
    const section = within(
      screen.getByTestId("lesson-materials-240830:aula:00"),
    );
    expect(
      section.getByRole("heading", { name: "Materiais desta aula" }),
    ).toBeInTheDocument();
    expect(section.getByTestId("material-row-doc-a")).toHaveTextContent(
      "Banco de Dados — Aula 00.pdf",
    );
    expect(screen.queryByTestId("material-row-doc-b")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-doc-general"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-doc-literatura"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anexar arquivo" }),
    ).not.toBeInTheDocument();
    expect(
      section.getByRole("button", { name: "Adicionar arquivos à aula" }),
    ).toBeInTheDocument();
    expect(api.importMaterials).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:01"));
    expect(screen.queryByTestId("material-row-doc-a")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("lesson-materials-240830:aula:01"),
    ).toHaveTextContent("Banco de Dados — Aula 01.pdf");
    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes de Aula 01" }),
    );
    expect(
      screen.queryByTestId("lesson-materials-240830:aula:01"),
    ).not.toBeInTheDocument();
  });

  it("preserves unsaved lesson notes while showing materials, collapsing and opening a neighboring lesson", async () => {
    const { api, get } = await mount(materialsFixture(), {
      initialSubject: "banco-de-dados",
      initialLesson: "240830:aula:00",
    });
    fireEvent.change(screen.getByTestId("lesson-notes-240830:aula:00"), {
      target: { value: "Anotação ainda não salva" },
    });
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:00"));
    expect(screen.getByTestId("lesson-row-240830:aula:00")).toHaveClass(
      "expanded",
    );
    expect(screen.getByTestId("lesson-notes-240830:aula:00")).toHaveValue(
      "Anotação ainda não salva",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes de Aula 00" }),
    );
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:01"));
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:00"));
    expect(screen.getByTestId("lesson-notes-240830:aula:00")).toHaveValue(
      "Anotação ainda não salva",
    );
    expect(
      get().lessons.find((lesson) => lesson.id === "240830:aula:00")?.notes,
    ).toBe("");
    expect(api.dispatch).not.toHaveBeenCalled();
  });

  it("imports with the exact lesson context and retains typed lesson notes across the material update", async () => {
    const { api, get, replaceStored } = await mount(materialsFixture(), {
      initialSubject: "banco-de-dados",
      initialLesson: "240830:aula:00",
    });
    fireEvent.change(screen.getByTestId("lesson-notes-240830:aula:00"), {
      target: { value: "Notas durante a importação" },
    });
    api.importMaterials = vi.fn(async (context) => {
      const next = {
        ...get(),
        materials: [
          ...get().materials,
          {
            ...get().materials[0],
            ...context,
            id: "new-doc-a",
            name: "Arquivo novo.pdf",
            storedName: "dd012a52-8776-4d00-b000-932608e59414.pdf",
          },
        ],
      };
      return replaceStored(next);
    });
    await save("Adicionar arquivos à aula");
    expect(api.importMaterials).toHaveBeenCalledExactlyOnceWith({
      subjectId: "banco-de-dados",
      lessonId: "240830:aula:00",
    });
    expect(
      screen.getByTestId("lesson-materials-240830:aula:00"),
    ).toHaveTextContent("Arquivo novo.pdf");
    expect(
      screen.getByTestId("lesson-open-materials-240830:aula:00"),
    ).toHaveTextContent("Materiais (2)");
    expect(screen.getByTestId("lesson-notes-240830:aula:00")).toHaveValue(
      "Notas durante a importação",
    );
    await save("Salvar anotações");
    expect(
      get().lessons.find((lesson) => lesson.id === "240830:aula:00")?.notes,
    ).toBe("Notas durante a importação");
    expect(get().materials).toHaveLength(5);
  });

  it("keeps a lesson focus session running while its files are opened and neighboring materials are inspected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { get } = await mount(materialsFixture(), {
      initialSubject: "banco-de-dados",
    });
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:00"));
    await save("Começar foco");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:00"));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    fireEvent.click(screen.getByTestId("lesson-open-materials-240830:aula:01"));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(
      screen.getByTestId("lesson-focus-active-240830:aula:00"),
    ).toHaveTextContent("Cronômetro rodando");
    fireEvent.click(screen.getByTestId("lesson-focus-240830:aula:00"));
    await save("Concluir sessão");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 20 / 60,
    });
  });
});
