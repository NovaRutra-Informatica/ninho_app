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
        programId: "senado-federal",
        color: "#66895a",
      },
      {
        id: "portugues",
        name: "Língua Portuguesa",
        track: "concurso",
        programId: "senado-federal",
        color: "#8175a6",
      },
      {
        id: "literatura",
        name: "Literatura",
        track: "concurso",
        programId: "senado-federal",
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
    aiStatus: vi.fn(async () => ({
      available: true,
      models: [{ id: "qwen/test-4b", name: "Modelo de teste", loaded: true }],
      activeModel: "qwen/test-4b",
      busy: false,
      endpoint: "http://127.0.0.1:1234",
      idleMinutes: 5,
    })),
    aiChat: vi.fn(async (request) => ({
      requestId: request.requestId,
      modelId: request.modelId,
      content:
        "Podemos rever um exemplo de Língua Portuguesa e praticar juntos.",
    })),
    aiCancel: vi.fn(async () => {}),
    aiUnload: vi.fn(async () => {}),
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
      screen.getByRole("heading", { name: "Minha assistente" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ACOMPANHAMENTO LOCAL")).toBeInTheDocument();
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
      screen.getByText(/Arquivos e vídeos não são lidos automaticamente/),
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

  it("filtra matérias e acompanha registros sem abrir ou consultar um modelo", async () => {
    const { api, onNavigate } = await mount();
    fireEvent.change(screen.getByLabelText("Matéria para a Íris analisar"), {
      target: { value: "portugues" },
    });
    expect(screen.getByTestId("mentor-insight-portugues")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mentor-insight-banco"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-chat")).not.toBeInTheDocument();
    expect(api.aiStatus).not.toHaveBeenCalled();
    expect(api.aiChat).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Editar meu perfil e recursos opcionais/,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith("profile");
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

  it("abre uma fonte marcada no cartão exato a partir do diagnóstico", async () => {
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
  });

  it("leva a matéria selecionada ao foco", async () => {
    const { openFocus } = await mount();
    fireEvent.change(screen.getByLabelText("Matéria para a Íris analisar"), {
      target: { value: "portugues" },
    });
    const reserve = screen.getAllByRole("button", {
      name: /^Reservar 25 minutos de foco$/,
    });
    fireEvent.click(reserve[0]);
    expect(openFocus).toHaveBeenLastCalledWith("portugues");
  });
});
