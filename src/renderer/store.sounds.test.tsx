// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act as reactAct,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, Command, NativeApi } from "../shared/types";
import { AppProvider, useApp } from "./store";
import { StudySoundPlayer } from "./sounds";
import { useFocus } from "./Focus";

const now = new Date("2026-09-14T16:00:00Z");
function fixture() {
  const state = createInitialState(now);
  state.settings.sound = true;
  return state;
}
function native(initial = fixture()) {
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
  return { api, get: () => state };
}
function Harness({ command }: { command: Command }) {
  const { act, state, replace, playSound } = useApp();
  return (
    <>
      <button onClick={() => void act(command).catch(() => {})}>
        Executar
      </button>
      <button
        onClick={() =>
          replace({ ...state, settings: { ...state.settings, sound: false } })
        }
      >
        Restaurar sem som
      </button>
      <button onClick={() => playSound("complete")}>Aviso de pausa</button>
      <output data-testid="sound-pref">{String(state.settings.sound)}</output>
    </>
  );
}
function FocusHarness() {
  const focus = useFocus();
  return (
    <>
      <button onClick={focus.toggle}>Iniciar</button>
      <button onClick={() => void focus.finish()}>Concluir</button>
      <button onClick={() => focus.reset("break")}>Pausa</button>
    </>
  );
}
async function click(name: string) {
  await reactAct(async () =>
    fireEvent.click(screen.getByRole("button", { name })),
  );
}
describe("provider routes only saved successes to study sounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const setup = async (api: NativeApi, command: Command) => {
    let view!: ReturnType<typeof render>;
    await reactAct(async () => {
      view = render(
        <AppProvider nativeApi={api}>
          <Harness command={command} />
        </AppProvider>,
      );
    });
    return view;
  };
  it("does not play on loading; waits for persistence before a successful save", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const initial = fixture();
    const { api } = native(initial);
    const command: Command = {
      type: "lesson.update",
      id: initial.lessons[0].id,
      patch: { notes: "Nota" },
    };
    let done!: (state: AppState) => void;
    api.dispatch = vi.fn(
      () =>
        new Promise<AppState>((resolve) => {
          done = resolve;
        }),
    );
    await setup(api, command);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));
    expect(play).not.toHaveBeenCalled();
    await reactAct(async () => done(applyCommand(initial, command, now)));
    expect(play).toHaveBeenCalledExactlyOnceWith("save");
  });
  it("routes review and completion through their real persisted commands", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const initial = fixture();
    const { api } = native(initial);
    const view = await setup(api, {
      type: "card.review",
      id: initial.cards[0].id,
      rating: "hard",
    });
    await click("Executar");
    expect(play).toHaveBeenLastCalledWith("review");
    const command: Command = {
      type: "lesson.update",
      id: initial.lessons[0].id,
      patch: { status: "done" },
    };
    await reactAct(async () =>
      view.rerender(
        <AppProvider nativeApi={api}>
          <Harness command={command} />
        </AppProvider>,
      ),
    );
    await click("Executar");
    await click("Executar");
    expect(play.mock.calls.map(([cue]) => cue)).toEqual(["review", "complete"]);
  });
  it("does not celebrate failed saves and preserves the actionable error", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const { api } = native();
    api.dispatch = vi.fn().mockRejectedValue(new Error("Disco indisponível"));
    await setup(api, { type: "settings.update", patch: { name: "Novo" } });
    await click("Executar");
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Disco indisponível");
  });
  it("disabling sounds or restoring a muted collection stops the player and mutes direct notices", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const close = vi.spyOn(StudySoundPlayer.prototype, "close");
    const { api } = native();
    await setup(api, { type: "settings.update", patch: { sound: false } });
    await click("Executar");
    await click("Aviso de pausa");
    expect(play).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    await click("Restaurar sem som");
    expect(screen.getByTestId("sound-pref")).toHaveTextContent("false");
  });
  it("unmount closes resources and ignores an outstanding successful save", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const close = vi.spyOn(StudySoundPlayer.prototype, "close");
    const initial = fixture();
    const { api } = native(initial);
    let done!: (state: AppState) => void;
    api.dispatch = vi.fn(
      () =>
        new Promise<AppState>((resolve) => {
          done = resolve;
        }),
    );
    const command: Command = {
      type: "settings.update",
      patch: { name: "Novo" },
    };
    const view = await setup(api, command);
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));
    view.unmount();
    await reactAct(async () => done(applyCommand(initial, command, now)));
    expect(close).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
  it("focus completion has exactly one cue and no legacy AudioContext beep", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const legacy = vi.fn(function () {
      throw new Error("Unexpected legacy beep");
    });
    vi.stubGlobal("AudioContext", legacy);
    const { api, get } = native();
    await reactAct(async () =>
      render(
        <AppProvider nativeApi={api}>
          <FocusHarness />
        </AppProvider>,
      ),
    );
    await click("Iniciar");
    await reactAct(async () => vi.advanceTimersByTimeAsync(5_000));
    await click("Concluir");
    expect(
      get().sessions.filter((session) => session.kind === "focus"),
    ).toHaveLength(1);
    expect(play).toHaveBeenCalledExactlyOnceWith("focusDone");
    expect(legacy).not.toHaveBeenCalled();
  });
  it("break completion uses a cue without creating study time", async () => {
    const play = vi
      .spyOn(StudySoundPlayer.prototype, "play")
      .mockResolvedValue();
    const { api, get } = native();
    await reactAct(async () =>
      render(
        <AppProvider nativeApi={api}>
          <FocusHarness />
        </AppProvider>,
      ),
    );
    await click("Pausa");
    await click("Iniciar");
    await reactAct(async () => vi.advanceTimersByTimeAsync(5_000));
    await click("Concluir");
    expect(get().sessions).toHaveLength(0);
    expect(play).toHaveBeenCalledExactlyOnceWith("complete");
  });
});
