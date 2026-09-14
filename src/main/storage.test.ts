import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../domain";
import type { AppState } from "../shared/types";
import { DataRecoveryError, readBackup, StudyStore } from "./storage";
import { MAX_MATERIAL_BYTES } from "./security";

const fixedNow = new Date("2026-09-14T12:00:00.000Z");
function initial(): AppState {
  const state = createInitialState(fixedNow);
  return {
    ...state,
    subjects: [
      {
        id: "sub1",
        name: "Banco de dados",
        track: "concurso",
        color: "#66895A",
      },
    ],
    courses: [
      {
        id: "course1",
        subjectId: "sub1",
        title: "Senado Federal",
        provider: "Estratégia",
        url: "https://www.estrategiaconcursos.com.br/",
      },
    ],
    lessons: [
      {
        id: "lesson1",
        courseId: "course1",
        subjectId: "sub1",
        title: "Aula 00",
        description: "Fundamentos",
        url: "https://www.estrategiaconcursos.com.br/",
        order: 0,
        status: "not-started",
        updatedAt: null,
        notes: "",
      },
    ],
    cards: [],
    exams: [],
    materials: [],
    sessions: [],
    tasks: [],
  };
}
const pdf = Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=",
  "base64",
);
const sha = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

let root: string;
let sourceDirectory: string;
let directory: string;
let store: StudyStore;

async function source(
  name: string,
  contents: string | Buffer,
): Promise<string> {
  const file = path.join(sourceDirectory, name);
  await fs.writeFile(file, contents);
  return file;
}

async function fixtureBackup(): Promise<{ zip: AdmZip; file: string }> {
  await store.importFiles(
    [
      await source("aula.pdf", pdf),
      await source("resumo.txt", "Resumo íntegro"),
    ],
    { subjectId: "sub1", lessonId: "lesson1" },
  );
  const file = path.join(root, "backup.zip");
  await store.exportBackup(file);
  return { file, zip: new AdmZip(await fs.readFile(file)) };
}

function mutatePayload(zip: AdmZip, entry: string, value: Buffer): void {
  zip.updateFile(entry, value);
  const manifest = JSON.parse(zip.readAsText("manifest.json"));
  const index = manifest.files.find(
    (file: { path: string }) => file.path === entry,
  );
  index.size = value.length;
  index.sha256 = sha(value);
  zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ninho-storage-test-"));
  sourceDirectory = path.join(root, "originais");
  directory = path.join(root, "dados");
  await fs.mkdir(sourceDirectory);
  store = new StudyStore(directory, initial);
});

afterEach(async () => {
  if (
    !root ||
    !path.basename(root).startsWith("ninho-storage-test-") ||
    path.dirname(root).toLowerCase() !== os.tmpdir().toLowerCase()
  )
    throw new Error("Pasta de teste fora do diretório temporário.");
  await fs.rm(root, { recursive: true, force: true });
});

describe("estado local durável", () => {
  it("inicializa uma vez, devolve cópias e persiste sem criar progresso fictício", async () => {
    const state = await store.load();
    expect(state.sessions).toEqual([]);
    state.settings.name = "Mutação fora do store";
    expect((await store.load()).settings.name).not.toBe(
      "Mutação fora do store",
    );
    const reopened = await new StudyStore(directory, () => {
      throw new Error("Não deve reiniciar");
    }).load();
    expect(reopened).toEqual(initial());
    expect(
      JSON.parse(await fs.readFile(path.join(directory, "state.json"), "utf8")),
    ).toEqual(initial());
  });

  it("serializa escritas concorrentes sem perder mudanças e deixa a fila utilizável após um erro", async () => {
    await Promise.all([
      store.dispatch({
        type: "settings.update",
        patch: { name: "Alessandro" },
      }),
      store.dispatch({
        type: "task.save",
        task: {
          id: "task1",
          title: "Revisar SQL",
          date: "2026-09-15",
          subjectId: "sub1",
          completed: false,
        },
      }),
      store.dispatch({
        type: "lesson.update",
        id: "lesson1",
        patch: { status: "done" },
      }),
    ]);
    await expect(
      store.dispatch({
        type: "lesson.update",
        id: "missing",
        patch: { status: "done" },
      }),
    ).rejects.toThrow();
    await store.dispatch({
      type: "settings.update",
      patch: { dailyMinutes: 30 },
    });
    const loaded = await new StudyStore(directory, initial).load();
    expect(loaded.settings.name).toBe("Alessandro");
    expect(loaded.settings.dailyMinutes).toBe(30);
    expect(loaded.tasks[0].title).toBe("Revisar SQL");
    expect(loaded.lessons[0].status).toBe("done");
    const files = await fs.readdir(directory);
    expect(files.filter((file) => file.endsWith(".tmp"))).toEqual([]);
    expect(files).toContain("state.previous.json");
  });

  it("recupera a cópia anterior e preserva o JSON corrompido com aviso explícito", async () => {
    await store.load();
    await store.dispatch({
      type: "settings.update",
      patch: { dailyMinutes: 50 },
    });
    await fs.writeFile(
      path.join(directory, "state.json"),
      "{arquivo interrompido",
    );
    const recoveredStore = new StudyStore(directory, initial);
    const recovered = await recoveredStore.load();
    expect(recovered.settings.dailyMinutes).toBe(
      initial().settings.dailyMinutes,
    );
    expect(recoveredStore.takeRecoveryNotice()).toContain("cópia anterior");
    expect(recoveredStore.takeRecoveryNotice()).toBeNull();
    const preserved = (await fs.readdir(store.backupsDirectory)).find((file) =>
      file.startsWith("state-corrompido"),
    )!;
    expect(
      await fs.readFile(path.join(store.backupsDirectory, preserved), "utf8"),
    ).toBe("{arquivo interrompido");
  });

  it("não substitui dados corrompidos por uma coleção nova quando não há cópia válida", async () => {
    await store.load();
    await fs.writeFile(path.join(directory, "state.json"), "invalid JSON");
    await expect(
      new StudyStore(directory, initial).load(),
    ).rejects.toBeInstanceOf(DataRecoveryError);
    expect(await fs.readFile(path.join(directory, "state.json"), "utf8")).toBe(
      "invalid JSON",
    );
  });

  it("recupera um state.json ausente a partir da cópia anterior", async () => {
    await store.dispatch({
      type: "settings.update",
      patch: { name: "Nome alterado" },
    });
    await fs.unlink(path.join(directory, "state.json"));
    const recoveredStore = new StudyStore(directory, initial);
    expect((await recoveredStore.load()).settings.name).toBe(
      initial().settings.name,
    );
    expect(recoveredStore.takeRecoveryNotice()).toBeTruthy();
  });
});

describe("biblioteca de materiais", () => {
  it("copia PDF, texto e imagem, mantém originais e oferece prévias sem caminhos privados", async () => {
    const originals = [
      await source("aula.PDF", pdf),
      await source("resumo.txt", "Uma revisão de SQL."),
      await source("diagrama.png", png),
    ];
    const state = await store.importFiles(originals, {
      subjectId: "sub1",
      lessonId: "lesson1",
    });
    expect(state.materials).toHaveLength(3);
    expect(
      state.materials.every(
        (material) =>
          material.subjectId === "sub1" && material.lessonId === "lesson1",
      ),
    ).toBe(true);
    const pdfPreview = await store.previewMaterial(state.materials[0].id);
    expect(pdfPreview).toMatchObject({
      kind: "pdf",
      mime: "application/pdf",
      name: "aula.PDF",
      data: pdf.toString("base64"),
    });
    expect(await store.previewMaterial(state.materials[1].id)).toMatchObject({
      kind: "text",
      data: "Uma revisão de SQL.",
    });
    expect(await store.previewMaterial(state.materials[2].id)).toMatchObject({
      kind: "image",
      mime: "image/png",
    });
    expect(JSON.stringify(pdfPreview)).not.toContain(
      directory.replaceAll("\\", "\\\\"),
    );
    for (const original of originals)
      expect((await fs.stat(original)).isFile()).toBe(true);
    const managed = await store.resolveMaterial(state.materials[0].id);
    expect(path.dirname(managed)).toBe(store.materialsDirectory);
    expect(await fs.readFile(managed)).toEqual(pdf);
  });

  it("suporta Markdown, JPEG, WebP e documentos Office com abertura externa", async () => {
    const files = [
      await source("notas.md", "# Lembrete"),
      await source("imagem.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
      await source("imagem.webp", Buffer.from("RIFF1234WEBP")),
    ];
    for (const ext of ["docx", "pptx", "xlsx"])
      files.push(
        await source(`aula.${ext}`, Buffer.from([0x50, 0x4b, 0x03, 0x04])),
      );
    const state = await store.importFiles(files);
    expect((await store.previewMaterial(state.materials[0].id)).kind).toBe(
      "text",
    );
    expect((await store.previewMaterial(state.materials[1].id)).mime).toBe(
      "image/jpeg",
    );
    expect((await store.previewMaterial(state.materials[2].id)).mime).toBe(
      "image/webp",
    );
    for (const material of state.materials.slice(3))
      expect(await store.previewMaterial(material.id)).toEqual({
        kind: "external",
        name: material.name,
      });
  });

  it("limita a prévia de texto a 1 MB preservando o anexo completo", async () => {
    const original = await source("livro.txt", "a".repeat(1024 * 1024 + 10));
    const state = await store.importFiles([original]);
    const preview = await store.previewMaterial(state.materials[0].id);
    expect(preview.data).toContain("Prévia limitada a 1 MB");
    expect(preview.data!.length).toBeLessThan(1024 * 1024 + 150);
    expect(
      (await fs.stat(await store.resolveMaterial(state.materials[0].id))).size,
    ).toBe(1024 * 1024 + 10);
  });

  it("rejeita extensões executáveis, arquivos disfarçados, pastas e vínculos inválidos", async () => {
    await expect(
      store.importFiles([await source("programa.exe", "MZ")]),
    ).rejects.toThrow(/Formato/);
    await expect(
      store.importFiles([await source("programa.pdf", "MZ%PDF-1.7")]),
    ).rejects.toThrow(/executáveis/);
    const directoryPdf = path.join(sourceDirectory, "pasta.pdf");
    await fs.mkdir(directoryPdf);
    await expect(store.importFiles([directoryPdf])).rejects.toThrow(
      /arquivo comum/,
    );
    const original = await source("aula.pdf", pdf);
    await expect(
      store.importFiles([original], { subjectId: "inexistente" }),
    ).rejects.toThrow();
    await expect(
      store.importFiles([original], { lessonId: "lesson1" }),
    ).rejects.toThrow();
    await expect(store.importFiles([])).rejects.toThrow();
    await expect(store.importFiles(["relative.pdf"])).rejects.toThrow(
      /Caminho/,
    );
    expect((await store.load()).materials).toEqual([]);
    expect(await fs.readdir(store.materialsDirectory)).toEqual([]);
  });

  it("rejeita arquivos de mais de 100 MB antes de carregá-los na memória", async () => {
    const large = await source("grande.txt", "");
    await fs.truncate(large, MAX_MATERIAL_BYTES + 1);
    await expect(store.importFiles([large])).rejects.toThrow(/100 MB/);
    expect((await store.load()).materials).toEqual([]);
  });

  it("desfaz cópias de um lote inteiro quando qualquer anexo falha", async () => {
    const good = await source("bom.pdf", pdf);
    const bad = await source("ruim.pdf", "não é PDF");
    await expect(store.importFiles([good, bad])).rejects.toThrow(/PDF/);
    expect((await store.load()).materials).toEqual([]);
    expect(await fs.readdir(store.materialsDirectory)).toEqual([]);
    expect(await fs.readFile(good)).toEqual(pdf);
  });

  it("remove materiais do índice sem apagar o original e impede aberturas de IDs ausentes", async () => {
    const original = await source("aula.pdf", pdf);
    const added = await store.importFiles([original]);
    const id = added.materials[0].id;
    await store.dispatch({
      type: "material.update",
      id,
      patch: { notes: "Ler página 10" },
    });
    expect((await store.load()).materials[0].notes).toBe("Ler página 10");
    await store.dispatch({ type: "material.remove", id });
    expect((await store.load()).materials).toEqual([]);
    await expect(store.resolveMaterial(id)).rejects.toThrow(/não está mais/);
    await expect(store.previewMaterial("../state.json")).rejects.toThrow();
    expect(await fs.readFile(original)).toEqual(pdf);
  });

  it("explica quando o arquivo gerenciado desapareceu", async () => {
    const state = await store.importFiles([await source("aula.pdf", pdf)]);
    await fs.unlink(await store.resolveMaterial(state.materials[0].id));
    await expect(store.previewMaterial(state.materials[0].id)).rejects.toThrow(
      /não foi encontrado/,
    );
  });
});

describe("backup completo e restauração", () => {
  it("exporta estado e anexos com hashes e restaura mantendo uma cópia de segurança anterior", async () => {
    const { file, zip } = await fixtureBackup();
    const before = await store.load();
    expect(zip.getEntries().map((entry) => entry.entryName)).toContain(
      "state.json",
    );
    const parsed = readBackup(await fs.readFile(file));
    expect(parsed.state).toEqual(before);
    expect(parsed.materials.size).toBe(2);
    await store.dispatch({
      type: "settings.update",
      patch: { name: "Depois do backup" },
    });
    const restored = await store.restoreBackup(file);
    expect(restored.settings.name).toBe(before.settings.name);
    expect(restored.materials.map((material) => material.id)).toEqual(
      before.materials.map((material) => material.id),
    );
    expect(restored.materials[0].storedName).not.toBe(
      before.materials[0].storedName,
    );
    expect(await store.previewMaterial(restored.materials[0].id)).toMatchObject(
      { data: pdf.toString("base64") },
    );
    const safety = (await fs.readdir(store.backupsDirectory)).find((name) =>
      name.startsWith("antes-de-restaurar"),
    )!;
    expect(safety).toBeTruthy();
    expect(
      readBackup(await fs.readFile(path.join(store.backupsDirectory, safety)))
        .state.settings.name,
    ).toBe("Depois do backup");
    expect(await new StudyStore(directory, initial).load()).toEqual(restored);
  });

  it("recupera uma coleção corrompida a partir de backup escolhido sem apagar os dados ruins", async () => {
    const { file } = await fixtureBackup();
    await fs.writeFile(path.join(directory, "state.json"), "broken-current");
    await fs.writeFile(
      path.join(directory, "state.previous.json"),
      "broken-previous",
    );
    const broken = new StudyStore(directory, initial);
    await expect(broken.load()).rejects.toBeInstanceOf(DataRecoveryError);
    const restored = await broken.restoreBackup(file);
    expect(restored.materials).toHaveLength(2);
    expect(
      await broken.previewMaterial(restored.materials[0].id),
    ).toMatchObject({ kind: "pdf" });
    const backups = await fs.readdir(store.backupsDirectory);
    const preserved = backups.find((name) =>
      name.startsWith("state.json-preservado"),
    )!;
    expect(
      await fs.readFile(path.join(store.backupsDirectory, preserved), "utf8"),
    ).toBe("broken-current");
  });

  it("restaura anexos que estavam ausentes preservando o índice anterior e os arquivos disponíveis", async () => {
    const { file } = await fixtureBackup();
    const before = await store.load();
    await fs.unlink(await store.resolveMaterial(before.materials[0].id));
    const restored = await store.restoreBackup(file);
    expect(restored.materials).toHaveLength(2);
    expect(await store.previewMaterial(restored.materials[0].id)).toMatchObject(
      { kind: "pdf" },
    );
    expect(store.takeRecoveryNotice()).toContain("já estavam ausentes");
    const safetyFiles = await fs.readdir(store.backupsDirectory);
    const originalIndex = safetyFiles.find((name) =>
      name.endsWith("-indice-original.json"),
    )!;
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(store.backupsDirectory, originalIndex),
          "utf8",
        ),
      ).materials,
    ).toHaveLength(2);
    const available = safetyFiles.find((name) =>
      name.endsWith("-anexos-disponiveis.zip"),
    )!;
    expect(
      readBackup(
        await fs.readFile(path.join(store.backupsDirectory, available)),
      ).state.materials,
    ).toHaveLength(1);
  });

  it("rejeita arquivos incompletos, modificados e alheios ao aplicativo sem alterar o estado", async () => {
    const { zip } = await fixtureBackup();
    const before = await store.load();
    zip.updateFile("state.json", Buffer.from("{}"));
    const corrupt = await source("corrompido.zip", zip.toBuffer());
    await expect(store.restoreBackup(corrupt)).rejects.toThrow();
    expect(await store.load()).toEqual(before);
    expect(() => readBackup(Buffer.from("não é zip"))).toThrow(/ZIP/);
    const incomplete = new AdmZip();
    incomplete.addFile("state.json", Buffer.from("{}"));
    expect(() => readBackup(incomplete.toBuffer())).toThrow(/completo/);
    await expect(
      store.exportBackup(path.join(root, "state.json")),
    ).rejects.toThrow(/\.zip/);
  });

  it("rejeita anexos ausentes, tamanhos adulterados e IDs referenciando fora da biblioteca", async () => {
    const { zip } = await fixtureBackup();
    const filename = zip
      .getEntries()
      .find((entry) => entry.entryName.startsWith("materials/"))!.entryName;
    const removed = new AdmZip(zip.toBuffer());
    removed.deleteFile(filename);
    expect(() => readBackup(removed.toBuffer())).toThrow(/sem um dos arquivos/);
    const tampered = new AdmZip(zip.toBuffer());
    const state = JSON.parse(tampered.readAsText("state.json"));
    state.materials[0].size += 1;
    mutatePayload(tampered, "state.json", Buffer.from(JSON.stringify(state)));
    expect(() => readBackup(tampered.toBuffer())).toThrow(/tamanho/);
    state.materials[0].storedName = "../senha.txt";
    mutatePayload(tampered, "state.json", Buffer.from(JSON.stringify(state)));
    expect(() => readBackup(tampered.toBuffer())).toThrow();
  });

  it("rejeita entradas extras e backups cujo estado usa uma versão desconhecida", async () => {
    const { zip } = await fixtureBackup();
    const extra = new AdmZip(zip.toBuffer());
    extra.addFile("programa.exe", Buffer.from("MZ"));
    expect(() => readBackup(extra.toBuffer())).toThrow(/caminho/);
    const modified = new AdmZip(zip.toBuffer());
    const state = JSON.parse(modified.readAsText("state.json"));
    state.version = 999;
    mutatePayload(modified, "state.json", Buffer.from(JSON.stringify(state)));
    expect(() => readBackup(modified.toBuffer())).toThrow();
  });

  it("rejeita uma bomba de descompressão com tamanho anunciado falsificado", async () => {
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.alloc(1024 * 1024, 65));
    zip.addFile("state.json", Buffer.from("{}"));
    const bytes = zip.toBuffer();
    for (let offset = 0; offset <= bytes.length - 46; offset++) {
      if (bytes.readUInt32LE(offset) === 0x02014b50) {
        const nameLength = bytes.readUInt16LE(offset + 28);
        if (
          bytes.subarray(offset + 46, offset + 46 + nameLength).toString() ===
          "manifest.json"
        )
          bytes.writeUInt32LE(1, offset + 24);
      }
    }
    expect(() => readBackup(bytes)).toThrow();
  });
});
