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
import {
  Confirm,
  Empty,
  Modal,
  normalizeSearch,
  Owl,
  prettyDate,
  ProgressBar,
  SearchBox,
  timeText,
} from "./ui";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("accessible modal behavior", () => {
  it("renders outside transformed and scrolled page ancestors so the dialog stays in the viewport", () => {
    const view = render(
      <section style={{ transform: "translateY(10px)", overflow: "hidden" }}>
        <Modal title="Material" close={vi.fn()}>
          <p>PDF</p>
        </Modal>
      </section>,
    );
    const dialog = screen.getByRole("dialog", { name: "Material" });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(view.container).not.toContainElement(dialog);
  });
  it("focuses its controls, traps forward and backward Tab, closes on Escape and restores previous focus", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.append(opener);
    opener.focus();
    const view = render(
      <Modal title="Editar aula" close={close}>
        <input aria-label="Título" />
        <button>Salvar</button>
      </Modal>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const first = screen.getByRole("button", { name: "Fechar janela" }),
      last = screen.getByRole("button", { name: "Salvar" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("ignores disabled, hidden and negative-tabindex elements when wrapping focus", () => {
    render(
      <Modal title="Acessível" close={vi.fn()}>
        <button disabled>Desabilitado</button>
        <input type="hidden" />
        <button>Último</button>
        <button hidden>Oculto</button>
        <a href="#" tabIndex={-1}>
          Ignorar
        </a>
        <button style={{ display: "none" }}>Invisível</button>
      </Modal>,
    );
    const first = screen.getByRole("button", { name: "Fechar janela" });
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Último" })).toHaveFocus();
  });

  it("uses the current close callback and only treats backdrop clicks as dismissals", () => {
    const oldClose = vi.fn(),
      newClose = vi.fn();
    const view = render(
      <Modal title="Janela" close={oldClose}>
        <p>Conteúdo</p>
      </Modal>,
    );
    view.rerender(
      <Modal title="Janela" close={newClose}>
        <p>Conteúdo</p>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByText("Conteúdo"));
    expect(newClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(newClose).toHaveBeenCalledTimes(1);
    expect(oldClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(newClose).toHaveBeenCalledTimes(2);
  });
});

describe("confirmation and simple controls", () => {
  it("does not confirm twice while pending and closes only after success", async () => {
    let release!: () => void;
    const close = vi.fn();
    const confirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <Confirm
        title="Remover"
        text="Excluir este material?"
        close={close}
        confirm={confirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const pending = screen.getByRole("button", { name: "Aguarde…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await act(async () => release());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed confirmation open for retry", async () => {
    const close = vi.fn(),
      confirm = vi
        .fn()
        .mockRejectedValueOnce(new Error("Not saved"))
        .mockResolvedValue(undefined);
    render(
      <Confirm
        title="Remover"
        text="Excluir?"
        close={close}
        confirm={confirm}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Excluir" })),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Excluir" })),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("search input sends text and clears without submitting forms", () => {
    const change = vi.fn();
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        <SearchBox value="Banco" onChange={change} />
      </form>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Literatura" },
    });
    expect(change).toHaveBeenCalledWith("Literatura");
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(change).toHaveBeenCalledWith("");
    expect(submit).not.toHaveBeenCalled();
  });

  it("offers an explicit action from an empty state", () => {
    const action = vi.fn();
    render(
      <Empty
        title="Sem provas"
        text="Adicione a primeira."
        action={action}
        label="Marcar prova"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar prova" }));
    expect(action).toHaveBeenCalledOnce();
  });
});

describe("display helpers", () => {
  it.each([
    [0, "00:00"],
    [1, "00:01"],
    [59.9, "00:59"],
    [60, "01:00"],
    [1500, "25:00"],
    [10800, "180:00"],
    [-10, "00:00"],
    [NaN, "00:00"],
    [Infinity, "00:00"],
  ])("formats timer seconds %s as %s", (input, expected) =>
    expect(timeText(input as number)).toBe(expected),
  );
  it.each([
    [-10, "0"],
    [200, "100"],
    [45.2, "45"],
    [NaN, "0"],
    [Infinity, "0"],
  ])("clamps accessible progress %s to %s", (input, expected) => {
    render(<ProgressBar value={input as number} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      expected as string,
    );
    expect(
      screen.getByRole("progressbar").firstElementChild?.getAttribute("style"),
    ).not.toContain("NaN");
  });
  it("matches Portuguese accents and decomposed accents equally", () => {
    expect(normalizeSearch("Ciência da Computação")).toBe(
      "ciencia da computacao",
    );
    expect(normalizeSearch("LÍNGUA PORTUGUESA")).toBe("lingua portuguesa");
    expect(normalizeSearch("São Caetano")).toContain(normalizeSearch("sao"));
  });
  it("keeps date-only exam dates on their intended calendar date", () =>
    expect(
      prettyDate("2026-09-14", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    ).toBe("14/09/2026"));
  it("provides an accessible mascot with valid numeric geometry", () => {
    render(<Owl />);
    const owl = screen.getByRole("img", { name: "Íris, a coruja do Ninho" });
    for (const ellipse of owl.querySelectorAll("ellipse"))
      expect(Number.isFinite(Number(ellipse.getAttribute("rx")))).toBe(true);
  });
});
