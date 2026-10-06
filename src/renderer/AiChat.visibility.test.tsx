// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { AppProvider } from "./store";
import { createInitialState } from "../domain";
import AiChat from "./AiChat";
import type { NativeApi } from "../shared/types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("cancela geração ao ocultar o Ninho e rejeita resposta tardia", async () => {
  let resolve!: (value: unknown) => void;
  const api = {
    load: async () => createInitialState(),
    dispatch: vi.fn(),
    aiStatus: vi.fn(async () => ({
      available: true,
      activeModel: "local",
      models: [{ id: "local", name: "Modelo local", loaded: true }],
      busy: false,
      endpoint: "http://127.0.0.1",
      idleMinutes: 5,
    })),
    aiChat: vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
    aiCancel: vi.fn(async () => {}),
  } as unknown as NativeApi;
  render(
    <AppProvider nativeApi={api}>
      <AiChat />
    </AppProvider>,
  );
  const input = await screen.findByRole("textbox", {
    name: "Converse com Íris",
  });
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Modelo de IA" })).toHaveValue(
      "local",
    ),
  );
  fireEvent.change(input, { target: { value: "Explique um conceito" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar à Íris" }));
  await waitFor(() => expect(api.aiChat).toHaveBeenCalledOnce());
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(api.aiCancel).toHaveBeenCalledOnce();
  await act(async () =>
    resolve({
      content: "Resposta tardia que não deve entrar",
      requestId: "id",
      modelId: "local",
    }),
  );
  expect(screen.queryByText("Resposta tardia que não deve entrar")).toBeNull();
  expect(screen.getByText(/Geração interrompida ao sair/)).toBeInTheDocument();
  hidden.mockRestore();
});
