import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../domain";
import type { AppState } from "../shared/types";
import { readBackup, StudyStore } from "./storage";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF");
const text = Buffer.from("Notas de estudo preservadas.");
let root: string;
let store: StudyStore;
let before: AppState;
let stateBytes: Buffer;
let originalPdf: string;
let originalText: string;
let backup: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ninho-restore-damaged-"));
  store = new StudyStore(path.join(root, "profile"), () =>
    createInitialState(new Date("2026-09-14T12:00:00.000Z")),
  );
  const sourcePdf = path.join(root, "lesson.pdf");
  const sourceText = path.join(root, "notes.txt");
  await fs.writeFile(sourcePdf, pdf);
  await fs.writeFile(sourceText, text);
  before = await store.importFiles([sourcePdf, sourceText], {});
  originalPdf = path.join(
    store.materialsDirectory,
    before.materials[0].storedName,
  );
  originalText = path.join(
    store.materialsDirectory,
    before.materials[1].storedName,
  );
  backup = path.join(root, "valid-backup.zip");
  await store.exportBackup(backup);
  stateBytes = await fs.readFile(path.join(store.directory, "state.json"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (
    !root ||
    !path.basename(root).startsWith("ninho-restore-damaged-") ||
    path.dirname(path.resolve(root)).toLowerCase() !==
      path.resolve(os.tmpdir()).toLowerCase()
  )
    throw new Error("Pasta de teste fora do diretório temporário.");
  await fs.rm(root, { recursive: true, force: true });
});

async function expectUnchanged() {
  expect(await store.load()).toEqual(before);
  expect(await fs.readFile(path.join(store.directory, "state.json"))).toEqual(
    stateBytes,
  );
  expect(await fs.readFile(originalText)).toEqual(text);
  expect(store.takeRecoveryNotice()).toBeNull();
  expect(
    (await fs.readdir(store.directory)).filter((name) =>
      name.startsWith(".restore-"),
    ),
  ).toEqual([]);
}

async function inspectSafety() {
  const names = await fs.readdir(store.backupsDirectory);
  const index = names.find((name) => name.endsWith("-indice-original.json"))!;
  const zip = names.find((name) => name.endsWith("-anexos-disponiveis.zip"))!;
  expect(index).toBeTruthy();
  expect(zip).toBeTruthy();
  expect(
    JSON.parse(
      await fs.readFile(path.join(store.backupsDirectory, index), "utf8"),
    ),
  ).toEqual(before);
  return readBackup(await fs.readFile(path.join(store.backupsDirectory, zip)));
}

describe("restauração com anexos antigos ausentes ou danificados", () => {
  it.each([
    ["truncado", Buffer.from("damaged")],
    ["do mesmo tamanho com assinatura inválida", Buffer.alloc(pdf.length, 65)],
  ])(
    "recupera PDF %s sem sobrescrever os bytes antigos",
    async (_name, damaged) => {
      await fs.writeFile(originalPdf, damaged);
      const restored = await store.restoreBackup(backup);
      expect(restored.materials.map((material) => material.id)).toEqual(
        before.materials.map((material) => material.id),
      );
      expect(restored.materials[0].storedName).not.toBe(
        before.materials[0].storedName,
      );
      expect(
        await store.previewMaterial(restored.materials[0].id),
      ).toMatchObject({
        kind: "pdf",
        data: pdf.toString("base64"),
      });
      expect(await fs.readFile(originalPdf)).toEqual(damaged);
      expect(await fs.readFile(originalText)).toEqual(text);
      const safety = await inspectSafety();
      expect(safety.state.materials).toEqual([before.materials[1]]);
      expect(safety.materials.get(before.materials[1].storedName)).toEqual(
        text,
      );
      expect(store.takeRecoveryNotice()).toMatch(
        /1 anexo.*tamanho ou formato inválido.*mantidos sem alteração.*restaurado/,
      );
      expect(store.takeRecoveryNotice()).toBeNull();
      expect(await new StudyStore(store.directory).load()).toEqual(restored);
    },
  );

  it("recupera coleção com anexo ausente e preserva somente os disponíveis no ZIP de segurança", async () => {
    await fs.unlink(originalPdf);
    await store.restoreBackup(backup);
    expect((await inspectSafety()).state.materials).toEqual([
      before.materials[1],
    ]);
    expect(await store.previewMaterial(before.materials[0].id)).toMatchObject({
      kind: "pdf",
    });
    expect(store.takeRecoveryNotice()).toContain("já estavam ausentes");
  });

  it("permite recuperar quando todos os anexos anteriores estão danificados ou ausentes", async () => {
    const damaged = Buffer.alloc(pdf.length, 65);
    await fs.writeFile(originalPdf, damaged);
    await fs.unlink(originalText);
    await store.restoreBackup(backup);
    expect((await inspectSafety()).state.materials).toEqual([]);
    expect(await fs.readFile(originalPdf)).toEqual(damaged);
    const notice = store.takeRecoveryNotice();
    expect(notice).toContain("já estavam ausentes");
    expect(notice).toContain("tamanho ou formato inválido");
  });

  it("rejeita ZIP de entrada inválido antes de preservar ou alterar a coleção danificada", async () => {
    const damaged = Buffer.from("broken");
    await fs.writeFile(originalPdf, damaged);
    const invalid = path.join(root, "invalid.zip");
    await fs.writeFile(invalid, "not a zip");
    const backupsBefore = await fs.readdir(store.backupsDirectory);
    const lstat = vi.spyOn(fs, "lstat");
    await expect(store.restoreBackup(invalid)).rejects.toThrow();
    expect(
      lstat.mock.calls.some(([file]) => String(file) === originalPdf),
    ).toBe(false);
    expect(await fs.readdir(store.backupsDirectory)).toEqual(backupsBefore);
    expect(await fs.readFile(originalPdf)).toEqual(damaged);
    await expectUnchanged();
  });

  it.each(["EACCES", "EIO"])(
    "não trata falha de leitura %s como arquivo danificado recuperável",
    async (code) => {
      const originalOpen = fs.open.bind(fs);
      const error = Object.assign(new Error(`synthetic ${code}`), { code });
      vi.spyOn(fs, "open").mockImplementation(async (file, flags, mode) => {
        if (String(file) === originalText) throw error;
        return originalOpen(file, flags, mode);
      });
      await expect(store.restoreBackup(backup)).rejects.toBe(error);
      await expectUnchanged();
      expect(await fs.readdir(store.backupsDirectory)).toEqual([]);
    },
  );

  it("interrompe se falta espaço para preservar o índice original", async () => {
    const damaged = Buffer.from("broken");
    await fs.writeFile(originalPdf, damaged);
    const originalOpen = fs.open.bind(fs);
    const error = Object.assign(new Error("synthetic no space"), {
      code: "ENOSPC",
    });
    vi.spyOn(fs, "open").mockImplementation(async (file, flags, mode) => {
      if (String(file).includes("-indice-original.json.")) throw error;
      return originalOpen(file, flags, mode);
    });
    await expect(store.restoreBackup(backup)).rejects.toBe(error);
    expect(await fs.readFile(originalPdf)).toEqual(damaged);
    await expectUnchanged();
  });

  it("interrompe se o ZIP de segurança falhar após a auditoria, sem anunciar sucesso", async () => {
    const damaged = Buffer.from("broken");
    await fs.writeFile(originalPdf, damaged);
    const originalRename = fs.rename.bind(fs);
    const error = Object.assign(new Error("synthetic safety backup failure"), {
      code: "ENOSPC",
    });
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to).endsWith("-anexos-disponiveis.zip")) throw error;
      return originalRename(from, to);
    });
    await expect(store.restoreBackup(backup)).rejects.toBe(error);
    expect(await fs.readFile(originalPdf)).toEqual(damaged);
    await expectUnchanged();
    expect((await fs.readdir(store.materialsDirectory)).sort()).toEqual(
      before.materials.map((material) => material.storedName).sort(),
    );
  });

  it("audita apenas 8 KiB do arquivo grande e preserva o restante no backup em streaming", async () => {
    const largePdf = Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024, 32)]);
    const largeSource = path.join(root, "large.pdf");
    await fs.writeFile(largeSource, largePdf);
    before = await store.importFiles([largeSource], {});
    const large = before.materials.at(-1)!;
    const largePath = path.join(store.materialsDirectory, large.storedName);
    await fs.writeFile(originalPdf, "broken");
    const originalOpen = fs.open.bind(fs);
    let auditedBytes = 0;
    let observedAudit = false;
    vi.spyOn(fs, "open").mockImplementation(async (file, flags, mode) => {
      const handle = await originalOpen(file, flags, mode);
      if (String(file) === largePath && !observedAudit) {
        observedAudit = true;
        const read = handle.read.bind(handle);
        vi.spyOn(handle, "read").mockImplementation((async (
          ...args: Parameters<typeof handle.read>
        ) => {
          const result = await read(...args);
          auditedBytes += result.bytesRead;
          return result;
        }) as typeof handle.read);
      }
      return handle;
    });
    await store.restoreBackup(backup);
    expect(auditedBytes).toBe(8192);
    const preserved = (await inspectSafety()).materials.get(large.storedName);
    expect(preserved?.length).toBe(largePdf.length);
    // Native byte equality avoids enumerating millions of Buffer properties
    // while still checking the complete attachment, not only its signature.
    expect(preserved?.equals(largePdf)).toBe(true);
    // This case performs real ZIP I/O and CRC verification under coverage;
    // allow scheduling contention from the concurrent Windows build/E2E runs.
  }, 15_000);
});
