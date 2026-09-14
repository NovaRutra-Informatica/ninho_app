// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reduceMotion, scrollBehavior, transitionPage } from "./motion";

afterEach(() => {
  transitionPage(() => undefined, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as Partial<Document>).startViewTransition;
  delete (document as Partial<Document>).getAnimations;
  document.body.replaceChildren();
});

function motionPreference(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduced })),
  );
}

function transitionFixture() {
  const callbacks: (() => void)[] = [];
  const transitions: { skipTransition: ReturnType<typeof vi.fn> }[] = [];
  document.startViewTransition = vi.fn((callback: any) => {
    callbacks.push(callback);
    const transition = {
      types: new Set<string>(),
      skipTransition: vi.fn(),
      ready: Promise.resolve(),
      finished: new Promise<void>(() => undefined),
      updateCallbackDone: Promise.resolve(),
    };
    transitions.push(transition);
    return transition as ViewTransition;
  });
  return { callbacks, transitions };
}

describe("movimento acessível e navegação rápida", () => {
  it("respeita a preferência do aplicativo e a do Windows a cada uso", () => {
    motionPreference(false);
    expect(reduceMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
    expect(scrollBehavior(true)).toBe("instant");
    motionPreference(true);
    expect(scrollBehavior(false)).toBe("instant");
  });

  it("navega imediatamente sem a API de transições", () => {
    motionPreference(false);
    const update = vi.fn();
    transitionPage(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("não inicia animações quando o Windows pede movimento reduzido", () => {
    motionPreference(true);
    transitionFixture();
    const update = vi.fn();
    transitionPage(update);
    expect(update).toHaveBeenCalledOnce();
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it("mantém a última navegação quando cliques rápidos pulam snapshots", () => {
    motionPreference(false);
    const { callbacks, transitions } = transitionFixture();
    const destinations: string[] = [];
    transitionPage(() => destinations.push("estudos"));
    transitionPage(() => destinations.push("agenda"));
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    callbacks[1]();
    callbacks[0]();
    expect(destinations).toEqual(["estudos", "agenda"]);
  });

  it("conclui a navegação pendente antes de aplicar a preferência reduzida", () => {
    motionPreference(false);
    const { callbacks, transitions } = transitionFixture();
    const destinations: string[] = [];
    transitionPage(() => destinations.push("estudos"));
    expect(document.documentElement.dataset.pageTransition).toBe("true");
    transitionPage(() => destinations.push("hoje"), true);
    callbacks[0]();
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    expect(destinations).toEqual(["estudos", "hoje"]);
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it("uma falha ao iniciar a animação não impede a navegação", () => {
    motionPreference(false);
    document.startViewTransition = vi.fn(() => {
      throw new Error("Snapshot indisponível");
    });
    const update = vi.fn();
    transitionPage(update);
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it("captura o conteúdo novo completo sem reiniciar entradas ou parar animações infinitas", () => {
    motionPreference(false);
    const { callbacks } = transitionFixture();
    const main = document.createElement("main");
    main.className = "main-content";
    const child = document.createElement("section");
    main.append(child);
    document.body.append(main);
    const entrance = {
      effect: { target: child, getTiming: () => ({ iterations: 1 }) },
      finish: vi.fn(),
    };
    const spinner = {
      effect: { target: child, getTiming: () => ({ iterations: Infinity }) },
      finish: vi.fn(),
    };
    const outside = {
      effect: { target: document.body, getTiming: () => ({ iterations: 1 }) },
      finish: vi.fn(),
    };
    document.getAnimations = vi.fn(
      () => [entrance, spinner, outside] as unknown as Animation[],
    );
    transitionPage(() => undefined);
    callbacks[0]();
    expect(entrance.finish).toHaveBeenCalledOnce();
    expect(spinner.finish).not.toHaveBeenCalled();
    expect(outside.finish).not.toHaveBeenCalled();
  });
});
