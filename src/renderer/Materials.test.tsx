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
import { applyCommand, createInitialState } from "../domain";
import type {
  AppState,
  Material,
  MaterialPreview,
  NativeApi,
} from "../shared/types";
import { AppProvider } from "./store";
import Materials from "./Materials";

const now = new Date("2026-09-14T16:00:00.000Z");
function fixture(): AppState {
  const initial = createInitialState(now);
  const lesson = initial.lessons.find(
    (item) => item.subjectId === "banco-de-dados",
  )!;
  const base: Material = {
    id: "arquivo-a",
    name: "Arquivo A.txt",
    storedName: "02002166-61b0-4c47-a30e-ff6ebcbb3658.txt",
    type: "txt",
    size: 20,
    subjectId: lesson.subjectId,
    lessonId: lesson.id,
    createdAt: now.toISOString(),
    notes: "",
  };
  return {
    ...initial,
    materials: [
      base,
      {
        ...base,
        id: "arquivo-b",
        name: "Arquivo B.txt",
        storedName: "be9290e1-fb59-420a-9b28-45c2d7a3dd83.txt",
        lessonId: "",
      },
    ],
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
    importMaterials: vi.fn(async () => null),
    previewMaterial: vi.fn(async (id) => ({
      kind: "text" as const,
      name: id,
      data: `Texto de ${id}`,
    })),
    openMaterial: vi.fn(async () => undefined),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    getPaths: vi.fn(),
  };
  return { api, get: () => state };
}
async function mount(api: NativeApi, subjectId?: string, lessonId?: string) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <AppProvider nativeApi={api}>
        <Materials
          subjectId={subjectId}
          lessonId={lessonId}
          embedded={Boolean(subjectId)}
        />
      </AppProvider>,
    );
  });
  return view;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prévia PDF com endereço local curto", () => {
  const OriginalURL = URL;
  const createUrl = vi.fn<(blob: Blob) => string>();
  const revokeUrl = vi.fn<(url: string) => void>();
  const pdfReply = (data = btoa("%PDF-1.7\nConteúdo de teste")): MaterialPreview => ({
    kind: "pdf",
    name: "Arquivo A.pdf",
    mime: "application/pdf",
    data,
  });
  const pdfNative = () => {
    const initial = fixture();
    initial.materials = initial.materials.map((material) => ({
      ...material,
      name: material.name.replace(".txt", ".pdf"),
      storedName: material.storedName.replace(".txt", ".pdf"),
      type: "pdf",
    }));
    const result = native(initial);
    result.api.previewMaterial = vi.fn(async () => pdfReply());
    return { ...result, initial };
  };
  const openPdf = async (name = "A") => {
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: `Abrir Arquivo ${name}.pdf` })),
    );
  };
  beforeEach(() => {
    let sequence = 0;
    createUrl.mockReset().mockImplementation(() => `blob:ninho-pdf-${++sequence}`);
    revokeUrl.mockReset();
    vi.stubGlobal("URL", class extends OriginalURL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    });
  });

  it("preserva todos os bytes de um PDF grande sem colocar base64 no endereço do iframe", async () => {
    const bytes = Uint8Array.from({ length: 3 * 1024 * 1024 }, (_, index) => index % 256);
    const { api } = pdfNative();
    api.previewMaterial = vi.fn(async () => pdfReply(Buffer.from(bytes).toString("base64")));
    await mount(api);
    await openPdf();
    expect(screen.getByTitle("Prévia de Arquivo A.pdf")).toHaveAttribute("src", "blob:ninho-pdf-1");
    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = createUrl.mock.calls[0][0];
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(bytes.length);
    const copied = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    expect(Buffer.from(copied).equals(Buffer.from(bytes))).toBe(true);
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it("mantém a prévia ao editar e salvar notas e libera o endereço ao fechar", async () => {
    const { api } = pdfNative();
    await mount(api);
    await openPdf();
    fireEvent.change(screen.getByLabelText("Anotações do material"), { target: { value: "Retomar página 42" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar material" })));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
    expect(screen.getByTitle("Prévia de Arquivo A.pdf")).toHaveAttribute("src", "blob:ninho-pdf-1");
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:ninho-pdf-1");
    await openPdf("B");
    expect(screen.getByTitle("Prévia de Arquivo B.pdf")).toHaveAttribute("src", "blob:ninho-pdf-2");
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });

  it.each(["escopo", "desmontagem"])("libera o PDF aberto na mudança de %s", async (reason) => {
    const { api } = pdfNative();
    const view = await mount(api, "banco-de-dados");
    await openPdf();
    await act(async () => {
      if (reason === "desmontagem") view.unmount();
      else view.rerender(<AppProvider nativeApi={api}><Materials subjectId="literatura" embedded /></AppProvider>);
    });
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:ninho-pdf-1");
    expect(screen.queryByTitle("Prévia de Arquivo A.pdf")).not.toBeInTheDocument();
  });

  it.each(["fechar", "escopo", "desmontagem"])("ignora bytes atrasados sem criar endereço depois de %s", async (reason) => {
    const { api } = pdfNative();
    let done!: (preview: MaterialPreview) => void;
    api.previewMaterial = vi.fn(() => new Promise<MaterialPreview>((resolve) => { done = resolve; }));
    const view = await mount(api, "banco-de-dados");
    fireEvent.click(screen.getByRole("button", { name: "Abrir Arquivo A.pdf" }));
    await act(async () => {
      if (reason === "desmontagem") view.unmount();
      else if (reason === "fechar") fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
      else view.rerender(<AppProvider nativeApi={api}><Materials subjectId="literatura" embedded /></AppProvider>);
    });
    await act(async () => done(pdfReply()));
    expect(createUrl).not.toHaveBeenCalled();
    expect(revokeUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("o PDF atrasado de outro arquivo não substitui nem revoga a prévia atual", async () => {
    const { api } = pdfNative();
    let oldDone!: (preview: MaterialPreview) => void;
    api.previewMaterial = vi.fn().mockImplementationOnce(() => new Promise<MaterialPreview>((resolve) => { oldDone = resolve; })).mockResolvedValueOnce(pdfReply());
    await mount(api);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Arquivo A.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    await openPdf("B");
    await act(async () => oldDone(pdfReply(btoa("%PDF-1.7\nAntigo"))));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
    expect(screen.getByTitle("Prévia de Arquivo B.pdf")).toHaveAttribute("src", "blob:ninho-pdf-1");
  });

  it("permite repetir uma falha na criação da prévia sem perder o rascunho", async () => {
    const { api } = pdfNative();
    createUrl.mockImplementationOnce(() => { throw new Error("Memória temporária indisponível."); });
    await mount(api);
    await openPdf();
    expect(screen.getByRole("alert")).toHaveTextContent("Memória temporária indisponível.");
    expect(screen.queryByTitle("Prévia de Arquivo A.pdf")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anotações do material"), { target: { value: "Meu rascunho" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tentar prévia novamente" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTitle("Prévia de Arquivo A.pdf")).toHaveAttribute("src", "blob:ninho-pdf-1");
    expect(screen.getByLabelText("Anotações do material")).toHaveValue("Meu rascunho");
    expect(createUrl).toHaveBeenCalledTimes(2);
  });

  it("mostra erro para PDF sem conteúdo e mantém a abertura pelo Windows disponível", async () => {
    const { api } = pdfNative();
    api.previewMaterial = vi.fn(async () => pdfReply(""));
    await mount(api);
    await openPdf();
    expect(screen.getByRole("alert")).toHaveTextContent("O conteúdo do PDF não está disponível para prévia.");
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abrir no Windows" })).toBeEnabled();
  });
});

describe("biblioteca com operações assíncronas", () => {
  it("não mostra a prévia anterior sob o título de outro arquivo", async () => {
    const { api } = native();
    const replies = new Map<string, (value: MaterialPreview) => void>();
    api.previewMaterial = vi.fn(
      (id) =>
        new Promise<MaterialPreview>((resolve) => replies.set(id, resolve)),
    );
    await mount(api);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Arquivo B.txt" }),
    );
    await act(async () =>
      replies.get("arquivo-a")!({
        kind: "text",
        name: "Arquivo A.txt",
        data: "Prévia antiga A",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Arquivo B.txt" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Prévia antiga A")).not.toBeInTheDocument();
    expect(screen.getByText("Preparando prévia…")).toBeInTheDocument();
    await act(async () =>
      replies.get("arquivo-b")!({
        kind: "text",
        name: "Arquivo B.txt",
        data: "Prévia correta B",
      }),
    );
    expect(screen.getByText("Prévia correta B")).toBeInTheDocument();
  });

  it("ignora falhas de uma prévia já fechada e não reabre o modal", async () => {
    const { api } = native();
    let reject!: (error: Error) => void;
    api.previewMaterial = vi.fn(
      () =>
        new Promise<MaterialPreview>((_resolve, rejectValue) => {
          reject = rejectValue;
        }),
    );
    await mount(api);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    await act(async () => reject(new Error("Leitura cancelada")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("limpa o vínculo de aula ao trocar de matéria e não ressuscita o vínculo antigo em uma segunda edição", async () => {
    const { api, get } = native();
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "literatura" },
    });
    fireEvent.change(screen.getByLabelText("Anotações do material"), {
      target: { value: "Retomar o capítulo 2." },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(get().materials[0]).toMatchObject({
      subjectId: "literatura",
      lessonId: "",
      notes: "Retomar o capítulo 2.",
    });
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "banco-de-dados" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(get().materials[0]).toMatchObject({
      subjectId: "banco-de-dados",
      lessonId: "",
    });
  });

  it("não abre dois diálogos de importação por cliques repetidos e respeita cancelamento", async () => {
    const { api, get } = native();
    let release!: () => void;
    api.importMaterials = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return null;
    });
    await mount(api);
    const button = screen.getByRole("button", { name: "Adicionar arquivos" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(api.importMaterials).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Importando…" })).toBeDisabled();
    await act(async () => release());
    expect(get().materials).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Adicionar arquivos" }),
    ).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("materiais dentro da matéria", () => {
  it("isola arquivos e vincula a importação diretamente à matéria aberta", async () => {
    const state = fixture();
    state.materials[1].subjectId = "literatura";
    const { api } = native(state);
    await mount(api, "banco-de-dados");
    expect(
      screen.getByRole("heading", { name: "Materiais desta matéria" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("material-row-arquivo-a")).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-b"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filtrar matéria")).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Adicionar arquivos" }),
      ),
    );
    expect(api.importMaterials).toHaveBeenCalledWith({
      subjectId: "banco-de-dados",
    });
  });
  it("oferece importação na matéria vazia mesmo que outras matérias tenham arquivos", async () => {
    const { api } = native();
    await mount(api, "literatura");
    expect(
      screen.getByText("Seu próximo conhecimento começa aqui."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-a"),
    ).not.toBeInTheDocument();
  });
  it("filtra vídeos e áudios e oferece o player do Windows sem carregar dados na prévia", async () => {
    const state = fixture();
    state.materials[0] = {
      ...state.materials[0],
      name: "Aula.mp4",
      type: "mp4",
    };
    state.materials[1] = {
      ...state.materials[1],
      name: "Resumo.mp3",
      type: "mp3",
    };
    const { api } = native(state);
    api.previewMaterial = vi.fn(async () => ({
      kind: "external" as const,
      name: "Aula.mp4",
    }));
    await mount(api, "banco-de-dados");
    fireEvent.change(screen.getByLabelText("Tipo de arquivo"), {
      target: { value: "video" },
    });
    expect(screen.getByTestId("material-row-arquivo-a")).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-b"),
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Abrir Aula.mp4" })),
    );
    await act(async () =>
      fireEvent.click(
        screen.getAllByRole("button", { name: "Abrir no Windows" })[0],
      ),
    );
    expect(api.openMaterial).toHaveBeenCalledWith("arquivo-a");
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    fireEvent.change(screen.getByLabelText("Tipo de arquivo"), {
      target: { value: "audio" },
    });
    expect(screen.getByTestId("material-row-arquivo-b")).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-a"),
    ).not.toBeInTheDocument();
  });
});

describe("gravações de material em andamento", () => {
  it.each(["fechar", "trocar"])(
    "não restaura um modal antigo após %s de material",
    async (action) => {
      const initial = fixture();
      const { api } = native(initial);
      let complete!: (state: AppState) => void;
      api.dispatch = vi.fn(
        () =>
          new Promise<AppState>((resolve) => {
            complete = resolve;
          }),
      );
      await mount(api);
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
        ),
      );
      fireEvent.change(screen.getByLabelText("Anotações do material"), {
        target: { value: "Salvando anotação" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" }));
      fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
      if (action === "trocar")
        await act(async () =>
          fireEvent.click(
            screen.getByRole("button", { name: "Abrir Arquivo B.txt" }),
          ),
        );
      const updated = applyCommand(initial, {
        type: "material.update",
        id: "arquivo-a",
        patch: { notes: "Salvando anotação" },
      });
      await act(async () => complete(updated));
      if (action === "fechar")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      else {
        expect(
          screen.getByRole("dialog", { name: "Arquivo B.txt" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Texto de arquivo-b")).toBeInTheDocument();
        expect(
          screen.queryByRole("dialog", { name: "Arquivo A.txt" }),
        ).not.toBeInTheDocument();
      }
    },
  );
  it("diferencia matérias homônimas usando o curso real, inclusive outra faculdade", async () => {
    const state = fixture();
    state.programs.push({
      id: "curso-extra",
      name: "Segunda faculdade",
      track: "faculdade",
      color: "#66895a",
      description: "",
    });
    state.subjects.push({
      id: "outra-literatura",
      name: "Literatura",
      programId: "curso-extra",
      track: "faculdade",
      color: "#66895a",
    });
    const { api } = native(state);
    await mount(api);
    expect(
      screen.getByRole("option", { name: "Literatura · Senado Federal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Literatura · Segunda faculdade" }),
    ).toBeInTheDocument();
  });
});

describe("materiais vinculados à aula", () => {
  it("mostra somente arquivos da aula exata, sem misturar matéria, outras aulas ou arquivos soltos", async () => {
    const initial = fixture();
    const first = initial.materials[0];
    const otherLesson = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === first.subjectId && lesson.id !== first.lessonId,
    )!;
    initial.materials.push(
      {
        ...first,
        id: "outra-aula",
        name: "Outra aula.txt",
        lessonId: otherLesson.id,
      },
      {
        ...first,
        id: "outra-materia",
        name: "Literatura.txt",
        subjectId: "literatura",
        lessonId: "",
      },
    );
    const { api } = native(initial);
    await mount(api, first.subjectId, first.lessonId);
    expect(
      screen.getByRole("heading", { name: "Materiais desta aula" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("material-row-arquivo-a")).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-b"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-outra-aula"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-outra-materia"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filtrar matéria")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo de arquivo"), {
      target: { value: "pdf" },
    });
    expect(screen.getByText("Nada encontrado.")).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum material nesta aula ainda."),
    ).not.toBeInTheDocument();
  });

  it("importa um arquivo com os dois vínculos e o mostra imediatamente na aula", async () => {
    const initial = fixture();
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === "banco-de-dados" &&
        lesson.id !== initial.materials[0].lessonId,
    )!;
    const { api } = native(initial);
    api.importMaterials = vi.fn(async (context) => ({
      ...initial,
      materials: [
        ...initial.materials,
        {
          ...initial.materials[0],
          id: "novo-na-aula",
          name: "Notas da aula.txt",
          subjectId: context!.subjectId!,
          lessonId: context!.lessonId!,
        },
      ],
    }));
    await mount(api, target.subjectId, target.id);
    expect(
      screen.getByText("Nenhum material nesta aula ainda."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("material-row-arquivo-a"),
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Adicionar arquivos à aula" }),
      ),
    );
    expect(api.importMaterials).toHaveBeenCalledWith({
      subjectId: target.subjectId,
      lessonId: target.id,
    });
    expect(screen.getByTestId("material-row-novo-na-aula")).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum material nesta aula ainda."),
    ).not.toBeInTheDocument();
  });

  it.each(["", "aula-inexistente"])(
    "um escopo inválido %j não abre a biblioteca global nem importa sem vínculo",
    async (id) => {
      const { api } = native();
      await mount(api, "banco-de-dados", id);
      expect(
        screen.getByText("Esta aula não está disponível."),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("material-row-arquivo-a"),
      ).not.toBeInTheDocument();
      const button = screen.getByRole("button", {
        name: "Adicionar arquivos à aula",
      });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(api.importMaterials).not.toHaveBeenCalled();
    },
  );

  it("rejeita escopo com aula de outra matéria", async () => {
    const initial = fixture();
    const { api } = native(initial);
    await mount(api, "literatura", initial.materials[0].lessonId);
    expect(
      screen.getByText("Esta aula não está disponível."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar arquivos à aula" }),
    ).toBeDisabled();
  });

  it("associa um arquivo já importado à aula e permite desassociar sem remover o arquivo", async () => {
    const initial = fixture();
    const target = initial.lessons.find(
      (lesson) => lesson.subjectId === "banco-de-dados",
    )!;
    const { api, get } = native(initial);
    await mount(api, target.subjectId);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo B.txt" }),
      ),
    );
    const select = screen.getByLabelText("Aula do material");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: target.id } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(
      get().materials.find((material) => material.id === "arquivo-b")?.lessonId,
    ).toBe(target.id);
    fireEvent.change(select, { target: { value: "" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(get().materials).toHaveLength(2);
    expect(
      get().materials.find((material) => material.id === "arquivo-b"),
    ).toMatchObject({ subjectId: target.subjectId, lessonId: "" });
  });

  it("move o arquivo entre aulas e o retira da lista da aula anterior", async () => {
    const initial = fixture();
    const old = initial.materials[0];
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === old.subjectId && lesson.id !== old.lessonId,
    )!;
    const { api, get } = native(initial);
    await mount(api, old.subjectId, old.lessonId);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    expect(screen.getByLabelText("Aula do material")).toHaveValue(old.lessonId);
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: target.id },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(get().materials[0].lessonId).toBe(target.id);
    expect(
      screen.queryByTestId("material-row-arquivo-a"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Nenhum material nesta aula ainda."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Aula do material")).toHaveValue(target.id);
  });

  it("limpa a aula imediatamente ao mudar de matéria, inclusive ao voltar sem salvar", async () => {
    const { api, get } = native();
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    const subject = screen.getByLabelText("Matéria");
    const lesson = screen.getByLabelText("Aula do material");
    expect(lesson).not.toHaveValue("");
    fireEvent.change(subject, { target: { value: "literatura" } });
    expect(lesson).toHaveValue("");
    fireEvent.change(subject, { target: { value: "banco-de-dados" } });
    expect(lesson).toHaveValue("");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(get().materials[0]).toMatchObject({
      subjectId: "banco-de-dados",
      lessonId: "",
    });
    fireEvent.change(subject, { target: { value: "" } });
    expect(lesson).toHaveValue("");
    expect(lesson).toBeDisabled();
  });

  it("distingue aulas homônimas pelo módulo e só oferece aulas da matéria selecionada", async () => {
    const initial = fixture();
    const original = initial.lessons.find(
      (lesson) => lesson.id === initial.materials[0].lessonId,
    )!;
    const course = initial.courses.find(
      (item) => item.id === original.courseId,
    )!;
    initial.courses.push({
      ...course,
      id: "modulo-extra",
      title: "Exercícios de Banco de Dados",
    });
    initial.lessons.push({
      ...original,
      id: "aula-homonima",
      courseId: "modulo-extra",
    });
    const { api } = native(initial);
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    const options = within(screen.getByLabelText("Aula do material"));
    expect(
      options.getByRole("option", {
        name: `${original.title} · ${course.title}`,
      }),
    ).toHaveValue(original.id);
    expect(
      options.getByRole("option", {
        name: `${original.title} · Exercícios de Banco de Dados`,
      }),
    ).toHaveValue("aula-homonima");
    const offered = options
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(offered).not.toContain(
      initial.lessons.find((lesson) => lesson.subjectId === "literatura")!.id,
    );
  });

  it("não deixa uma prévia pendente vazar quando o escopo de aula muda", async () => {
    const initial = fixture();
    const old = initial.materials[0];
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === old.subjectId && lesson.id !== old.lessonId,
    )!;
    const { api } = native(initial);
    let release!: (value: MaterialPreview) => void;
    api.previewMaterial = vi.fn(
      () =>
        new Promise<MaterialPreview>((resolve) => {
          release = resolve;
        }),
    );
    const view = await mount(api, old.subjectId, old.lessonId);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
    );
    await act(async () =>
      view.rerender(
        <AppProvider nativeApi={api}>
          <Materials
            embedded
            subjectId={target.subjectId}
            lessonId={target.id}
          />
        </AppProvider>,
      ),
    );
    await act(async () =>
      release({
        kind: "text",
        name: old.name,
        data: "Conteúdo da aula anterior",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Conteúdo da aula anterior"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`lesson-materials-${target.id}`),
    ).toBeInTheDocument();
  });

  it("serializa cliques no mesmo salvamento e mantém os campos enquanto ocorre a gravação", async () => {
    const initial = fixture();
    const { api } = native(initial);
    let release!: (value: AppState) => void;
    api.dispatch = vi.fn(
      () =>
        new Promise<AppState>((resolve) => {
          release = resolve;
        }),
    );
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    const button = screen.getByRole("button", { name: "Salvar material" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.getByLabelText("Matéria")).toBeDisabled();
    expect(screen.getByLabelText("Aula do material")).toBeDisabled();
    await act(async () => release(initial));
    expect(
      screen.getByRole("button", { name: "Salvar material" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Aula do material")).toBeEnabled();
  });

  it("um erro ao salvar mantém o novo vínculo para tentar novamente", async () => {
    const initial = fixture();
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === initial.materials[0].subjectId &&
        lesson.id !== initial.materials[0].lessonId,
    )!;
    const { api, get } = native(initial);
    api.dispatch = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'ninho:dispatch': Error: Não foi possível gravar agora.",
      );
    });
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: target.id },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível gravar agora.",
    );
    expect(screen.getByLabelText("Aula do material")).toHaveValue(target.id);
    expect(
      screen.getByRole("button", { name: "Salvar material" }),
    ).toBeEnabled();
    expect(get().materials[0].lessonId).toBe(initial.materials[0].lessonId);
  });

  it("aguarda a movimentação antes de reabrir o mesmo material, sem ressuscitar o vínculo anterior", async () => {
    const initial = fixture();
    const old = initial.materials[0];
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === old.subjectId && lesson.id !== old.lessonId,
    )!;
    const { api } = native(initial);
    let release!: (value: AppState) => void;
    api.dispatch = vi.fn(
      () =>
        new Promise<AppState>((resolve) => {
          release = resolve;
        }),
    );
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: target.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar material" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Este material está sendo salvo.",
    );
    expect(api.previewMaterial).toHaveBeenCalledTimes(1);
    const moved = applyCommand(initial, {
      type: "material.update",
      id: old.id,
      patch: { lessonId: target.id },
    });
    await act(async () => release(moved));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    expect(screen.getByLabelText("Aula do material")).toHaveValue(target.id);
  });

  it("uma edição de anotações não reenvia vínculos inalterados de um snapshot anterior", async () => {
    const { api } = native();
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Anotações do material"), {
      target: { value: "Revisar normalização." },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" })),
    );
    expect(api.dispatch).toHaveBeenCalledWith({
      type: "material.update",
      id: "arquivo-a",
      patch: { notes: "Revisar normalização." },
    });
  });
});

describe("falhas de arquivos sem mensagens brutas do Electron", () => {
  it("Abrir no Windows mostra o motivo real e preserva o material no modal", async () => {
    const { api, get } = native();
    api.openMaterial = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'ninho:material:open': Error: O arquivo está fora da biblioteca.",
      );
    });
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Abrir no Windows" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O arquivo está fora da biblioteca.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Error invoking remote method",
    );
    expect(
      screen.getByRole("dialog", { name: "Arquivo A.txt" }),
    ).toBeInTheDocument();
    expect(get().materials).toHaveLength(2);
  });

  it("falha de prévia não é confundida com formato externo e a tentativa preserva notas e aula escolhida", async () => {
    const initial = fixture();
    const target = initial.lessons.find(
      (lesson) =>
        lesson.subjectId === initial.materials[0].subjectId &&
        lesson.id !== initial.materials[0].lessonId,
    )!;
    const { api } = native(initial);
    api.previewMaterial = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'ninho:material:preview': Error: Não foi possível ler resumo.txt.",
        ),
      )
      .mockResolvedValueOnce({
        kind: "text",
        name: "Arquivo A.txt",
        data: "Prévia recuperada",
      });
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível abrir a prévia.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível ler resumo.txt.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Error invoking remote method",
    );
    expect(
      screen.queryByText("Abra com seu aplicativo favorito."),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anotações do material"), {
      target: { value: "Meu rascunho ainda não salvo" },
    });
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: target.id },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Tentar prévia novamente" }),
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Prévia recuperada")).toBeInTheDocument();
    expect(screen.getByLabelText("Anotações do material")).toHaveValue(
      "Meu rascunho ainda não salvo",
    );
    expect(screen.getByLabelText("Aula do material")).toHaveValue(target.id);
  });

  it("uma importação que rejeita sem Error não quebra a tela e permite tentar outra vez", async () => {
    const { api } = native();
    api.importMaterials = vi.fn(async () => {
      throw null;
    });
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Adicionar arquivos" }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível importar os arquivos.",
    );
    expect(
      screen.getByRole("button", { name: "Adicionar arquivos" }),
    ).toBeEnabled();
    expect(screen.getByTestId("material-row-arquivo-a")).toBeInTheDocument();
  });

  it.each(["prévia", "gravação"])(
    "prévia e salvamento mantêm o formulário consistente quando %s termina primeiro",
    async (first) => {
      const initial = fixture();
      const target = initial.lessons.find(
        (lesson) =>
          lesson.subjectId === initial.materials[0].subjectId &&
          lesson.id !== initial.materials[0].lessonId,
      )!;
      const { api } = native(initial);
      let previewDone!: (value: MaterialPreview) => void;
      let saveDone!: (value: AppState) => void;
      const updated = applyCommand(initial, {
        type: "material.update",
        id: "arquivo-a",
        patch: { notes: "Rascunho salvo", lessonId: target.id },
      });
      api.previewMaterial = vi
        .fn()
        .mockRejectedValueOnce(new Error("Não foi possível ler agora."))
        .mockImplementationOnce(
          () =>
            new Promise<MaterialPreview>((resolve) => {
              previewDone = resolve;
            }),
        );
      api.dispatch = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<AppState>((resolve) => {
              saveDone = resolve;
            }),
        )
        .mockImplementationOnce(async (command) =>
          applyCommand(updated, command),
        );
      await mount(api);
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
        ),
      );
      fireEvent.change(screen.getByLabelText("Anotações do material"), {
        target: { value: "Rascunho salvo" },
      });
      fireEvent.change(screen.getByLabelText("Aula do material"), {
        target: { value: target.id },
      });
      if (first === "prévia")
        fireEvent.click(
          screen.getByRole("button", { name: "Tentar prévia novamente" }),
        );
      fireEvent.click(screen.getByRole("button", { name: "Salvar material" }));
      expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
      const preview = {
        kind: "text" as const,
        name: "Arquivo A.txt",
        data: "Prévia refeita",
      };
      if (first === "prévia") {
        await act(async () => previewDone(preview));
        expect(
          screen.getByRole("button", { name: "Salvando…" }),
        ).toBeDisabled();
        await act(async () => saveDone(updated));
      } else {
        const retry = screen.getByRole("button", {
          name: "Tentar prévia novamente",
        });
        expect(retry).toBeDisabled();
        fireEvent.click(retry);
        expect(api.previewMaterial).toHaveBeenCalledTimes(1);
        await act(async () => saveDone(updated));
        expect(
          screen.getByRole("button", { name: "Salvar material" }),
        ).toBeEnabled();
        expect(retry).toBeEnabled();
        fireEvent.click(retry);
        await act(async () => previewDone(preview));
      }
      expect(api.previewMaterial).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: "Salvar material" }),
      ).toBeEnabled();
      expect(screen.getByLabelText("Anotações do material")).toHaveValue(
        "Rascunho salvo",
      );
      expect(screen.getByLabelText("Aula do material")).toHaveValue(target.id);
      expect(screen.getByText("Prévia refeita")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Anotações do material"), {
        target: { value: "" },
      });
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Salvar material" }),
        ),
      );
      expect(api.dispatch).toHaveBeenLastCalledWith({
        type: "material.update",
        id: "arquivo-a",
        patch: { notes: "" },
      });
    },
  );

  it("fechar durante salvamento e nova prévia invalida os dois retornos sem reabrir o modal", async () => {
    const initial = fixture();
    const { api } = native(initial);
    let previewDone!: (value: MaterialPreview) => void;
    let saveDone!: (value: AppState) => void;
    api.previewMaterial = vi
      .fn()
      .mockRejectedValueOnce(new Error("Leitura falhou."))
      .mockImplementationOnce(
        () =>
          new Promise<MaterialPreview>((resolve) => {
            previewDone = resolve;
          }),
      );
    api.dispatch = vi.fn(
      () =>
        new Promise<AppState>((resolve) => {
          saveDone = resolve;
        }),
    );
    await mount(api);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Abrir Arquivo A.txt" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Anotações do material"), {
      target: { value: "Nota salva" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar prévia novamente" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar material" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    await act(async () =>
      saveDone(
        applyCommand(initial, {
          type: "material.update",
          id: "arquivo-a",
          patch: { notes: "Nota salva" },
        }),
      ),
    );
    await act(async () =>
      previewDone({
        kind: "text",
        name: "Arquivo A.txt",
        data: "Não deve reaparecer",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Não deve reaparecer")).not.toBeInTheDocument();
  });
});
