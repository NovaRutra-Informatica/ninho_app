import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertFileContent,
  isTrustedDocument,
  managedPath,
  materialExtension,
  validateBackupEntryName,
  validateExternalUrl,
  validateStoredName,
} from "./security";

const name = "7d23ae77-055e-43d2-862f-af0f6bb25189.pdf";

describe("limites de acesso do aplicativo", () => {
  it("abre somente links web sem credenciais ou caracteres de controle", () => {
    expect(
      validateExternalUrl(
        "https://www.estrategiaconcursos.com.br/app/dashboard/cursos/240830/aulas",
      ),
    ).toContain("estrategiaconcursos.com.br");
    expect(validateExternalUrl("http://example.com/a?q=teste#pagina")).toBe(
      "http://example.com/a?q=teste#pagina",
    );
    for (const url of [
      "file:///C:/Windows/notepad.exe",
      "javascript:alert(1)",
      "data:text/html,ola",
      "mailto:test@example.com",
      "https://user:pass@example.com",
      "https://example.com\n",
      "",
      "x".repeat(4097),
      3,
      null,
    ]) {
      expect(() => validateExternalUrl(url)).toThrow();
    }
  });

  it("vincula o bridge ao documento local exato, sem aceitar frames externos", () => {
    const document = "file:///C:/Users/aless/Ninho/dist/index.html";
    expect(isTrustedDocument(`${document}#aulas`, document)).toBe(true);
    expect(isTrustedDocument(`${document}?remote=1`, document)).toBe(false);
    expect(
      isTrustedDocument(
        "file:///C:/Users/aless/Ninho/dist/outro.html",
        document,
      ),
    ).toBe(false);
    expect(isTrustedDocument("https://example.com/index.html", document)).toBe(
      false,
    );
    expect(isTrustedDocument("not a url", document)).toBe(false);
    expect(
      isTrustedDocument(
        "http://127.0.0.1:5173/#aulas",
        "http://127.0.0.1:5173/",
      ),
    ).toBe(true);
    expect(
      isTrustedDocument("http://127.0.0.1:5174/", "http://127.0.0.1:5173/"),
    ).toBe(false);
  });

  it("resolve apenas nomes UUID de materiais dentro da biblioteca", () => {
    expect(validateStoredName(name)).toBe(name);
    expect(managedPath("C:/biblioteca", name)).toBe(
      path.resolve("C:/biblioteca", name),
    );
    for (const invalid of [
      "../senha.txt",
      "..\\senha.txt",
      "C:\\Windows\\notepad.exe",
      "/etc/passwd",
      "arquivo.txt",
      `${name}:stream`,
      `${name}.exe`,
      ".",
      "..",
      5,
      null,
    ]) {
      expect(() => validateStoredName(invalid)).toThrow();
      expect(() => managedPath("C:/biblioteca", invalid)).toThrow();
    }
  });

  it("rejeita caminhos de extração perigosos e arquivos fora do contrato do backup", () => {
    for (const valid of [
      "manifest.json",
      "state.json",
      "materials/",
      `materials/${name}`,
    ])
      expect(() => validateBackupEntryName(valid)).not.toThrow();
    for (const invalid of [
      "../state.json",
      "materials/../state.json",
      "materials\\file.txt",
      "/state.json",
      "C:/state.json",
      "materials/deep/" + name,
      "app.exe",
      `materials/${name}:stream`,
    ])
      expect(() => validateBackupEntryName(invalid)).toThrow();
  });

  it("reconhece formatos permitidos e impede executáveis disfarçados", () => {
    expect(materialExtension("AULA.PDF")).toBe("pdf");
    expect(materialExtension("notas.MD")).toBe("md");
    for (const forbidden of [
      "script.exe",
      "script.pdf.exe",
      "script.ps1",
      "link.lnk",
      "site.html",
      "vetor.svg",
      "script.bat",
    ])
      expect(() => materialExtension(forbidden)).toThrow();
    expect(() =>
      assertFileContent("pdf", Buffer.from("%PDF-1.7\n")),
    ).not.toThrow();
    expect(() => assertFileContent("pdf", Buffer.from("MZ%PDF-1.7"))).toThrow(
      /executáveis/,
    );
    expect(() =>
      assertFileContent("txt", Buffer.from([0x7f, 0x45, 0x4c, 0x46])),
    ).toThrow(/executáveis/);
    expect(() =>
      assertFileContent("pdf", Buffer.from("isto não é PDF")),
    ).toThrow(/PDF/);
    expect(() => assertFileContent("png", Buffer.from("PNG"))).toThrow(/PNG/);
    expect(() => assertFileContent("jpg", Buffer.from("JPG"))).toThrow(/JPEG/);
    expect(() => assertFileContent("webp", Buffer.from("WEBP"))).toThrow(
      /WebP/,
    );
    expect(() => assertFileContent("docx", Buffer.from("doc"))).toThrow(
      /Office/,
    );
    expect(() => assertFileContent("txt", Buffer.from([0, 65, 0, 66]))).toThrow(
      /UTF-8/,
    );
  });
});
