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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState, getMentorOverview } from "../domain";
import type { AppState, NativeApi, ReviewCard } from "../shared/types";
import { AppProvider } from "./store";
import Mentor from "./Mentor";

const now = new Date("2026-09-14T16:00:00.000Z");
function card(
  id: string,
  subjectId: string,
  patch: Partial<ReviewCard> = {},
): ReviewCard {
  return {
    id,
    subjectId,
    question: `Questão ${id}`,
    answer: `Resposta ${id}`,
    source: "Material estudado",
    sourceUrl: "https://www.estrategiaconcursos.com.br/",
    dueAt: "2026-09-20T16:00:00.000Z",
    lastReviewedAt: "2026-09-10T16:00:00.000Z",
    intervalDays: 10,
    ease: 2.5,
    repetitions: 3,
    lapses: 0,
    flag: "none",
    suspended: false,
    createdAt: "2026-09-01T16:00:00.000Z",
    ...patch,
  };
}
function fixture(): AppState {
  const state = createInitialState(now);
  return {
    ...state,
    subjects: [
      {
        id: "banco",
        name: "Banco de dados",
        track: "concurso",
        color: "#66895a",
      },
      {
        id: "portugues",
        name: "Língua Portuguesa",
        track: "concurso",
        color: "#8175a6",
      },
      {
        id: "literatura",
        name: "Literatura",
        track: "concurso",
        color: "#a6856b",
      },
    ],
    courses: [
      {
        id: "banco-curso",
        subjectId: "banco",
        title: "Senado Federal",
        provider: "Estratégia",
        url: "https://www.estrategiaconcursos.com.br/",
      },
    ],
    lessons: [
      {
        id: "banco-aula",
        courseId: "banco-curso",
        subjectId: "banco",
        title: "Aula 00",
        description: "Fundamentos de banco de dados",
        url: "https://www.estrategiaconcursos.com.br/",
        order: 0,
        status: "done",
        updatedAt: "2026-09-10T16:00:00.000Z",
        notes: "",
      },
    ],
    cards: [
      card("vencido", "banco", { dueAt: "2026-09-13T16:00:00.000Z" }),
      card("duvida", "banco", { flag: "relearn" }),
      card("fonte", "portugues", { flag: "outdated" }),
    ],
    exams: [
      {
        id: "prova1",
        title: "Prova de Banco de Dados",
        subjectId: "banco",
        date: "2026-09-15",
        time: "19:00",
        location: "Mauá",
        notes: "",
        completed: false,
      },
    ],
    tasks: [],
    materials: [],
    sessions: [
      {
        id: "sessao1",
        subjectId: "banco",
        lessonId: "",
        durationMinutes: 25,
        completedAt: "2026-09-14T15:00:00.000Z",
        kind: "focus",
      },
    ],
  };
}
function native(state: AppState): NativeApi {
  return {
    load: vi.fn(async () => structuredClone(state)),
    dispatch: vi.fn(),
    importMaterials: vi.fn(),
    previewMaterial: vi.fn(),
    openMaterial: vi.fn(),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    getPaths: vi.fn(),
  };
}
async function mount(state = fixture()) {
  const api = native(state),
    onNavigate = vi.fn(),
    openFocus = vi.fn();
  await act(async () => {
    render(
      <AppProvider nativeApi={api}>
        <Mentor onNavigate={onNavigate} openFocus={openFocus} />
      </AppProvider>,
    );
  });
  return { api, onNavigate, openFocus, state };
}
const log = () => screen.getByRole("log", { name: "Conversa com a Íris" });
const assistantMessages = () =>
  Array.from(log().querySelectorAll(".mentor-message.iris p")).map(
    (element) => element.textContent || "",
  );

describe("Íris: acompanhamento local baseado nos registros reais", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("separa cartões praticados, revisões, dúvidas e atualização de fontes sem fingir medir domínio", async () => {
    const { api } = await mount();
    expect(
      screen.getByRole("heading", { name: "Seu próximo passo, com a Íris." }),
    ).toBeInTheDocument();
    expect(screen.getByText("ASSISTENTE LOCAL")).toBeInTheDocument();
    expect(
      screen.getByText("cartões já praticados").closest("article"),
    ).toHaveTextContent("3");
    expect(
      screen.getByRole("button", { name: /1 revisões vencidas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1 dúvidas marcadas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1 fontes para conferir/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Isso não mede domínio da matéria/),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        /Não lê PDFs, não consulta sites e não usa IA generativa/,
      ),
    ).toBeInTheDocument();
    expect(api.dispatch).not.toHaveBeenCalled();
    expect(api.openExternal).not.toHaveBeenCalled();
  });

  it("mostra ausência de evidência como ausência de evidência, nunca como um nível baixo inventado", async () => {
    const state = fixture();
    state.cards = [];
    state.lessons[0].status = "not-started";
    state.sessions = [];
    state.exams = [];
    await mount(state);
    expect(screen.getAllByText("Evidência: sem evidência")).toHaveLength(3);
    expect(
      screen.getAllByText(
        "Ainda não há cartões suficientes para calcular a cobertura.",
      ),
    ).toHaveLength(3);
    expect(screen.queryByText(/0% de domínio/)).not.toBeInTheDocument();
    expect(screen.getByTestId("mentor-insight-literatura")).toHaveTextContent(
      "Literatura",
    );
  });

  it("filtra por matéria incluindo uma disciplina fora de TI e contextualiza as respostas", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Matéria para a Íris analisar"), {
      target: { value: "portugues" },
    });
    expect(screen.getByTestId("mentor-insight-portugues")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mentor-insight-banco"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mentor-insight-literatura"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pergunte à Íris")).toHaveAttribute(
      "placeholder",
      "O que revisar em Língua Portuguesa?",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "O que pode estar desatualizado?" }),
    );
    expect(within(log()).getAllByText("Língua Portuguesa")).toHaveLength(2);
    expect(assistantMessages().at(-1)).not.toMatch(/Banco de dados/);
  });

  it("usa os atalhos de sinais para distinguir esquecimento, dúvidas e fonte desatualizada", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /revisões vencidas/ }));
    expect(screen.getByLabelText("Filtrar sinais do estudo")).toHaveValue(
      "review",
    );
    expect(
      screen.queryByTestId("mentor-insight-portugues"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /fontes para conferir/ }),
    );
    expect(screen.getByLabelText("Filtrar sinais do estudo")).toHaveValue(
      "outdated",
    );
    expect(
      screen.queryByTestId("mentor-insight-banco"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("mentor-insight-portugues")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dúvidas marcadas/ }));
    expect(screen.getByTestId("mentor-insight-banco")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dúvidas marcadas/ }));
    expect(screen.getByLabelText("Filtrar sinais do estudo")).toHaveValue(
      "all",
    );
    expect(screen.getByTestId("mentor-insight-literatura")).toBeInTheDocument();
  });

  it("permite olhar matérias sem revisões e recuperar um filtro sem resultados", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Filtrar sinais do estudo"), {
      target: { value: "unknown" },
    });
    expect(screen.getByTestId("mentor-insight-literatura")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mentor-insight-banco"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Matéria para a Íris analisar"), {
      target: { value: "literatura" },
    });
    expect(screen.getByLabelText("Filtrar sinais do estudo")).toHaveValue(
      "all",
    );
    fireEvent.change(screen.getByLabelText("Filtrar sinais do estudo"), {
      target: { value: "outdated" },
    });
    expect(
      screen.getByText("Nenhuma matéria com esse sinal."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver todos os sinais" }),
    );
    expect(screen.getByTestId("mentor-insight-literatura")).toBeInTheDocument();
  });

  it("executa a ação concreta do plano e abre progresso, revisões e foco sem mudar os dados", async () => {
    const { state, onNavigate, openFocus, api } = await mount();
    const action = getMentorOverview(state, now).recommendations[0];
    fireEvent.click(screen.getByTestId(`mentor-plan-${action.id}`));
    if (action.target === "focus") expect(openFocus).toHaveBeenCalledOnce();
    else
      expect(onNavigate).toHaveBeenCalledWith(
        action.target,
        action.subjectId,
        action,
      );
    fireEvent.click(screen.getByRole("button", { name: "Ver progresso" }));
    expect(onNavigate).toHaveBeenLastCalledWith("progress", undefined);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir revisões de Banco de dados" }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith(
      "reviews",
      "banco",
      expect.objectContaining({
        id: "relearn:duvida",
        cardId: "duvida",
        target: "reviews",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir estudos de Literatura" }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith("studies", "literatura");
    fireEvent.click(
      screen.getByRole("button", { name: /^Reservar 25 minutos de foco$/ }),
    );
    expect(openFocus).toHaveBeenCalled();
    expect(api.dispatch).not.toHaveBeenCalled();
  });

  it("preserva os IDs da aula e do cartão ao executar uma recomendação concreta", async () => {
    const state = fixture();
    state.cards = [];
    state.exams = [];
    state.lessons[0].status = "in-progress";
    const { onNavigate } = await mount(state);
    const action = getMentorOverview(state, now).recommendations.find(
      (action) => action.lessonId === "banco-aula",
    )!;
    fireEvent.click(screen.getByTestId(`mentor-plan-${action.id}`));
    expect(onNavigate).toHaveBeenLastCalledWith(
      "studies",
      "banco",
      expect.objectContaining({
        lessonId: "banco-aula",
        id: "lesson:banco-aula",
      }),
    );
  });

  it("abre uma fonte marcada no cartão exato a partir do diagnóstico e da conversa", async () => {
    const { onNavigate } = await mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abrir revisões de Língua Portuguesa",
      }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith(
      "reviews",
      "portugues",
      expect.objectContaining({
        id: "source:fonte",
        cardId: "fonte",
        target: "reviews",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "O que pode estar desatualizado?" }),
    );
    fireEvent.click(
      within(log()).getByRole("button", {
        name: "Conferir fonte · Língua Portuguesa",
      }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith(
      "reviews",
      "portugues",
      expect.objectContaining({ id: "source:fonte", cardId: "fonte" }),
    );
  });

  it("leva a matéria selecionada ao foco, inclusive em ação da conversa", async () => {
    const { openFocus } = await mount();
    fireEvent.change(screen.getByLabelText("Matéria para a Íris analisar"), {
      target: { value: "portugues" },
    });
    const reserve = screen.getAllByRole("button", {
      name: /^Reservar 25 minutos de foco$/,
    });
    fireEvent.click(reserve[0]);
    expect(openFocus).toHaveBeenLastCalledWith("portugues");
    fireEvent.change(screen.getByLabelText("Pergunte à Íris"), {
      target: { value: "Quanto tempo de foco?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar pergunta à Íris" }),
    );
    fireEvent.click(
      within(log()).getByRole("button", { name: "Abrir cronômetro de foco" }),
    );
    expect(openFocus).toHaveBeenLastCalledWith("portugues");
  });

  it.each([
    "O que estudar hoje?",
    "Onde preciso melhorar?",
    "Esqueci algum assunto?",
    "O que pode estar desatualizado?",
  ])("responde à pergunta sugerida com motor real: %s", async (question) => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: question }));
    expect(within(log()).getByText(question)).toBeInTheDocument();
    expect(assistantMessages()).toHaveLength(2);
    expect(assistantMessages()[1].length).toBeGreaterThan(30);
    expect(assistantMessages()[1]).not.toContain(
      "Experimente “o que estudar hoje?”",
    );
    expect(screen.getByLabelText("Pergunte à Íris")).toHaveValue("");
  });

  it("envia texto por botão ou Enter, ignora espaços e mantém Shift+Enter disponível", async () => {
    await mount();
    const input = screen.getByLabelText("Pergunte à Íris");
    const send = screen.getByRole("button", { name: "Enviar pergunta à Íris" });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: "   " } });
    expect(send).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(assistantMessages()).toHaveLength(1);
    fireEvent.change(input, {
      target: { value: "Tenho alguma prova próxima?" },
    });
    fireEvent.click(send);
    expect(
      within(log()).getByText("Tenho alguma prova próxima?"),
    ).toBeInTheDocument();
    expect(assistantMessages()).toHaveLength(2);
    fireEvent.change(input, {
      target: { value: "Como posso estudar com foco?" },
    });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(assistantMessages()).toHaveLength(2);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(assistantMessages()).toHaveLength(3);
    expect(input).toHaveAttribute("maxlength", "1000");
  });

  it("executa uma ação oferecida na conversa e limpa apenas a conversa local", async () => {
    const { onNavigate, api } = await mount();
    const input = screen.getByLabelText("Pergunte à Íris");
    fireEvent.change(input, {
      target: { value: "Tenho alguma prova próxima?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar pergunta à Íris" }),
    );
    const actions = within(log()).getAllByRole("button");
    expect(actions.length).toBeGreaterThan(0);
    fireEvent.click(actions[0]);
    expect(onNavigate).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Limpar conversa com a Íris" }),
    );
    expect(assistantMessages()).toHaveLength(1);
    expect(
      within(log()).queryByText("Tenho alguma prova próxima?"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("mentor-insight-banco")).toBeInTheDocument();
    expect(api.dispatch).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("explica a falta de suporte para perguntas fora do acompanhamento sem inventar uma resposta", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Pergunte à Íris"), {
      target: { value: "Qual é o resultado de 217 vezes 839?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar pergunta à Íris" }),
    );
    expect(assistantMessages().at(-1)).toMatch(/local|registros|revis|estud/i);
    expect(assistantMessages().at(-1)).not.toContain("182063");
  });
});
