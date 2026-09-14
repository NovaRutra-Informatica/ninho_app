// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../domain";
import type {
  AiChatReply,
  AiChatRequest,
  AiStatus,
  NativeApi,
} from "../shared/types";
import { AppProvider } from "./store";
import AiChat from "./AiChat";

afterEach(cleanup);
const status = (patch: Partial<AiStatus> = {}): AiStatus => ({
  available: true,
  models: [
    {
      id: "qwen4b",
      name: "Qwen 4B",
      loaded: false,
      recommended: true,
      sizeBytes: 2.5e9,
    },
    {
      id: "large32b",
      name: "Grande 32B",
      loaded: false,
      blockedReason: "Muito grande",
    },
  ],
  activeModel: null,
  ownedModel: null,
  busy: false,
  endpoint: "http://127.0.0.1:1234",
  idleMinutes: 5,
  ...patch,
});
function fixture(patch: Partial<NativeApi> = {}, subjectId = "") {
  const state = createInitialState();
  const unavailable = vi.fn(async () => {
    throw new Error("Unavailable");
  });
  const api: NativeApi = {
    load: async () => state,
    dispatch: unavailable,
    importMaterials: unavailable,
    previewMaterial: unavailable,
    openMaterial: unavailable,
    openExternal: unavailable,
    exportBackup: unavailable,
    restoreBackup: unavailable,
    getPaths: unavailable,
    aiStatus: vi.fn(async () => status()),
    aiChat: vi.fn(async (request) => ({
      requestId: request.requestId,
      modelId: request.modelId,
      content: "Vamos praticar chaves estrangeiras.",
    })),
    aiCancel: vi.fn(async () => undefined),
    aiUnload: vi.fn(async () => undefined),
    ...patch,
  };
  const view = render(
    <AppProvider nativeApi={api}>
      <AiChat subjectId={subjectId} />
    </AppProvider>,
  );
  return { api, state, ...view };
}
async function ready() {
  await screen.findByRole("option", { name: /Qwen 4B/ });
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Modelo de IA" })).toHaveValue(
      "qwen4b",
    ),
  );
}
async function ask(text = "Explique chave estrangeira") {
  await ready();
  fireEvent.change(screen.getByRole("textbox", { name: "Converse com Íris" }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar à Íris" }));
}

describe("conversa real da Íris pela ponte nativa", () => {
  it("consulta status sem iniciar inferência e bloqueia modelos grandes", async () => {
    const { api } = fixture();
    await ready();
    expect(api.aiStatus).toHaveBeenCalledTimes(1);
    expect(api.aiChat).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: /Grande 32B/ })).toBeDisabled();
    expect(screen.getByText(/5 minutos/)).toBeVisible();
  });
  it("envia pergunta com contexto da matéria e continua a conversa com resposta anterior", async () => {
    const { api } = fixture({}, createInitialState().subjects[0].id);
    await ask();
    await screen.findByText("Vamos praticar chaves estrangeiras.");
    expect(api.aiChat).toHaveBeenLastCalledWith(
      expect.objectContaining({
        subjectId: createInitialState().subjects[0].id,
        modelId: "qwen4b",
        messages: [{ role: "user", content: "Explique chave estrangeira" }],
      }),
    );
    await ask("Pode dar um exemplo?");
    await waitFor(() => expect(api.aiChat).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.aiChat!).mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Explique chave estrangeira" },
      { role: "assistant", content: "Vamos praticar chaves estrangeiras." },
      { role: "user", content: "Pode dar um exemplo?" },
    ]);
  });
  it("sugestão envia uma pergunta real, sem resposta por regras", async () => {
    const { api } = fixture();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Por onde eu começo hoje?" }),
    );
    await screen.findByText("Vamos praticar chaves estrangeiras.");
    expect(api.aiChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "Por onde eu começo hoje?" }],
      }),
    );
  });
  it("interrompe o pedido exato e preserva pergunta para tentar novamente", async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<AiChatReply>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const chat = vi.fn((_request: AiChatRequest) => pending);
    const cancel = vi.fn(async () => {
      reject(new Error("Resposta interrompida."));
    });
    fixture({ aiChat: chat, aiCancel: cancel });
    await ask("Minha pergunta");
    expect(await screen.findByText(/Preparando sua resposta/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Interromper" }));
    await screen.findByRole("alert");
    expect(cancel).toHaveBeenCalledExactlyOnceWith(
      chat.mock.calls[0][0]?.requestId,
    );
    expect(
      screen.getByRole("textbox", { name: "Converse com Íris" }),
    ).toHaveValue("Minha pergunta");
  });
  it("evita envio duplicado durante o mesmo pedido e cancela ao sair", async () => {
    const chat = vi.fn(
      (_request: AiChatRequest) => new Promise<AiChatReply>(() => undefined),
    );
    const { api, unmount } = fixture({ aiChat: chat });
    await ask();
    expect(
      screen.getByRole("textbox", { name: "Converse com Íris" }),
    ).toBeDisabled();
    expect(chat).toHaveBeenCalledTimes(1);
    unmount();
    expect(api.aiCancel).toHaveBeenCalledWith(chat.mock.calls[0][0]?.requestId);
  });
  it("falha do servidor aparece e mantém o rascunho", async () => {
    fixture({
      aiChat: vi.fn(async () => {
        throw new Error(
          "Error invoking remote method 'ninho:ai:chat': Error: Servidor indisponível",
        );
      }),
    });
    await ask("Teste");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Servidor indisponível",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Error invoking remote method",
    );
    expect(
      screen.getByRole("textbox", { name: "Converse com Íris" }),
    ).toHaveValue("Teste");
  });
  it("primeiro envio está disponível com servidor desconectado e modelo local listado", async () => {
    const { api } = fixture({
      aiStatus: vi.fn(async () =>
        status({
          available: false,
          error: "O servidor será iniciado ao enviar.",
        }),
      ),
    });
    await ask();
    await screen.findByText("Vamos praticar chaves estrangeiras.");
    expect(api.aiChat).toHaveBeenCalledTimes(1);
  });
  it("liberar memória chama a operação própria e atualiza estado", async () => {
    const get = vi.fn(async () => status({ ownedModel: "qwen4b" }));
    const { api } = fixture({ aiStatus: get });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Liberar memória" }));
    await waitFor(() => expect(api.aiUnload).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("nova conversa remove o histórico usado no próximo pedido", async () => {
    const { api } = fixture();
    await ask();
    await screen.findByText("Vamos praticar chaves estrangeiras.");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Nova conversa" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    await ask("Outro assunto");
    await waitFor(() => expect(api.aiChat).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.aiChat!).mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Outro assunto" },
    ]);
  });
  it("texto de resposta não executa HTML", async () => {
    fixture({
      aiChat: async (request) => ({
        requestId: request.requestId,
        modelId: request.modelId,
        content: "<img src=x onerror=alert(1)>",
      }),
    });
    await ask();
    expect(
      await screen.findByText("<img src=x onerror=alert(1)>"),
    ).toBeVisible();
    expect(document.querySelector("img[src=x]")).toBeNull();
  });
  it("formata negrito e código sem habilitarHTML oulinks executáveis", async () => {
    fixture({
      aiChat: async (request) => ({
        requestId: request.requestId,
        modelId: request.modelId,
        content: "Uma **chave estrangeira** usa `id_turma`.",
      }),
    });
    await ask();
    expect((await screen.findByText("chave estrangeira")).tagName).toBe(
      "STRONG",
    );
    expect(screen.getByText("id_turma").tagName).toBe("CODE");
  });
  it("ausência de ponte nativa mostra orientação e não oferece envio", async () => {
    fixture({ aiChat: undefined, aiStatus: undefined });
    expect(
      await screen.findByText(/aplicativo Ninho para Windows/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Enviar à Íris" }),
    ).not.toBeInTheDocument();
  });
  it("erro ao consultar a conexão mantém a orientação sem o envelope IPC", async () => {
    fixture({
      aiStatus: vi.fn(async () => {
        throw new Error(
          "Error invoking remote method 'ninho:ai:status': Error: Abra o LM Studio e tente novamente.",
        );
      }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Abra o LM Studio e tente novamente.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Error invoking remote method",
    );
    expect(
      screen.getByRole("button", { name: "Atualizar conexão da IA" }),
    ).toBeEnabled();
  });
  it("normaliza o erro informado dentro do status do modelo", async () => {
    fixture({
      aiStatus: vi.fn(async () =>
        status({
          available: false,
          error:
            "Error invoking remote method 'ninho:ai:status': Error: Modelo temporariamente indisponível.",
        }),
      ),
    });
    await ready();
    expect(
      screen.getByText(/Modelo temporariamente indisponível/),
    ).not.toHaveTextContent("Error invoking remote method");
  });

  it("remove o erro de conexão quando Atualizar recupera o LM Studio", async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'ninho:ai:status': Error: Não foi possível conectar.",
        ),
      )
      .mockResolvedValueOnce(status());
    fixture({ aiStatus: getStatus });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível conectar.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar conexão da IA" }),
    );
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/LM Studio conectado/)).toBeInTheDocument();
  });

  it("uma consulta antiga não restaura o estado do modelo após liberar memória", async () => {
    let stale!: (value: AiStatus) => void;
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(status({ ownedModel: "qwen4b" }))
      .mockImplementationOnce(
        () =>
          new Promise<AiStatus>((resolve) => {
            stale = resolve;
          }),
      )
      .mockResolvedValueOnce(status({ ownedModel: null }));
    fixture({ aiStatus: getStatus });
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar conexão da IA" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Liberar memória" }));
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Liberar memória" }),
      ).not.toBeInTheDocument(),
    );
    await act(async () => stale(status({ ownedModel: "qwen4b" })));
    expect(
      screen.queryByRole("button", { name: "Liberar memória" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Atualizar conexão da IA" }),
    ).toBeEnabled();
  });
});
