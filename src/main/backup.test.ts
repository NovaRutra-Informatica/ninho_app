import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import AdmZip from "adm-zip";
import * as yazl from "yazl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, createInitialState } from "../domain";
import type { AppState, Material } from "../shared/types";
import { readBackupFile, writeBackupFile } from "./backup";
import { StudyStore } from "./storage";
import {
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ENTRIES,
  MAX_MATERIAL_BYTES,
  MAX_MEDIA_BYTES,
} from "./security";

const now = new Date("2026-09-14T12:00:00Z");
const pdf = Buffer.from("%PDF-1.7\nAula de teste\n%%EOF");
const mp4 = Buffer.from([
  0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
]);
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let root: string, materialDirectory: string, staging: string, file: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ninho-backup-test-"));
  materialDirectory = path.join(root, "materials");
  staging = path.join(root, "staging");
  file = path.join(root, "backup.zip");
  await fs.mkdir(materialDirectory);
  await fs.mkdir(staging);
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (
    path.dirname(path.resolve(root)).toLowerCase() !==
      path.resolve(os.tmpdir()).toLowerCase() ||
    !path.basename(root).startsWith("ninho-backup-test-")
  )
    throw new Error("Diretório de teste inválido.");
  await fs.rm(root, { recursive: true, force: true });
});

async function fixture(extension = "pdf", contents = pdf) {
  const state = createInitialState(now);
  const id = randomUUID(),
    storedName = `${id}.${extension}`;
  const material: Material = {
    id,
    storedName,
    name: `Minha aula.${extension}`,
    type: extension,
    size: contents.length,
    subjectId: "banco-de-dados",
    lessonId: "240830:aula:00",
    createdAt: now.toISOString(),
    notes: "Minhas notas",
  };
  state.materials.push(material);
  await fs.writeFile(path.join(materialDirectory, storedName), contents);
  return state;
}

function archive(state: unknown, payloads: Record<string, Buffer> = {}) {
  const zip = new AdmZip();
  const files = Object.entries({
    "state.json": Buffer.from(JSON.stringify(state)),
    ...payloads,
  });
  for (const [name, data] of files) zip.addFile(name, data);
  zip.addFile(
    "manifest.json",
    Buffer.from(
      JSON.stringify({
        format: "NinhoBackup",
        version: 1,
        createdAt: now.toISOString(),
        files: files.map(([name, data]) => ({
          path: name,
          size: data.length,
          sha256: sha(data),
        })),
      }),
    ),
  );
  return zip;
}
async function readArchive(zip: AdmZip) {
  await fs.writeFile(file, zip.toBuffer());
  return readBackupFile(file, staging);
}
function mutateIndex(zip: AdmZip, callback: (manifest: any) => void) {
  const manifest = JSON.parse(zip.readAsText("manifest.json"));
  callback(manifest);
  zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
}
function changeCentral(
  bytes: Buffer,
  entryName: string,
  change: (offset: number) => void,
) {
  for (let offset = 0; offset <= bytes.length - 46; offset++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = bytes.readUInt16LE(offset + 28);
    if (
      bytes.subarray(offset + 46, offset + 46 + length).toString() === entryName
    ) {
      change(offset);
      return;
    }
  }
  throw new Error("Entrada não encontrada");
}
async function hashFile(name: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(name)) hash.update(chunk);
  return hash.digest("hex");
}

describe("streaming ZIP backups", () => {
  it("round trips state, original bytes and notes without reading source or archive into memory", async () => {
    const state = await fixture();
    const noBufferRead = vi
      .spyOn(fs, "readFile")
      .mockRejectedValue(new Error("No whole-file read"));
    await writeBackupFile(state, materialDirectory, file);
    const restored = await readBackupFile(file, staging);
    expect(restored.state).toEqual(state);
    expect(restored.materials.size).toBe(1);
    expect(noBufferRead).not.toHaveBeenCalled();
    noBufferRead.mockRestore();
    expect(
      await fs.readFile(restored.materials.get(state.materials[0].storedName)!),
    ).toEqual(pdf);
  });

  it("restores version 1 ZIP and migrates hierarchy while retaining review history and attachments", async () => {
    let state = await fixture();
    state = applyCommand(
      state,
      {
        type: "lesson.update",
        id: "240830:aula:00",
        patch: { notes: "Notas anteriores", status: "done" },
      },
      now,
    );
    state = applyCommand(
      state,
      { type: "card.review", id: state.cards[0].id, rating: "again" },
      now,
    );
    const { programs: _, ...rest } = state;
    const legacy = {
      ...rest,
      version: 1,
      subjects: state.subjects.map(({ programId: _, ...subject }) => subject),
    };
    const restored = await readArchive(
      archive(legacy, { [`materials/${state.materials[0].storedName}`]: pdf }),
    );
    expect(restored.state).toEqual(state);
    expect(
      await fs.readFile(restored.materials.get(state.materials[0].storedName)!),
    ).toEqual(pdf);
  });

  it("accepts ZIP64 archives and an optional materials directory from older exporters", async () => {
    const state = await fixture();
    const old = archive(state, {
      [`materials/${state.materials[0].storedName}`]: pdf,
    });
    const zip = new yazl.ZipFile();
    const completion = pipeline(zip.outputStream, createWriteStream(file));
    zip.addEmptyDirectory("materials/");
    for (const entry of old.getEntries())
      zip.addBuffer(entry.getData(), entry.entryName, {
        forceZip64Format: true,
      });
    zip.end({ forceZip64Format: true, comment: "Compatibility" });
    await completion;
    expect((await readBackupFile(file, staging)).state).toEqual(state);
  });

  it("streams a video larger than the document limit with exact size and checksum", async () => {
    const state = await fixture("mp4", mp4);
    const source = path.join(materialDirectory, state.materials[0].storedName);
    const size = MAX_MATERIAL_BYTES + 1024;
    await fs.truncate(source, size);
    state.materials[0].size = size;
    const noBufferRead = vi
      .spyOn(fs, "readFile")
      .mockRejectedValue(new Error("No whole-file read"));
    await writeBackupFile(state, materialDirectory, file);
    expect((await fs.stat(file)).size).toBeGreaterThan(MAX_MATERIAL_BYTES);
    const restored = await readBackupFile(file, staging);
    const target = restored.materials.get(state.materials[0].storedName)!;
    expect((await fs.stat(target)).size).toBe(size);
    expect(await hashFile(target)).toBe(await hashFile(source));
    expect(noBufferRead).not.toHaveBeenCalled();
  }, 30_000);

  it("rejects changed source sizes and keeps any previous backup intact", async () => {
    const state = await fixture();
    await fs.writeFile(file, "previous-backup");
    await fs.appendFile(
      path.join(materialDirectory, state.materials[0].storedName),
      "changed",
    );
    await expect(
      writeBackupFile(state, materialDirectory, file),
    ).rejects.toThrow(/tamanho/);
    expect(await fs.readFile(file, "utf8")).toBe("previous-backup");
    expect(
      (await fs.readdir(root)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("handles a late streaming validation error without replacing an existing backup or leaking a temporary file", async () => {
    const state = await fixture("pdf", Buffer.from("MZ not a PDF"));
    await fs.writeFile(file, "previous-backup");
    await expect(
      writeBackupFile(state, materialDirectory, file),
    ).rejects.toThrow(/executáveis/);
    expect(await fs.readFile(file, "utf8")).toBe("previous-backup");
    expect(
      (await fs.readdir(root)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("exports empty collections without synthetic attachments", async () => {
    const state = createInitialState(now);
    await writeBackupFile(state, materialDirectory, file);
    const restored = await readBackupFile(file, staging);
    expect(restored.state).toEqual(state);
    expect(restored.materials.size).toBe(0);
  });
});

describe("bounded and validated restoration", () => {
  it.each(["missing", "hash", "size", "extra", "duplicate", "version"])(
    "rejects a %s manifest anomaly before writing attachments",
    async (kind) => {
      const state = await fixture();
      const name = `materials/${state.materials[0].storedName}`;
      const zip = archive(state, { [name]: pdf });
      if (kind === "missing") zip.deleteFile(name);
      if (kind === "hash")
        mutateIndex(zip, (manifest) => {
          manifest.files[0].sha256 = "0".repeat(64);
        });
      if (kind === "size")
        mutateIndex(zip, (manifest) => {
          manifest.files[0].size++;
        });
      if (kind === "extra")
        zip.addFile(`materials/${randomUUID()}.txt`, Buffer.from("Extra"));
      if (kind === "duplicate")
        mutateIndex(zip, (manifest) => {
          manifest.files.push(manifest.files[0]);
        });
      if (kind === "version")
        mutateIndex(zip, (manifest) => {
          manifest.version = 99;
        });
      await expect(readArchive(zip)).rejects.toThrow();
      expect(await fs.readdir(staging)).toEqual([]);
    },
  );

  it.each(["encrypted", "symlink", "traversal", "CRC", "bomb", "oversize"])(
    "rejects %s ZIP headers",
    async (kind) => {
      const state = createInitialState(now);
      const zip = archive(state);
      if (kind === "bomb")
        zip.updateFile("manifest.json", Buffer.alloc(1024 * 1024, 65));
      const bytes = zip.toBuffer();
      changeCentral(bytes, "manifest.json", (offset) => {
        if (kind === "encrypted")
          bytes.writeUInt16LE(bytes.readUInt16LE(offset + 8) | 1, offset + 8);
        if (kind === "symlink")
          bytes.writeUInt32LE((0xa1ff << 16) >>> 0, offset + 38);
        if (kind === "traversal")
          Buffer.from("../evil.json!").copy(bytes, offset + 46);
        if (kind === "CRC")
          bytes.writeUInt32LE(
            (bytes.readUInt32LE(offset + 16) ^ 1) >>> 0,
            offset + 16,
          );
        if (kind === "bomb") bytes.writeUInt32LE(1, offset + 24);
        if (kind === "oversize")
          bytes.writeUInt32LE(2 * 1024 * 1024 + 1, offset + 24);
      });
      await fs.writeFile(file, bytes);
      await expect(readBackupFile(file, staging)).rejects.toThrow();
      expect(await fs.readdir(staging)).toEqual([]);
    },
  );

  it("enforces 2 GiB media, 100 MiB documents and the total 20 GiB before decompression", async () => {
    expect(MAX_BACKUP_BYTES).toBe(20 * 1024 ** 3);
    expect(MAX_BACKUP_ENTRIES).toBe(5002);
    for (const [extension, maximum] of [
      ["pdf", MAX_MATERIAL_BYTES],
      ["mp4", MAX_MEDIA_BYTES],
    ] as const) {
      const name = `materials/${randomUUID()}.${extension}`;
      const zip = archive(createInitialState(now), {
        [name]: Buffer.from("tiny"),
      });
      const bytes = zip.toBuffer();
      changeCentral(bytes, name, (offset) =>
        bytes.writeUInt32LE(maximum + 1, offset + 24),
      );
      await fs.writeFile(file, bytes);
      await expect(readBackupFile(file, staging)).rejects.toThrow(/limite/);
    }
    const payloads = Object.fromEntries(
      Array.from({ length: 11 }, () => [
        `materials/${randomUUID()}.mp4`,
        Buffer.from("tiny"),
      ]),
    );
    const zip = archive(createInitialState(now), payloads);
    const bytes = zip.toBuffer();
    for (const name of Object.keys(payloads))
      changeCentral(bytes, name, (offset) =>
        bytes.writeUInt32LE(MAX_MEDIA_BYTES, offset + 24),
      );
    await fs.writeFile(file, bytes);
    await expect(readBackupFile(file, staging)).rejects.toThrow(/20 GB/);
  });

  it("rejects an excessive entry count without opening attachment streams", async () => {
    const zip = archive(createInitialState(now));
    for (let i = 0; i < MAX_BACKUP_ENTRIES; i++)
      zip.addFile(`materials/${randomUUID()}.txt`, Buffer.alloc(0));
    await fs.writeFile(file, zip.toBuffer());
    await expect(readBackupFile(file, staging)).rejects.toThrow(
      /arquivos demais/,
    );
    expect(await fs.readdir(staging)).toEqual([]);
  });

  it("requires a private empty staging folder and does not overwrite its contents", async () => {
    await fs.writeFile(path.join(staging, "keep.txt"), "Keep");
    await fs.writeFile(file, archive(createInitialState(now)).toBuffer());
    await expect(readBackupFile(file, staging)).rejects.toThrow(/vazia/);
    expect(await fs.readFile(path.join(staging, "keep.txt"), "utf8")).toBe(
      "Keep",
    );
  });

  it("cleans staged attachments after a later checksum failure while preserving active state and files", async () => {
    const state = await fixture();
    const name = `materials/${state.materials[0].storedName}`;
    const zip = archive(state, { [name]: pdf });
    mutateIndex(zip, (manifest) => {
      manifest.files.find((item: any) => item.path === name).sha256 =
        "0".repeat(64);
    });
    await fs.writeFile(file, zip.toBuffer());
    const store = new StudyStore(path.join(root, "active"), () =>
      createInitialState(now),
    );
    const original = await store.load();
    await expect(store.restoreBackup(file)).rejects.toThrow(/integridade/);
    expect(await store.load()).toEqual(original);
    expect(await fs.readdir(store.materialsDirectory)).toEqual([]);
    expect(
      (await fs.readdir(store.directory)).filter((name) =>
        name.startsWith(".restore-"),
      ),
    ).toEqual([]);
    expect(await fs.readdir(store.backupsDirectory)).toEqual([]);
  });
});
