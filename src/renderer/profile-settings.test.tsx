// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "./store";
import Profile from "./Profile";
import Settings from "./Settings";
import { applyCommand, createInitialState } from "../domain";
import type { NativeApi } from "../shared/types";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function fixture() {
  let state = createInitialState();
  const api: NativeApi = {
    load: async () => state,
    dispatch: vi.fn(async (command) => (state = applyCommand(state, command))),
    getPaths: async () => ({ data: "local", backup: "backup" }),
    importMaterials: vi.fn(),
    previewMaterial: vi.fn(),
    openMaterial: vi.fn(),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
  };
  return { api, state: () => state };
}
describe("perfil e salvamento automático", () => {
  it("salva ajustes válidos sem botão e deixa entrada inválida fora dos dados", async () => {
    const f = fixture();
    render(
      <AppProvider nativeApi={f.api}>
        <Settings />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Escuro" }));
    await waitFor(() => expect(f.state().settings.theme).toBe("dark"));
    expect(
      screen.queryByRole("button", { name: "Salvar preferências" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Meta diária (minutos)"), {
      target: { value: "0" },
    });
    expect(f.state().settings.dailyMinutes).not.toBe(0);
    fireEvent.change(screen.getByLabelText("Meta diária (minutos)"), {
      target: { value: "45" },
    });
    await waitFor(() => expect(f.state().settings.dailyMinutes).toBe(45));
  });
  it("conclui boas-vindas sem modelo com aviso honesto e perfil persistido", async () => {
    const f = fixture();
    const done = vi.fn();
    render(
      <AppProvider nativeApi={f.api}>
        <Profile welcome done={done} />
      </AppProvider>,
    );
    fireEvent.change(await screen.findByLabelText(/Como quer ser chamado/), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText(/principal objetivo/), {
      target: { value: "Aprender estatística" },
    });
    for (let step = 1; step < 10; step++) {
      await waitFor(() =>
        expect(screen.getByRole("progressbar")).toHaveAttribute(
          "aria-valuenow",
          String(step + 1),
        ),
      );
      expect(f.state().profile?.completedAt).toBeNull();
      if (step < 9) {
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Continuar" }),
          ).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
      }
    }
    fireEvent.click(screen.getByRole("button", { name: "Criar meu perfil" }));
    await screen.findByRole("heading", { name: "Seu Ninho está pronto." });
    expect(f.state().profile).toMatchObject({
      name: "Ana",
      goal: "Aprender estatística",
      planStatus: "none",
    });
    expect(f.state().profile?.completedAt).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conhecer meu Ninho" }));
    expect(done).toHaveBeenCalledOnce();
  });
  it("retoma a mesma pergunta e as respostas incompletas após reabrir", async () => {
    const f = fixture();
    const first = render(
      <AppProvider nativeApi={f.api}>
        <Profile welcome />
      </AppProvider>,
    );
    fireEvent.change(await screen.findByLabelText(/Como quer ser chamado/), {
      target: { value: "Bia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText(/principal objetivo/), {
      target: { value: "Concluir minha formação" },
    });
    await waitFor(() =>
      expect(f.state().profile?.goal).toBe("Concluir minha formação"),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Respostas salvas"),
    );
    expect(f.state().profile?.completedAt).toBeNull();
    first.unmount();
    render(
      <AppProvider nativeApi={f.api}>
        <Profile welcome />
      </AppProvider>,
    );
    expect(await screen.findByLabelText(/principal objetivo/)).toHaveValue(
      "Concluir minha formação",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByLabelText(/Como quer ser chamado/)).toHaveValue(
      "Bia",
    );
  });
  it("serializa rascunhos rápidos e avança apenas após guardar a resposta mais recente", async () => {
    const f = fixture();
    const dispatch = f.api.dispatch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0,
      maximum = 0;
    f.api.dispatch = vi.fn(async (command) => {
      active++;
      maximum = Math.max(maximum, active);
      if (command.type === "profile.save" && command.profile.name === "An")
        await gate;
      try {
        return await dispatch(command);
      } finally {
        active--;
      }
    });
    render(
      <AppProvider nativeApi={f.api}>
        <Profile welcome />
      </AppProvider>,
    );
    const name = await screen.findByLabelText(/Como quer ser chamado/);
    fireEvent.change(name, { target: { value: "An" } });
    fireEvent.change(name, { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    release();
    await screen.findByLabelText(/principal objetivo/);
    expect(f.state().profile).toMatchObject({ name: "Ana", completedAt: null });
    expect(maximum).toBe(1);
  });
  it("aguarda a geração real, permite cancelar e mantém as respostas salvas", async () => {
    const f = fixture();
    f.api.aiStatus = vi.fn(async () => ({
      available: true,
      activeModel: "local",
      busy: false,
      endpoint: "http://127.0.0.1:1234",
      idleMinutes: 5,
      models: [{ id: "local", name: "Modelo de teste", loaded: true }],
    }));
    let reject!: (error: Error) => void;
    f.api.aiChat = vi.fn(
      () =>
        new Promise<never>((_resolve, fail) => {
          reject = fail;
        }),
    );
    f.api.aiCancel = vi.fn(async () => reject(new Error("Geração cancelada.")));
    render(
      <AppProvider nativeApi={f.api}>
        <Profile />
      </AppProvider>,
    );
    fireEvent.change(await screen.findByLabelText(/Como quer ser chamado/), {
      target: { value: "Ana" },
    });
    expect(f.api.aiStatus).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Recursos opcionais de IA" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Gerar plano com IA local" }),
    );
    await waitFor(() => expect(f.api.aiChat).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("heading", { name: "Preparando seu próximo passo…" }),
    ).toBeVisible();
    expect(f.state().profile?.planStatus).toBe("pending");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar geração" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(f.state().profile?.planStatus).toBe("error"));
    expect(f.state().profile?.name).toBe("Ana");
    expect(f.api.aiCancel).toHaveBeenCalledOnce();
  });
});
