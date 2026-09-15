import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../domain";
import { StudyStore } from "./storage";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF");
let root: string;
let store: StudyStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ninho-paths-test-"));
  store = new StudyStore(path.join(root, "profile"), () =>
    createInitialState(new Date("2026-09-14T12:00:00.000Z")),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (
    !root ||
    !path.basename(root).startsWith("ninho-paths-test-") ||
    path.dirname(path.resolve(root)).toLowerCase() !==
      path.resolve(os.tmpdir()).toLowerCase()
  )
    throw new Error("Pasta de teste fora do diretório temporário.");
  await fs.rm(root, { recursive: true, force: true });
});

async function importedPdf() {
  const source = path.join(root, "aula.pdf");
  await fs.writeFile(source, pdf);
  const state = await store.importFiles([source], {});
  const material = state.materials.at(-1)!;
  const logical = path.join(store.materialsDirectory, material.storedName);
  return { material, logical };
}

function aliasRealpath(logical: string, canonical: string) {
  const original = fs.realpath.bind(fs);
  return vi.spyOn(fs, "realpath").mockImplementation(async (file) => {
    if (String(file) === logical) return canonical;
    return original(file);
  });
}

describe("caminhos da biblioteca em perfis Windows", () => {
  it("devolve o caminho canônico e lê o mesmo PDF quando a virtualização separa os pais", async () => {
    const { material, logical } = await importedPdf();
    const canonicalDirectory = path.join(
      root,
      "virtualized-profile",
      "materials",
    );
    await fs.mkdir(canonicalDirectory, { recursive: true });
    const canonical = path.join(canonicalDirectory, material.storedName);
    // Hard links share file identity; only the MSIX realpath mapping is mocked.
    await fs.link(logical, canonical);
    aliasRealpath(logical, canonical);
    expect(path.dirname(canonical).toLowerCase()).not.toBe(
      (await fs.realpath(store.materialsDirectory)).toLowerCase(),
    );

    await expect(store.resolveMaterial(material.id)).resolves.toBe(canonical);
    await expect(store.previewMaterial(material.id)).resolves.toMatchObject({
      kind: "pdf",
      data: pdf.toString("base64"),
    });
  });

  it.skipIf(process.platform !== "win32")(
    "aceita o mesmo arquivo com caixa diferente e prefixo de caminho longo do Windows",
    async () => {
      const { material, logical } = await importedPdf();
      const canonical = path.toNamespacedPath(logical.toUpperCase());
      aliasRealpath(logical, canonical);
      await expect(store.resolveMaterial(material.id)).resolves.toBe(canonical);
      await expect(store.previewMaterial(material.id)).resolves.toMatchObject({
        kind: "pdf",
        data: pdf.toString("base64"),
      });
    },
  );

  it("recusa realpath que passou a apontar a outro arquivo, mesmo com bytes iguais", async () => {
    const { material, logical } = await importedPdf();
    const replacement = path.join(root, "different-file.pdf");
    await fs.writeFile(replacement, pdf);
    aliasRealpath(logical, replacement);
    await expect(store.resolveMaterial(material.id)).rejects.toThrow(
      /alterado durante a abertura/,
    );
    await expect(store.previewMaterial(material.id)).rejects.toThrow(
      /alterado durante a abertura/,
    );
  });

  it("compara identificadores de arquivo com precisão acima do limite de Number", async () => {
    const { material, logical } = await importedPdf();
    const replacement = path.join(root, "different-identity.pdf");
    await fs.writeFile(replacement, pdf);
    aliasRealpath(logical, replacement);
    const original = fs.lstat.bind(fs);
    const logicalStat = await fs.lstat(logical, { bigint: true });
    const replacementStat = await fs.lstat(replacement, { bigint: true });
    const first = 2n ** 54n;
    expect(Number(first)).toBe(Number(first + 1n));
    const mocked = vi.spyOn(fs, "lstat");
    mocked.mockImplementation((async (file, options) => {
      if (String(file) === logical || String(file) === replacement) {
        expect(options).toEqual({ bigint: true });
        const base = String(file) === logical ? logicalStat : replacementStat;
        return Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
          ino: String(file) === logical ? first : first + 1n,
          dev: 1n,
        });
      }
      return original(file, options as { bigint: false });
    }) as typeof fs.lstat);
    await expect(store.resolveMaterial(material.id)).rejects.toThrow(
      /alterado durante a abertura/,
    );
  });

  it("recusa um arquivo que virou link antes de resolver seu destino", async () => {
    const { material, logical } = await importedPdf();
    const original = fs.lstat.bind(fs);
    const stat = await fs.lstat(logical, { bigint: true });
    vi.spyOn(fs, "lstat").mockImplementation((async (file, options) => {
      if (String(file) === logical)
        return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
          isSymbolicLink: () => true,
        });
      return original(file, options as { bigint: false });
    }) as typeof fs.lstat);
    const realpath = vi.spyOn(fs, "realpath");
    await expect(store.resolveMaterial(material.id)).rejects.toThrow(
      /anexo não é um arquivo válido/,
    );
    expect(realpath).not.toHaveBeenCalled();
  });

  it("revalida a pasta que virou junction depois de carregar o perfil", async () => {
    const { material } = await importedPdf();
    const moved = path.join(root, "original-materials");
    await fs.rename(store.materialsDirectory, moved);
    await fs.symlink(moved, store.materialsDirectory, "junction");
    try {
      await expect(store.resolveMaterial(material.id)).rejects.toThrow(
        /pasta de materiais não pode ser um atalho/,
      );
      await expect(store.previewMaterial(material.id)).rejects.toThrow(
        /pasta de materiais não pode ser um atalho/,
      );
    } finally {
      await fs.unlink(store.materialsDirectory);
    }
    expect(await fs.readFile(path.join(moved, material.storedName))).toEqual(
      pdf,
    );
  });

  it("explica como recuperar a pasta de materiais que desapareceu depois do carregamento", async () => {
    const { material } = await importedPdf();
    await fs.rename(
      store.materialsDirectory,
      path.join(root, "moved-materials"),
    );
    await expect(store.resolveMaterial(material.id)).rejects.toThrow(
      "A pasta de materiais não foi encontrada. Restaure um backup que contenha seus anexos.",
    );
    await expect(store.previewMaterial(material.id)).rejects.toThrow(
      "A pasta de materiais não foi encontrada. Restaure um backup que contenha seus anexos.",
    );
  });

  it("mantém importação, abertura e backup quando só o ancestral do perfil é junction", async () => {
    const physical = path.join(root, "physical-profile");
    const alias = path.join(root, "profile-alias");
    await fs.mkdir(physical);
    await fs.symlink(physical, alias, "junction");
    try {
      store = new StudyStore(alias, createInitialState);
      const { material } = await importedPdf();
      const resolved = await store.resolveMaterial(material.id);
      expect(await fs.readFile(resolved)).toEqual(pdf);
      const backup = path.join(root, "junction-backup.zip");
      await store.exportBackup(backup);
      const restored = await store.restoreBackup(backup);
      expect(restored.materials).toHaveLength(1);
      expect(
        await fs.readFile(await store.resolveMaterial(material.id)),
      ).toEqual(pdf);
    } finally {
      await fs.unlink(alias);
    }
  });
});
