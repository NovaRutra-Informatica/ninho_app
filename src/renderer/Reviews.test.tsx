// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, NativeApi, ReviewCard } from "../shared/types";
import { AppProvider } from "./store";
import Reviews from "./Reviews";

const now = new Date("2026-09-14T16:00:00.000Z");
function fixture(): AppState {
  const initial = createInitialState(now);
  const base: ReviewCard = {
    id: "revisao",
    subjectId: "banco-de-dados",
    question: "O que é uma transação?",
    answer: "Uma unidade lógica de trabalho.",
    source: "Aula 00",
    sourceUrl: "",
    dueAt: now.toISOString(),
    lastReviewedAt: "2026-09-13T16:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    repetitions: 1,
    lapses: 0,
    flag: "none",
    suspended: false,
    createdAt: "2026-09-01T16:00:00.000Z",
  };
  return {
    ...initial,
    cards: [
      base,
      {
        ...base,
        id: "literatura-fonte",
        subjectId: "literatura",
        question: "O que conferir em Literatura?",
        answer: "A referência original.",
        flag: "outdated",
      },
      {
        ...base,
        id: "duvida",
        question: "Como funciona um índice?",
        answer: "Estrutura auxiliar de acesso.",
        flag: "relearn",
      },
    ],
    sessions: [],
  };
}
function native(initial = fixture()) {
  let state = initial;
  const api: NativeApi = {
    load: vi.fn(async () => structuredClone(state)),
    dispatch: vi.fn(async (command) => {
      state = applyCommand(state, command, new Date());
      return structuredClone(state);
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
  api: NativeApi,
  props: Parameters<typeof Reviews>[0] = {},
) {
  await act(async () => {
    render(
      <AppProvider nativeApi={api}>
        <Reviews {...props} />
      </AppProvider>,
    );
  });
}
function reveal() {
  fireEvent.click(screen.getByRole("button", { name: "Começar revisão" }));
  fireEvent.click(screen.getByRole("button", { name: /Revelar resposta/ }));
}

describe("revisões em uso real", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("não avalia antes de revelar e registra uma resposta com agendamento real", async () => {
    const { api, get } = native();
    await mount(api, { initialSubject: "literatura" });
    fireEvent.click(screen.getByRole("button", { name: "Começar revisão" }));
    fireEvent.keyDown(document.body, { key: "3" });
    expect(api.dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    expect(screen.getByTestId("card-review-answer")).toHaveTextContent(
      "A referência original.",
    );
    await act(async () => fireEvent.keyDown(document.body, { key: "3" }));
    expect(
      get().cards.find((card) => card.id === "literatura-fonte")?.repetitions,
    ).toBe(2);
    expect(get().sessions).toHaveLength(1);
    expect(
      screen.getByText("1 conhecimentos revisitados."),
    ).toBeInTheDocument();
  });

  it("bloqueia duas avaliações rápidas enquanto a gravação está pendente", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    let release!: () => void;
    api.dispatch = vi.fn(async (command) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(command);
    });
    await mount(api, { initialSubject: "literatura" });
    reveal();
    const rate = screen.getByRole("button", { name: /^3\s*Lembrei/ });
    await act(async () => {
      fireEvent.click(rate);
      fireEvent.click(rate);
      fireEvent.keyDown(document.body, { key: "3" });
    });
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    expect(rate).toBeDisabled();
    await act(async () => release());
    expect(get().sessions).toHaveLength(1);
    expect(
      get().cards.find((card) => card.id === "literatura-fonte")?.repetitions,
    ).toBe(2);
  });

  it("mantém o cartão para tentar de novo quando a gravação falha", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    api.dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disco cheio"))
      .mockImplementation(original);
    await mount(api, { initialSubject: "literatura" });
    reveal();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^3\s*Lembrei/ })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Disco cheio");
    expect(screen.getByTestId("card-review-answer")).toBeInTheDocument();
    expect(get().sessions).toHaveLength(0);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^3\s*Lembrei/ })),
    );
    expect(get().sessions).toHaveLength(1);
  });

  it("esconde a resposta quando uma revisão que acaba de vencer muda o primeiro cartão", async () => {
    const state = fixture();
    const existing = {
      ...state.cards[0],
      dueAt: new Date(now.getTime() + 10_000).toISOString(),
    };
    const fresh: ReviewCard = {
      ...existing,
      id: "novo",
      question: "Pergunta nova",
      answer: "Resposta nova",
      dueAt: now.toISOString(),
      lastReviewedAt: null,
      repetitions: 0,
      lapses: 0,
      intervalDays: 0,
    };
    state.cards = [existing, fresh];
    const { api } = native(state);
    await mount(api);
    reveal();
    expect(screen.getByTestId("card-review-question")).toHaveTextContent(
      "Pergunta nova",
    );
    expect(screen.getByTestId("card-review-answer")).toHaveTextContent(
      "Resposta nova",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("card-review-question")).toHaveTextContent(
      "O que é uma transação?",
    );
    expect(screen.queryByTestId("card-review-answer")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Revelar resposta/ }),
    ).toBeInTheDocument();
    expect(api.dispatch).not.toHaveBeenCalled();
  });

  it("abre a fonte indicada pela Íris no acervo correto, com destaque e foco no cartão", async () => {
    const { api } = native();
    await mount(api, {
      initialSubject: "literatura",
      initialMode: "library",
      initialFilter: "outdated",
      initialCard: "literatura-fonte",
    });
    expect(screen.getByLabelText("Filtrar matéria")).toHaveValue("literatura");
    expect(screen.getByLabelText("Filtrar cartões")).toHaveValue("outdated");
    const target = screen.getByTestId("card-library-literatura-fonte");
    expect(target).toHaveClass("mentor-target");
    expect(target).toHaveFocus();
    expect(
      screen.queryByTestId("card-library-revisao"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Começar revisão" }),
    ).not.toBeInTheDocument();
  });

  it("abre apenas os cartões para reaprender no deep link de dificuldade", async () => {
    const { api } = native();
    await mount(api, {
      initialSubject: "banco-de-dados",
      initialMode: "library",
      initialFilter: "relearn",
      initialCard: "duvida",
    });
    expect(screen.getByTestId("card-library-duvida")).toHaveFocus();
    expect(
      screen.queryByTestId("card-library-revisao"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("card-library-literatura-fonte"),
    ).not.toBeInTheDocument();
  });

  it("orienta a criar uma matéria em uma coleção vazia sem abrir um formulário inválido", async () => {
    const state = fixture();
    state.subjects = [];
    state.courses = [];
    state.lessons = [];
    state.cards = [];
    const { api } = native(state);
    await mount(api, { initialMode: "library" });
    expect(screen.getByRole("button", { name: "Novo cartão" })).toBeDisabled();
    expect(
      screen.getByText(
        "Crie uma matéria em Meus estudos para começar a guardar seus cartões.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo cartão" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.dispatch).not.toHaveBeenCalled();
  });
});
