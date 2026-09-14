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
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, NativeApi } from "../shared/types";
import { AppProvider } from "./store";
import { CardForm, CourseForm, LessonForm, SubjectForm } from "./forms";
import Studies from "./Studies";

const now = new Date("2026-09-14T16:00:00.000Z");
function fixture() {
  let state = createInitialState(now);
  state = applyCommand(
    state,
    {
      type: "subject.save",
      subject: {
        id: "maua-test",
        name: "Sistemas Distibuídos",
        track: "faculdade",
        color: "#668899",
      },
    },
    now,
  );
  state = applyCommand(
    state,
    {
      type: "course.save",
      course: {
        id: "course-test",
        subjectId: "maua-test",
        title: "Curso com erro",
        provider: "Mauá",
        url: "https://maua.br/curso",
      },
    },
    now,
  );
  state = applyCommand(
    state,
    {
      type: "lesson.save",
      lesson: {
        id: "lesson-test",
        courseId: "course-test",
        subjectId: "maua-test",
        title: "Aula com erro",
        description: "Conteúdo original",
        url: "https://maua.br/aula",
        order: 4,
      },
    },
    now,
  );
  state = applyCommand(
    state,
    {
      type: "lesson.update",
      id: "lesson-test",
      patch: { status: "in-progress", notes: "Minhas anotações importantes." },
    },
    now,
  );
  state = applyCommand(
    state,
    {
      type: "card.save",
      card: {
        id: "card-test",
        subjectId: "maua-test",
        lessonId: "lesson-test",
        question: "O que é consenso?",
        answer: "Acordo entre participantes.",
        source: "Aula estudada",
        sourceUrl: "",
      },
    },
    now,
  );
  state = applyCommand(
    state,
    { type: "card.review", id: "card-test", rating: "good" },
    now,
  );
  return state;
}
function native(initial: AppState) {
  let state = initial;
  const api: NativeApi = {
    load: vi.fn(async () => structuredClone(state)),
    dispatch: vi.fn(async (command) => {
      state = applyCommand(state, command, now);
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
  return { api, get: () => state };
}
async function mount(
  children: ReactNode,
  initial = fixture(),
  providedApi?: NativeApi,
) {
  const context = native(initial),
    api = providedApi || context.api;
  await act(async () => {
    render(<AppProvider nativeApi={api}>{children}</AppProvider>);
  });
  return { ...context, api };
}
async function save(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("editing catalog entries through real domain commands", () => {
  it("edits an existing subject without replacing IDs or affecting linked courses and reviews", async () => {
    const initial = fixture(),
      subject = initial.subjects.find((subject) => subject.id === "maua-test")!,
      close = vi.fn();
    const { get, api } = await mount(
      <SubjectForm subject={subject} close={close} />,
      initial,
    );
    expect(
      screen.getByRole("dialog", { name: "Editar matéria" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da matéria")).toHaveValue(
      "Sistemas Distibuídos",
    );
    change("Nome da matéria", "Sistemas Distribuídos");
    change("Curso", "senado-federal");
    change("Cor", "#aabbcc");
    await save("Salvar matéria");
    expect(
      get().subjects.find((subject) => subject.id === "maua-test"),
    ).toMatchObject({
      name: "Sistemas Distribuídos",
      track: "concurso",
      programId: "senado-federal",
      color: "#aabbcc",
    });
    expect(get().subjects).toHaveLength(initial.subjects.length);
    expect(get().courses).toEqual(initial.courses);
    expect(get().cards).toEqual(initial.cards);
    expect(get().sessions).toEqual(initial.sessions);
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("edits course title, platform and URL in place", async () => {
    const initial = fixture(),
      course = initial.courses.find((course) => course.id === "course-test")!,
      close = vi.fn();
    const { get } = await mount(
      <CourseForm subjectId={course.subjectId} course={course} close={close} />,
      initial,
    );
    expect(screen.getByLabelText("Nome do módulo")).toHaveValue(
      "Curso com erro",
    );
    expect(screen.getByLabelText("Link do módulo")).toHaveValue(
      "https://maua.br/curso",
    );
    change("Nome do módulo", "Sistemas Distribuídos — último semestre");
    change("Instituição ou fonte", "Instituto Mauá de Tecnologia");
    change("Link do módulo", "https://maua.br/curso-corrigido");
    await save("Salvar módulo");
    expect(
      get().courses.find((course) => course.id === "course-test"),
    ).toMatchObject({
      title: "Sistemas Distribuídos — último semestre",
      provider: "Instituto Mauá de Tecnologia",
      url: "https://maua.br/curso-corrigido",
      subjectId: "maua-test",
    });
    expect(get().courses).toHaveLength(initial.courses.length);
    expect(get().lessons).toEqual(initial.lessons);
    expect(get().cards).toEqual(initial.cards);
    expect(close).toHaveBeenCalledOnce();
  });

  it("edits lesson metadata without submitting or changing notes, status, order and review history", async () => {
    const initial = fixture(),
      lesson = initial.lessons.find((lesson) => lesson.id === "lesson-test")!,
      course = initial.courses.find((course) => course.id === lesson.courseId)!,
      close = vi.fn();
    const { get, api } = await mount(
      <LessonForm lesson={lesson} course={course} close={close} />,
      initial,
    );
    change("Nome da aula", "Consenso e replicação");
    change("Conteúdo", "Replicação, quóruns e consenso");
    change("Link da aula", "https://maua.br/aula-corrigida");
    await save("Salvar aula");
    expect(get().lessons.find((lesson) => lesson.id === "lesson-test")).toEqual(
      {
        ...lesson,
        title: "Consenso e replicação",
        description: "Replicação, quóruns e consenso",
        url: "https://maua.br/aula-corrigida",
      },
    );
    expect(get().lessons).toHaveLength(initial.lessons.length);
    expect(get().cards).toEqual(initial.cards);
    expect(get().sessions).toEqual(initial.sessions);
    const dispatched = vi.mocked(api.dispatch).mock.calls[0][0];
    expect(dispatched.type).toBe("lesson.save");
    if (dispatched.type === "lesson.save") {
      expect(dispatched.lesson).not.toHaveProperty("notes");
      expect(dispatched.lesson).not.toHaveProperty("status");
    }
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["subject", "course", "lesson"])(
    "cancels %s edits without dispatching changes",
    async (kind) => {
      const state = fixture(),
        subject = state.subjects.find((subject) => subject.id === "maua-test")!,
        course = state.courses.find((course) => course.id === "course-test")!,
        lesson = state.lessons.find((lesson) => lesson.id === "lesson-test")!,
        close = vi.fn();
      const form =
        kind === "subject" ? (
          <SubjectForm subject={subject} close={close} />
        ) : kind === "course" ? (
          <CourseForm course={course} subjectId={subject.id} close={close} />
        ) : (
          <LessonForm lesson={lesson} course={course} close={close} />
        );
      const { api, get } = await mount(form, state);
      change(
        kind === "subject"
          ? "Nome da matéria"
          : kind === "course"
            ? "Nome do módulo"
            : "Nome da aula",
        "Rascunho não salvo",
      );
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(close).toHaveBeenCalledOnce();
      expect(api.dispatch).not.toHaveBeenCalled();
      expect(get()).toEqual(state);
    },
  );

  it("keeps an unsuccessful edit open without announcing success or dropping original data", async () => {
    const state = fixture(),
      course = state.courses.find((course) => course.id === "course-test")!,
      close = vi.fn(),
      api = native(state).api;
    api.dispatch = vi
      .fn()
      .mockRejectedValue(new Error("Sem espaço para salvar"));
    await mount(
      <CourseForm course={course} subjectId={course.subjectId} close={close} />,
      state,
      api,
    );
    change("Nome do módulo", "Título tentado");
    await save("Salvar módulo");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sem espaço para salvar",
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar módulo" })).toBeEnabled();
    expect(screen.queryByText("Módulo atualizado.")).not.toBeInTheDocument();
  });

  it("keeps the original creation labels and still creates a new lesson", async () => {
    const close = vi.fn(),
      state = fixture(),
      course = state.courses[0];
    await mount(<SubjectForm close={close} />, state);
    expect(
      screen.getByRole("dialog", { name: "Um novo caminho" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar matéria" }),
    ).toBeInTheDocument();
    cleanup();
    await mount(
      <CourseForm subjectId={course.subjectId} close={close} />,
      state,
    );
    expect(
      screen.getByRole("dialog", { name: "Adicionar módulo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar módulo" }),
    ).toBeInTheDocument();
    cleanup();
    const { get } = await mount(
      <LessonForm course={course} close={close} />,
      state,
    );
    expect(
      screen.getByRole("dialog", { name: "Adicionar aula" }),
    ).toBeInTheDocument();
    change("Nome da aula", "Aula nova pessoal");
    await save("Adicionar aula");
    expect(get().lessons).toHaveLength(state.lessons.length + 1);
    expect(get().lessons.at(-1)).toMatchObject({
      title: "Aula nova pessoal",
      status: "not-started",
      notes: "",
      courseId: course.id,
    });
  });

  it("does not crash or allow saving a card before a subject exists", async () => {
    const state = createInitialState(now);
    state.subjects = [];
    state.courses = [];
    state.lessons = [];
    state.cards = [];
    const { api } = await mount(<CardForm close={vi.fn()} />, state);
    expect(
      screen.getByText(
        "Crie uma matéria em Meus estudos antes de adicionar um cartão.",
      ),
    ).toBeInTheDocument();
    change("Pergunta", "Pergunta sem matéria");
    change("Resposta", "Resposta");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(api.dispatch).not.toHaveBeenCalled();
  });
});

describe("Studies editor entry points", () => {
  it("opens the correct editors and updates the visible catalog while preserving lesson notes and progress", async () => {
    const initial = fixture();
    const { get } = await mount(
      <Studies
        selected="maua-test"
        setSelected={vi.fn()}
        selectedLesson="lesson-test"
      />,
      initial,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar matéria" }));
    change("Nome da matéria", "Sistemas Distribuídos");
    await save("Salvar matéria");
    expect(
      screen.getByRole("heading", { name: "Sistemas Distribuídos", level: 1 }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar módulo Curso com erro" }),
    );
    change("Nome do módulo", "Curso corrigido");
    await save("Salvar módulo");
    expect(
      screen.getByRole("heading", { name: "Curso corrigido" }),
    ).toBeInTheDocument();
    const row = screen.getByTestId("lesson-row-lesson-test");
    fireEvent.click(
      within(row).getByRole("button", { name: "Editar aula Aula com erro" }),
    );
    change("Nome da aula", "Aula corrigida");
    change("Link da aula", "https://maua.br/aula-corrigida");
    await save("Salvar aula");
    expect(
      within(row).getByRole("button", { name: /Aula corrigida.*Em estudo/ }),
    ).toBeInTheDocument();
    expect(within(row).getByTestId("lesson-notes-lesson-test")).toHaveValue(
      "Minhas anotações importantes.",
    );
    expect(
      get().lessons.find((lesson) => lesson.id === "lesson-test"),
    ).toMatchObject({
      status: "in-progress",
      notes: "Minhas anotações importantes.",
      url: "https://maua.br/aula-corrigida",
    });
    expect(get().cards).toEqual(initial.cards);
    expect(get().sessions).toEqual(initial.sessions);
  });
});
