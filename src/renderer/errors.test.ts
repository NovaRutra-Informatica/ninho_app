import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("mensagens de falha para a interface", () => {
  it.each([
    "Error invoking remote method 'ninho:material:open': Error: O arquivo está fora da biblioteca.",
    'Error invoking remote method "ninho:material:open": Error: O arquivo está fora da biblioteca.',
    "Error: Error invoking remote method 'ninho:material:open': Error: O arquivo está fora da biblioteca.",
    "Error invoking remote method 'outer': Error: Error invoking remote method 'inner': Error: O arquivo está fora da biblioteca.",
  ])("preserva a causa sem o envelope IPC: %s", (message) => {
    expect(errorMessage(new Error(message))).toBe(
      "O arquivo está fora da biblioteca.",
    );
  });
  it("mantém instrução útil, código de erro e o nome do arquivo", () => {
    const detail =
      "Não foi possível abrir Aula 00.pdf (EACCES). Verifique a permissão de leitura.";
    expect(
      errorMessage({
        message: `Error invoking remote method 'open': Error: ${detail}`,
      }),
    ).toBe(detail);
  });
  it("preserva mensagens de validação com mais de uma linha", () => {
    const detail =
      "O backup não pôde ser restaurado.\nMaterial ausente: resumo.pdf.";
    expect(errorMessage(new Error(detail))).toBe(detail);
  });
  it("retira locais da pilha sem ocultar a falha", () => {
    expect(
      errorMessage(
        "Error: Não foi possível gravar.\n    at save (app.cjs:1:22)\n    at async dispatch",
      ),
    ).toBe("Não foi possível gravar.");
  });
  it.each([undefined, null, {}, 42, "", "  ", "Error: ", "[object Object]"])(
    "usa orientação explícita quando não há mensagem útil: %j",
    (value) => {
      expect(errorMessage(value, "Não foi possível abrir o arquivo.")).toBe(
        "Não foi possível abrir o arquivo.",
      );
    },
  );
  it("não inventa sucesso quando a falha não traz detalhes", () => {
    expect(errorMessage(undefined)).toBe(
      "Não foi possível concluir esta ação. Tente novamente.",
    );
  });
  it("não remove texto técnico que faz parte do motivo", () => {
    expect(errorMessage("TypeError: O formato não é compatível.")).toBe(
      "TypeError: O formato não é compatível.",
    );
  });
});
