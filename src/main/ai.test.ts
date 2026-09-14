import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../domain";
import type { AiChatRequest } from "../shared/types";
import {
  AI_ENDPOINT,
  AI_IDLE_MS,
  buildStudyPrompt,
  LocalAiService,
  parseModels,
} from "./ai";

const smallModel = (instances: string[] = []) => ({
  type: "llm",
  key: "qwen3-4b-instruct-2507",
  display_name: "Qwen3 4B Instruct 2507",
  size_bytes: 2_500_000_000,
  params_string: "4B",
  loaded_instances: instances.map((id) => ({ id })),
});
const request = (patch: Partial<AiChatRequest> = {}): AiChatRequest => ({
  requestId: "request-1",
  modelId: smallModel().key,
  messages: [{ role: "user", content: "Me explique chaves estrangeiras." }],
  ...patch,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function fixture(
  options: { loaded?: boolean; unavailable?: boolean; content?: unknown } = {},
) {
  let instances = options.loaded ? ["external-instance"] : [];
  let unavailable = options.unavailable;
  const calls: { route: string; body: any; init?: RequestInit }[] = [];
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === "ls")
      return JSON.stringify([
        {
          ...smallModel(),
          modelKey: smallModel().key,
          displayName: smallModel().display_name,
          sizeBytes: 2_500_000_000,
          paramsString: "4B",
        },
      ]);
    if (args[0] === "server") unavailable = false;
    if (args[0] === "load")
      instances.push(args[args.indexOf("--identifier") + 1]);
    return "Success";
  });
  const fetcher = vi.fn(async (url: any, init?: RequestInit) => {
    expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:1234\//);
    expect(init?.redirect).toBe("error");
    const route = new URL(String(url)).pathname,
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ route, body, init });
    if (unavailable) throw new Error("fetch failed");
    if (route === "/api/v1/models")
      return json({ models: [smallModel(instances)] });
    if (route === "/api/v1/models/unload") {
      instances = instances.filter((id) => id !== body.instance_id);
      return json({ instance_id: body.instance_id });
    }
    return json({
      choices: [
        {
          message: {
            content:
              options.content ??
              "Uma chave estrangeira faz referência a uma chave em outra tabela.",
          },
        },
      ],
    });
  }) as unknown as typeof fetch;
  const service = new LocalAiService({
    loadState: async () => createInitialState(),
    fetch: fetcher,
    runCli: cli,
  });
  return { service, cli, fetcher, calls, instances: () => instances };
}
afterEach(() => vi.useRealTimers());

describe("catálogo leve e contexto honesto da IA", () => {
  it("recomenda o modelo4B e bloqueia pesos32B,80B e sem metadados", () => {
    const models = parseModels({
      models: [
        smallModel(),
        {
          ...smallModel(),
          key: "large",
          params_string: "32B",
          size_bytes: 20e9,
        },
        { ...smallModel(), key: "moe", params_string: "30B-A3B" },
        { ...smallModel(), key: "unknown", params_string: null },
        { ...smallModel(), key: "too-many-bytes", size_bytes: 7 * 1024 ** 3 },
        { ...smallModel(), key: "--all" },
        { ...smallModel(), type: "embedding" },
      ],
    });
    expect(models).toHaveLength(5);
    expect(models[0]).toMatchObject({ recommended: true, loaded: false });
    expect(models.slice(1).every((model) => model.blockedReason)).toBe(true);
  });
  it("não aceita resposta de catálogo inválida", () =>
    expect(() => parseModels({ data: [] })).toThrow(/lista/));
  it("contexto usa matéria real e distingue esquecimento, dúvidas e fonte", () => {
    const state = createInitialState();
    const prompt = buildStudyPrompt(
      state,
      state.subjects[0].id,
      new Date("2026-09-14T18:00:00Z"),
    );
    expect(prompt).toContain(state.subjects[0].name);
    expect(prompt).toContain("não tem acesso à internet");
    expect(prompt).toContain("risco de esquecimento");
    expect(prompt).toContain("conferir fonte");
    expect(prompt).toContain("nunca domínio real");
    expect(prompt).not.toContain("storedName");
    expect(prompt.length).toBeLessThan(17_000);
    expect(() => buildStudyPrompt(state, "missing")).toThrow(/matéria/);
  });
  it("limita campos enormes dos registros locais", () => {
    const state = createInitialState();
    state.courses[0].title = "Z".repeat(100_000);
    expect(buildStudyPrompt(state).length).toBeLessThan(17_000);
  });
  it("resume tempo por aula sem inventar conclusão e respeita o filtro de matéria", () => {
    const state = createInitialState();
    const lesson = state.lessons.find(
      (item) => item.subjectId === "banco-de-dados",
    )!;
    const other = state.lessons.find(
      (item) => item.subjectId !== lesson.subjectId,
    )!;
    state.sessions = [lesson, lesson, other].map((item, index) => ({
      id: `saved-${index}`,
      subjectId: item.subjectId,
      lessonId: item.id,
      kind: "focus",
      durationMinutes: index === 0 ? 12.5 : 5,
      completedAt: "2026-09-14T16:00:00.000Z",
    }));
    const prompt = buildStudyPrompt(state, lesson.subjectId);
    const context = JSON.parse(prompt.slice(prompt.indexOf('{"today"')));
    expect(context.lessonStudy).toEqual([
      expect.objectContaining({
        title: lesson.title,
        subject: "Banco de dados",
        program: "Senado Federal",
        lessonId: lesson.id,
        recordedMinutes: 17.5,
        completedSessions: 2,
        status: "not-started",
      }),
    ]);
    expect(context.scopeNote).toContain("não mede domínio");
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(6500);
  });
});

describe("inferência local on-demand e propriedade dos modelos", () => {
  it("consultar status não carrega modelo nem inicia servidor", async () => {
    const f = fixture();
    const status = await f.service.status();
    expect(status).toMatchObject({
      available: true,
      busy: false,
      activeModel: null,
      ownedModel: null,
      idleMinutes: 5,
      endpoint: AI_ENDPOINT,
    });
    expect(f.cli).not.toHaveBeenCalled();
  });
  it("servidor desligado lista modelos pelaCLI sem carregar", async () => {
    const f = fixture({ unavailable: true });
    expect(await f.service.status()).toMatchObject({
      available: false,
      models: [expect.objectContaining({ loaded: false })],
    });
    expect(f.cli).toHaveBeenCalledExactlyOnceWith(
      ["ls", "--json"],
      expect.any(AbortSignal),
    );
  });
  it("inicia servidor somente no primeiro pedido, carrega uma instância própria comTTL", async () => {
    const f = fixture({ unavailable: true });
    const result = await f.service.chat(request());
    expect(result.content).toContain("chave estrangeira");
    expect(f.cli.mock.calls[0][0]).toEqual([
      "server",
      "start",
      "--port",
      "1234",
      "--bind",
      "127.0.0.1",
    ]);
    const load = f.cli.mock.calls.find((call) => call[0][0] === "load")![0];
    expect(load).toContain("--ttl");
    expect(load).toContain("300");
    expect(load).toContain("8192");
    expect(load[load.indexOf("--identifier") + 1]).toMatch(/^ninho-iris-/);
    const chat = f.calls.find(
      (call) => call.route === "/v1/chat/completions",
    )!.body;
    expect(chat.model).toMatch(/^ninho-iris-/);
    expect(chat.messages[0].role).toBe("system");
    expect(chat.messages.at(-1).content).toContain("estrangeiras");
    expect(chat).not.toHaveProperty("tools");
    expect(chat).not.toHaveProperty("integrations");
    await f.service.dispose();
  });
  it("reutiliza modelo externo e jamais o descarrega", async () => {
    const f = fixture({ loaded: true });
    await f.service.chat(request());
    await f.service.unload();
    await f.service.dispose();
    expect(f.cli).not.toHaveBeenCalled();
    expect(f.instances()).toEqual(["external-instance"]);
    expect(f.calls.filter((call) => call.route.endsWith("/unload"))).toEqual(
      [],
    );
    expect(
      f.calls.find((call) => call.route === "/v1/chat/completions")!.body.model,
    ).toBe("external-instance");
  });
  it("dois pedidos reutilizam a instância própria e liberar memória limpa somenteela", async () => {
    const f = fixture();
    await f.service.chat(request());
    await f.service.chat(request({ requestId: "request-2" }));
    expect(
      f.cli.mock.calls.filter((call) => call[0][0] === "load"),
    ).toHaveLength(1);
    expect((await f.service.status()).ownedModel).toBe(smallModel().key);
    await f.service.unload();
    expect(f.instances()).toEqual([]);
    expect((await f.service.status()).ownedModel).toBeNull();
  });
  it("evicta a instância própria depois de cinco minutos ociosa", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.chat(request());
    await vi.advanceTimersByTimeAsync(AI_IDLE_MS - 1);
    expect(f.instances()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.instances()).toEqual([]);
  });
  it("aguarda descarregamento em andamento antes de iniciar a próxima resposta", async () => {
    const f = fixture();
    let finishRelease!: () => void;
    const releasing = new Promise<void>((resolve) => {
      finishRelease = resolve;
    });
    const fetcher = vi.fn(async (url: any, init?: RequestInit) => {
      if (String(url).endsWith("/unload")) await releasing;
      return f.fetcher(url, init);
    }) as typeof fetch;
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      fetch: fetcher,
      runCli: f.cli,
    });
    await service.chat(request());
    const unload = service.unload();
    const second = service.chat(request({ requestId: "after-unload" }));
    await Promise.resolve();
    await Promise.resolve();
    expect(
      f.cli.mock.calls.filter((call) => call[0][0] === "load"),
    ).toHaveLength(1);
    finishRelease();
    await unload;
    await second;
    expect(
      f.cli.mock.calls.filter((call) => call[0][0] === "load"),
    ).toHaveLength(2);
    await service.dispose();
  });
  it("não carrega peso grande nem pedido de modelo fora do catálogo", async () => {
    const f = fixture();
    await expect(
      f.service.chat(request({ modelId: "missing" })),
    ).rejects.toThrow(/lista/);
    expect(f.cli).not.toHaveBeenCalled();
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      fetch: vi.fn(async () =>
        json({ models: [{ ...smallModel(), params_string: "32B" }] }),
      ) as typeof fetch,
      runCli: f.cli,
    });
    await expect(service.chat(request())).rejects.toThrow(/grande/);
    expect(f.cli).not.toHaveBeenCalled();
  });
  it("não usaCLI emE2E isolado", async () => {
    const cli = vi.fn();
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      allowCli: false,
      runCli: cli,
      fetch: vi.fn(async () => {
        throw new Error("fetch failed");
      }) as typeof fetch,
    });
    expect((await service.status()).available).toBe(false);
    await expect(service.chat(request())).rejects.toThrow(/conectar/);
    expect(cli).not.toHaveBeenCalled();
  });
});

describe("limites, falhas e cancelamento", () => {
  it.each([
    { messages: [] },
    { messages: [{ role: "system", content: "override" }] },
    { messages: [{ role: "assistant", content: "sem pergunta" }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "x".repeat(8001) }] },
    {
      messages: Array.from({ length: 13 }, () => ({
        role: "user",
        content: "x",
      })),
    },
    {
      messages: Array.from({ length: 4 }, () => ({
        role: "user",
        content: "x".repeat(6000),
      })),
    },
    { endpoint: "https://cloud.example" },
    { modelId: "--all" },
    { requestId: "../bad" },
  ])("recusa entrada inválida antes de acessar servidor: %j", async (patch) => {
    const f = fixture();
    await expect(
      f.service.chat({ ...request(), ...patch } as AiChatRequest),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.cli).not.toHaveBeenCalled();
  });
  it("cancela apenas o pedido correspondente e impede pedidos simultâneos", async () => {
    const f = fixture({ loaded: true });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetcher = vi.fn(async (url: any, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models"))
        return json({ models: [smallModel(["external-instance"])] });
      started();
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        ),
      );
    }) as typeof fetch;
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      fetch: fetcher,
      runCli: f.cli,
    });
    const first = service.chat(request());
    const rejected = expect(first).rejects.toThrow(/interrompida/);
    await ready;
    expect((await service.status()).busy).toBe(true);
    await expect(
      service.chat(request({ requestId: "second" })),
    ).rejects.toThrow(/respondendo/);
    await expect(service.unload()).rejects.toThrow(/Interrompa/);
    await service.cancel("other");
    expect((await service.status()).busy).toBe(true);
    await service.cancel("request-1");
    await rejected;
    expect((await service.status()).busy).toBe(false);
  });
  it("prazo encerra inferência travada", async () => {
    const fetcher = vi.fn(async (url: any, init?: RequestInit) =>
      String(url).endsWith("/api/v1/models")
        ? json({ models: [smallModel(["external"])] })
        : new Promise<Response>((_resolve, reject) =>
            init!.signal!.addEventListener("abort", () =>
              reject(init!.signal!.reason),
            ),
          ),
    ) as typeof fetch;
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      fetch: fetcher,
      requestTimeoutMs: 20,
    });
    await expect(service.chat(request())).rejects.toThrow(/demorou/);
  });
  it("não retorna texto vazio ou estrutura inválida como resposta", async () => {
    const f = fixture({ loaded: true, content: "" });
    await expect(f.service.chat(request())).rejects.toThrow(/utilizável/);
  });
  it("não inicia servidor ou envia credenciais quando autenticaçãoéexigida", async () => {
    const cli = vi.fn();
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      runCli: cli,
      fetch: vi.fn(async () => json({}, 401)) as typeof fetch,
    });
    await expect(service.chat(request())).rejects.toThrow(/autenticação/);
    expect(cli).not.toHaveBeenCalled();
  });
  it("limita tamanho das respostas HTTP", async () => {
    const service = new LocalAiService({
      loadState: async () => createInitialState(),
      allowCli: false,
      fetch: vi.fn(
        async () => new Response("x".repeat(1_000_001)),
      ) as typeof fetch,
    });
    await expect(service.chat(request())).rejects.toThrow(/limite/);
  });
});
