// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, NativeApi } from "../shared/types";
import { AppProvider, useApp } from "./store";
import { FocusModal, useFocus } from "./Focus";

const now = new Date("2026-09-14T16:00:00Z");
const key = "ninho-focus-v1";
function native(initial: AppState = createInitialState(now)) {
  let state = initial;
  const api: NativeApi = {
    load: vi.fn(async () => state),
    dispatch: vi.fn(async (command) => {
      state = applyCommand(state, command, new Date());
      return state;
    }),
    importMaterials: vi.fn(),
    previewMaterial: vi.fn(),
    openMaterial: vi.fn(),
    openExternal: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    getPaths: vi.fn(),
  };
  return {
    api,
    get: () => state,
    restore: (next: AppState) => {
      state = next;
      return next;
    },
  };
}
function Harness() {
  const focus = useFocus();
  const { state } = useApp();
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir foco</button>
      <button
        data-testid="select-lesson-a"
        onClick={() => focus.selectLesson("240830:aula:00")}
      >
        Focar aula A
      </button>
      <button
        data-testid="select-lesson-b"
        onClick={() => focus.selectLesson("240830:aula:01")}
      >
        Focar aula B
      </button>
      <button
        data-testid="select-invalid-lesson"
        onClick={() => focus.selectLesson("missing")}
      >
        Aula ausente
      </button>
      <button
        data-testid="select-other-subject"
        onClick={() => focus.setSubject("literatura")}
      >
        Outra matéria
      </button>
      <pre data-testid="timer-state">{JSON.stringify(focus.timer)}</pre>
      <pre data-testid="sessions">{JSON.stringify(state.sessions)}</pre>
      {open && <FocusModal focus={focus} close={() => setOpen(false)} />}
    </>
  );
}
function RestoreHarness({ restore }: { restore: () => AppState }) {
  const { replace } = useApp();
  return (
    <>
      <Harness />
      <button onClick={() => replace(restore())}>
        Restaurar coleção de teste
      </button>
    </>
  );
}
async function mount(api: NativeApi) {
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <AppProvider nativeApi={api}>
        <Harness />
      </AppProvider>,
    );
  });
  return view!;
}
async function click(testId: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
const timer = () => JSON.parse(screen.getByTestId("timer-state").textContent!);

describe("focus timer real command integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts, pauses, resumes and resets without recording a fictitious session", async () => {
    const { api, get } = native();
    await mount(api);
    expect(screen.getByTestId("focus-timer")).toHaveTextContent("25:00");
    await click("focus-start");
    await advance(31_250);
    await click("focus-pause");
    expect(timer().remaining).toBe(1468.75);
    expect(timer().running).toBe(false);
    await advance(20_000);
    expect(timer().remaining).toBe(1468.75);
    await click("focus-start");
    await advance(1750);
    await click("focus-pause");
    expect(timer().remaining).toBe(1467);
    await click("focus-reset");
    expect(timer().remaining).toBe(1500);
    expect(api.dispatch).not.toHaveBeenCalled();
    expect(get().sessions).toHaveLength(0);
  });

  it("records actual early elapsed time including the interval between ticks", async () => {
    const { api, get } = native();
    await mount(api);
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "banco-de-dados" },
    });
    await click("focus-start");
    await advance(1250);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      subjectId: "banco-de-dados",
      kind: "focus",
      durationMinutes: 1.25 / 60,
    });
    expect(timer()).toMatchObject({
      mode: "break",
      running: false,
      remaining: 300,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sessão guardada");
  });

  it("does not save any minutes before one second of actual focus", async () => {
    const { api, get } = native();
    await mount(api);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(0);
    await click("focus-start");
    await advance(750);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(0);
    expect(api.dispatch).not.toHaveBeenCalled();
    expect(timer()).toMatchObject({
      mode: "focus",
      running: false,
      remaining: 1499.25,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Inicie o foco");
  });

  it("finishes automatically once and changes focus to a stopped break", async () => {
    const initial = createInitialState(now);
    initial.settings.focusMinutes = 1;
    const { api, get } = native(initial);
    await mount(api);
    await click("focus-start");
    await advance(60_000);
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0].durationMinutes).toBe(1);
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    expect(timer()).toMatchObject({
      mode: "break",
      remaining: 300,
      running: false,
    });
    await advance(120_000);
    expect(api.dispatch).toHaveBeenCalledTimes(1);
  });

  it("finishes breaks without registering them as studying", async () => {
    const initial = createInitialState(now);
    initial.settings.breakMinutes = 1;
    const { api, get } = native(initial);
    await mount(api);
    fireEvent.click(screen.getByRole("button", { name: /^Pausa$/ }));
    expect(timer()).toMatchObject({ mode: "break", remaining: 60 });
    expect(screen.getByTestId("focus-start")).toHaveTextContent(
      "Começar pausa",
    );
    await click("focus-start");
    await advance(60_000);
    expect(get().sessions).toHaveLength(0);
    expect(api.dispatch).not.toHaveBeenCalled();
    expect(timer()).toMatchObject({ mode: "focus", remaining: 1500 });
  });

  it("continues while its modal is closed", async () => {
    const { api, get } = native();
    await mount(api);
    await click("focus-start");
    await advance(10_000);
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(20_000);
    fireEvent.click(screen.getByRole("button", { name: "Abrir foco" }));
    expect(screen.getByTestId("focus-timer")).toHaveTextContent("24:30");
    await click("focus-finish");
    expect(get().sessions[0].durationMinutes).toBe(0.5);
  });

  it("restores accumulated running time after reload, then resumes without losing it", async () => {
    const { api, get } = native();
    const first = await mount(api);
    await click("focus-start");
    await advance(10_250);
    first.unmount();
    await advance(20_000);
    await mount(api);
    expect(timer()).toMatchObject({ remaining: 1469.75, running: false });
    await click("focus-start");
    await advance(9750);
    await click("focus-finish");
    expect(get().sessions[0].durationMinutes).toBe(40 / 60);
  });

  it("restores a paused timer without counting closed time", async () => {
    const { api, get } = native();
    const first = await mount(api);
    await click("focus-start");
    await advance(15_250);
    await click("focus-pause");
    first.unmount();
    await advance(60_000);
    await mount(api);
    expect(timer()).toMatchObject({ remaining: 1484.75, running: false });
    await click("focus-finish");
    expect(get().sessions[0].durationMinutes).toBe(15.25 / 60);
  });

  it("allows recovery of an expired timer but never credits more than its planned duration", async () => {
    const initial = createInitialState(now);
    initial.settings.focusMinutes = 1;
    const { api, get } = native(initial);
    const first = await mount(api);
    await click("focus-start");
    first.unmount();
    await advance(300_000);
    await mount(api);
    expect(timer()).toMatchObject({ remaining: 0, running: false });
    expect(get().sessions).toHaveLength(0);
    await click("focus-finish");
    expect(get().sessions[0].durationMinutes).toBe(1);
  });

  it("prevents duplicate completion and reset races while disk writing is pending", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    let release!: () => void;
    api.dispatch = vi.fn(async (command) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(command);
    });
    await mount(api);
    await click("focus-start");
    await advance(10_000);
    await click("focus-finish");
    expect(screen.getByTestId("focus-finish")).toBeDisabled();
    expect(screen.getByTestId("focus-reset")).toBeDisabled();
    expect(screen.getByTestId("focus-start")).toBeDisabled();
    fireEvent.click(screen.getByTestId("focus-finish"));
    fireEvent.click(screen.getByTestId("focus-reset"));
    fireEvent.click(screen.getByTestId("focus-start"));
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
    expect(get().sessions).toHaveLength(1);
    expect(timer().mode).toBe("break");
  });

  it("keeps measured time for retry when writing fails and never announces success", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    api.dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disco indisponível"))
      .mockImplementation(original);
    await mount(api);
    await click("focus-start");
    await advance(15_000);
    await click("focus-finish");
    expect(screen.getByRole("alert")).toHaveTextContent("Disco indisponível");
    expect(
      screen.queryByText("Sessão guardada. Cada minuto conta."),
    ).not.toBeInTheDocument();
    expect(timer()).toMatchObject({
      remaining: 1485,
      running: false,
      mode: "focus",
    });
    expect(get().sessions).toHaveLength(0);
    await advance(30_000);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0].durationMinutes).toBe(0.25);
  });

  it("recognizes a session already saved before the timer reset could persist", async () => {
    const { api, get } = native();
    await mount(api);
    await click("focus-start");
    await advance(12_000);
    const pendingTimer = localStorage.getItem(key)!;
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    cleanup();
    localStorage.setItem(key, pendingTimer);
    await mount(api);
    expect(timer().mode).toBe("break");
    expect(get().sessions).toHaveLength(1);
    expect(api.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    "not json",
    "null",
    '{"duration":60,"remaining":999,"running":false,"mode":"focus","endAt":null}',
    '{"duration":60,"remaining":50,"running":true,"mode":"focus","endAt":"bad"}',
    '{"duration":60,"remaining":50,"running":"false","mode":"focus","endAt":null}',
  ])("recovers safely from malformed persistence: %s", (stored) => {
    localStorage.setItem(key, stored);
    return mount(native().api).then(() =>
      expect(timer()).toMatchObject({
        duration: 1500,
        remaining: 1500,
        mode: "focus",
        subjectId: "",
      }),
    );
  });

  it("replaces stale subject references in restored timers", async () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        duration: 60,
        remaining: 30,
        running: false,
        mode: "focus",
        endAt: null,
        subjectId: "removed",
        sessionId: "not-a-uuid",
      }),
    );
    const { api, get } = native();
    await mount(api);
    expect(timer().subjectId).toBe("");
    await click("focus-finish");
    expect(get().sessions[0]).toMatchObject({
      subjectId: "",
      durationMinutes: 0.5,
    });
  });

  it("reports unavailable local timer storage without crashing or claiming persistence", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    await mount(native().api);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível guardar o cronômetro",
    );
    await click("focus-start");
    await advance(1000);
    expect(timer().running).toBe(true);
  });

  it("preserves running time when restoring a collection that no longer contains the selected subject", async () => {
    const { api, get, restore } = native();
    const restoreCollection = () =>
      restore({
        ...get(),
        subjects: [],
        courses: [],
        lessons: [],
        cards: [],
        materials: [],
        exams: [],
        tasks: [],
        sessions: [],
      });
    await act(async () => {
      render(
        <AppProvider nativeApi={api}>
          <RestoreHarness restore={restoreCollection} />
        </AppProvider>,
      );
    });
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "banco-de-dados" },
    });
    await click("focus-start");
    await advance(15_250);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Restaurar coleção de teste" }),
      ),
    );
    expect(timer()).toMatchObject({
      subjectId: "",
      running: true,
      duration: 1500,
    });
    expect(screen.getByTestId("focus-timer")).toHaveTextContent("24:45");
    await advance(4750);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      subjectId: "",
      durationMinutes: 20 / 60,
      kind: "focus",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recognizes a session present in a restored backup while the application stays open", async () => {
    const { api, get, restore } = native();
    let originalId = "";
    const restoreCollection = () => {
      originalId = timer().sessionId;
      return restore({
        ...get(),
        sessions: [
          {
            id: originalId,
            subjectId: "",
            lessonId: "",
            kind: "focus",
            durationMinutes: 0.1,
            completedAt: new Date().toISOString(),
          },
        ],
      });
    };
    await act(async () => {
      render(
        <AppProvider nativeApi={api}>
          <RestoreHarness restore={restoreCollection} />
        </AppProvider>,
      );
    });
    await click("focus-start");
    await advance(10_000);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Restaurar coleção de teste" }),
      ),
    );
    expect(timer()).toMatchObject({
      mode: "break",
      running: false,
      remaining: 300,
    });
    expect(timer().sessionId).not.toBe(originalId);
    expect(get().sessions).toHaveLength(1);
    expect(api.dispatch).not.toHaveBeenCalled();
  });
  it("links exact early study time to the selected lesson without changing its completion status", async () => {
    const { api, get } = native();
    await mount(api);
    await click("select-lesson-a");
    expect(screen.getByLabelText("Aula")).toHaveValue("240830:aula:00");
    expect(screen.getByTestId("focus-lesson")).toHaveTextContent(
      "Banco de dados · Aula 00",
    );
    await click("focus-start");
    await advance(1250);
    await click("focus-finish");
    expect(get().sessions[0]).toMatchObject({
      subjectId: "banco-de-dados",
      lessonId: "240830:aula:00",
      durationMinutes: 1.25 / 60,
    });
    expect(
      get().lessons.find((lesson) => lesson.id === "240830:aula:00")?.status,
    ).toBe("not-started");
    expect(timer()).toMatchObject({
      mode: "break",
      lessonId: "240830:aula:00",
    });
  });

  it("keeps lesson attribution through automatic completion and a full break", async () => {
    const initial = createInitialState(now);
    initial.settings.focusMinutes = 1;
    initial.settings.breakMinutes = 1;
    const { api, get } = native(initial);
    await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(60_000);
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      durationMinutes: 1,
      lessonId: "240830:aula:00",
    });
    await click("focus-start");
    await advance(60_000);
    expect(get().sessions).toHaveLength(1);
    expect(timer()).toMatchObject({
      mode: "focus",
      lessonId: "240830:aula:00",
      remaining: 60,
    });
  });

  it("preserves the lesson and accumulated time across pause, modal close, reload and resume", async () => {
    const { api, get } = native();
    const first = await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(10_250);
    await click("focus-pause");
    fireEvent.click(screen.getByRole("button", { name: "Fechar janela" }));
    await advance(20_000);
    first.unmount();
    await advance(20_000);
    await mount(api);
    expect(timer()).toMatchObject({
      remaining: 1489.75,
      lessonId: "240830:aula:00",
      running: false,
    });
    expect(screen.getByLabelText("Matéria")).toBeDisabled();
    expect(screen.getByLabelText("Aula")).toBeDisabled();
    await click("focus-start");
    await advance(9750);
    await click("focus-finish");
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 20 / 60,
    });
  });

  it("blocks lesson, subject and mode changes after focus starts, without discarding or transferring time", async () => {
    const { api, get } = native();
    await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(4000);
    const originalId = timer().sessionId;
    await click("select-lesson-b");
    expect(timer()).toMatchObject({
      lessonId: "240830:aula:00",
      running: true,
      sessionId: originalId,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Conclua ou reinicie");
    await click("focus-pause");
    await click("select-other-subject");
    fireEvent.click(screen.getByRole("button", { name: /^Pausa$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Foco$/ }));
    expect(timer()).toMatchObject({
      mode: "focus",
      lessonId: "240830:aula:00",
      subjectId: "banco-de-dados",
      remaining: 1496,
      sessionId: originalId,
    });
    await click("select-lesson-a");
    expect(timer().remaining).toBe(1496);
    await click("focus-finish");
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 4 / 60,
    });
  });

  it("allows explicit restart, then starts another lesson with zero transferred time", async () => {
    const { api, get } = native();
    await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(12_000);
    await click("focus-reset");
    expect(timer()).toMatchObject({
      lessonId: "240830:aula:00",
      remaining: 1500,
      running: false,
    });
    expect(get().sessions).toHaveLength(0);
    expect(screen.getByLabelText("Aula")).not.toBeDisabled();
    await click("select-lesson-b");
    await click("focus-start");
    await advance(2000);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:01",
      durationMinutes: 2 / 60,
    });
    await click("select-lesson-a");
    expect(timer()).toMatchObject({
      mode: "focus",
      lessonId: "240830:aula:00",
      remaining: 1500,
    });
  });

  it("guards lesson changes and duplicate completion while a lesson session is being saved", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    let release!: () => void;
    api.dispatch = vi.fn(async (command) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(command);
    });
    await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(5000);
    await click("focus-finish");
    await click("select-lesson-b");
    fireEvent.click(screen.getByTestId("focus-finish"));
    expect(timer().lessonId).toBe("240830:aula:00");
    expect(api.dispatch).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 5 / 60,
    });
  });

  it("retains both elapsed time and lesson context after a failed write, allowing one safe retry", async () => {
    const { api, get } = native();
    const original = api.dispatch;
    api.dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disco indisponível"))
      .mockImplementation(original);
    await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(15000);
    await click("focus-finish");
    expect(screen.getByRole("alert")).toHaveTextContent("Disco indisponível");
    expect(get().sessions).toHaveLength(0);
    await click("select-lesson-b");
    expect(timer()).toMatchObject({
      lessonId: "240830:aula:00",
      remaining: 1485,
    });
    await advance(10000);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 0.25,
    });
  });

  it.each(["missing", "240664:aula:00"])(
    "normalizes an unavailable or mismatched persisted lesson %s without crediting another lesson",
    async (lessonId) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          duration: 60,
          remaining: 30,
          running: false,
          mode: "focus",
          endAt: null,
          subjectId: "banco-de-dados",
          lessonId,
          sessionId: "195a26a9-aa0b-4f08-9d50-789b8842e3cb",
        }),
      );
      const { api, get } = native();
      await mount(api);
      expect(timer()).toMatchObject({
        lessonId: "",
        subjectId: "banco-de-dados",
        remaining: 30,
      });
      expect(screen.getByRole("status")).toHaveTextContent(
        "nenhum minuto foi transferido",
      );
      await click("focus-finish");
      expect(get().sessions[0]).toMatchObject({
        lessonId: "",
        durationMinutes: 0.5,
      });
    },
  );

  it("retains lesson focus from a running persisted timer and avoids a second record after replaying a saved timer", async () => {
    const { api, get } = native();
    const first = await mount(api);
    await click("select-lesson-a");
    await click("focus-start");
    await advance(10000);
    const beforeFinish = localStorage.getItem(key)!;
    first.unmount();
    await advance(5000);
    const second = await mount(api);
    expect(timer()).toMatchObject({
      lessonId: "240830:aula:00",
      remaining: 1485,
      running: false,
    });
    await click("focus-finish");
    expect(get().sessions[0]).toMatchObject({
      lessonId: "240830:aula:00",
      durationMinutes: 0.25,
    });
    second.unmount();
    localStorage.setItem(key, beforeFinish);
    await mount(api);
    expect(timer()).toMatchObject({
      mode: "break",
      lessonId: "240830:aula:00",
    });
    expect(get().sessions).toHaveLength(1);
    expect(api.dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects nonexistent lessons and retains generic focus compatibility with old timers", async () => {
    const { api, get } = native();
    await mount(api);
    await click("select-invalid-lesson");
    expect(timer()).toMatchObject({ lessonId: "", remaining: 1500 });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "não está mais disponível",
    );
    await click("focus-start");
    await advance(1000);
    await click("focus-finish");
    expect(get().sessions[0].lessonId).toBe("");
  });

  it("lets a fresh timer choose an optional lesson within its subject and clears the lesson when changing subject", async () => {
    await mount(native().api);
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "banco-de-dados" },
    });
    fireEvent.change(screen.getByLabelText("Aula"), {
      target: { value: "240830:aula:00" },
    });
    expect(timer()).toMatchObject({
      subjectId: "banco-de-dados",
      lessonId: "240830:aula:00",
      running: false,
    });
    fireEvent.change(screen.getByLabelText("Matéria"), {
      target: { value: "literatura" },
    });
    expect(timer()).toMatchObject({ subjectId: "literatura", lessonId: "" });
    expect(
      screen
        .getByLabelText("Aula")
        .querySelector('option[value="240830:aula:00"]'),
    ).toBeNull();
  });

  it("preserves running time without attributing it to another lesson when a restored backup removes the active lesson", async () => {
    const { api, get, restore } = native();
    const restoreCollection = () =>
      restore({
        ...get(),
        lessons: get().lessons.filter((item) => item.id !== "240830:aula:00"),
        cards: get().cards.filter((item) => item.lessonId !== "240830:aula:00"),
      });
    await act(async () => {
      render(
        <AppProvider nativeApi={api}>
          <RestoreHarness restore={restoreCollection} />
        </AppProvider>,
      );
    });
    await click("select-lesson-a");
    await click("focus-start");
    await advance(15_250);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Restaurar coleção de teste" }),
      ),
    );
    expect(timer()).toMatchObject({
      subjectId: "banco-de-dados",
      lessonId: "",
      running: true,
      duration: 1500,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "nenhum minuto foi transferido",
    );
    await advance(4750);
    await click("focus-finish");
    expect(get().sessions).toHaveLength(1);
    expect(get().sessions[0]).toMatchObject({
      lessonId: "",
      subjectId: "banco-de-dados",
      durationMinutes: 20 / 60,
    });
  });
});
