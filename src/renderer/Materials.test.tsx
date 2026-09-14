// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    openMaterial: vi.fn(),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    getPaths: vi.fn(),
  };
  return { api, get: () => state };
}
async function mount(api: NativeApi) {
  await act(async () => {
    render(
      <AppProvider nativeApi={api}>
        <Materials />
      </AppProvider>,
    );
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
