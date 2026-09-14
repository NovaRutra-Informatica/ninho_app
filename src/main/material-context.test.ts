import { describe, expect, it } from "vitest";
import { createInitialState } from "../domain";
import { inferMaterialContext } from "./material-context";
const state = createInitialState();
describe("organização dos PDFs do Estratégia", () => {
  it("reconhece Banco de dados e Literatura por módulo e número da aula", () => {
    expect(
      inferMaterialContext(state, "curso-240830-aula-00-d48c-completo.pdf"),
    ).toEqual({ subjectId: "banco-de-dados", lessonId: "240830:aula:00" });
    expect(
      inferMaterialContext(state, "curso-240664-aula-5-7ee6-completo.PDF"),
    ).toEqual({ subjectId: "literatura", lessonId: "240664:aula:05" });
  });
  it("mantém a matéria escolhida pelo usuário e não cruza aulas de outra matéria", () => {
    expect(
      inferMaterialContext(state, "curso-240830-aula-00-d48c-completo.pdf", {
        subjectId: "literatura",
      }),
    ).toEqual({ subjectId: "literatura", lessonId: "" });
    expect(
      inferMaterialContext(state, "anotacao.txt", {
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:00",
      }),
    ).toEqual({ subjectId: "banco-de-dados", lessonId: "240830:aula:00" });
  });
  it("infere a aula quando omitida, mas respeita um vínculo vazio explícito", () => {
    const filename = "curso-240830-aula-00-d48c-completo.pdf";
    expect(
      inferMaterialContext(state, filename, {
        subjectId: "banco-de-dados",
        lessonId: undefined,
      }),
    ).toEqual({ subjectId: "banco-de-dados", lessonId: "240830:aula:00" });
    expect(
      inferMaterialContext(state, filename, {
        subjectId: "banco-de-dados",
        lessonId: "",
      }),
    ).toEqual({ subjectId: "banco-de-dados", lessonId: "" });
  });
  it("prioriza a aula escolhida explicitamente sobre o número no nome do PDF", () => {
    const filename = "curso-240830-aula-00-d48c-completo.pdf";
    expect(
      inferMaterialContext(state, filename, {
        subjectId: "banco-de-dados",
        lessonId: "240830:aula:01",
      }),
    ).toEqual({ subjectId: "banco-de-dados", lessonId: "240830:aula:01" });
    expect(
      inferMaterialContext(state, filename, {
        subjectId: "literatura",
        lessonId: "240664:aula:05",
      }),
    ).toEqual({ subjectId: "literatura", lessonId: "240664:aula:05" });
  });
  it("só usa módulo conhecido e deixa aula desconhecida sem vínculo", () => {
    expect(inferMaterialContext(state, "curso-999999-aula-00-a.pdf")).toEqual({
      subjectId: "",
      lessonId: "",
    });
    expect(inferMaterialContext(state, "curso-240830-aula-99-a.pdf")).toEqual({
      subjectId: "banco-de-dados",
      lessonId: "",
    });
    expect(inferMaterialContext(state, "curso-240830-aula-00-a.exe")).toEqual({
      subjectId: "",
      lessonId: "",
    });
  });
});
