// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../domain";
import { browserApi } from "./store";

afterEach(() => localStorage.clear());
describe("migração da prévia local", () => {
  it("reabre um perfil v1 sem perder notas e salva novas alterações em v2", async () => {
    const initial = createInitialState();
    const { programs: _programs, ...rest } = initial;
    const old = {
      ...rest,
      version: 1,
      subjects: initial.subjects.map(
        ({ programId: _programId, ...subject }) => subject,
      ),
    };
    old.lessons[0].notes = "Meu resumo preservado";
    localStorage.setItem("ninho-web-preview-v1", JSON.stringify(old));
    const api = browserApi();
    const loaded = await api.load();
    expect(loaded.programs.map((program) => program.id)).toEqual([
      "senado-federal",
      "maua",
    ]);
    expect(loaded.lessons[0].notes).toBe("Meu resumo preservado");
    await api.dispatch({
      type: "settings.update",
      patch: { dailyMinutes: 45 },
    });
    const reloaded = await browserApi().load();
    expect(reloaded.version).toBe(2);
    expect(reloaded.settings.dailyMinutes).toBe(45);
    expect(reloaded.lessons[0].notes).toBe("Meu resumo preservado");
  });
  it("sinaliza estado desconhecido em vez de descartar seus registros", async () => {
    const unknown = { ...createInitialState(), version: 99 };
    const serialized = JSON.stringify(unknown);
    localStorage.setItem("ninho-web-preview-v1", serialized);
    await expect(browserApi().load()).rejects.toThrow();
    expect(localStorage.getItem("ninho-web-preview-v1")).toBe(serialized);
  });
});
