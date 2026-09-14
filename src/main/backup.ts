import { constants, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import * as yazl from "yazl";
import * as yauzl from "yauzl";
import { validateState } from "../domain";
import type { AppState } from "../shared/types";
import {
  assertFileContent,
  isMedia,
  managedPath,
  materialExtension,
  materialLimit,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ENTRIES,
  MAX_STATE_BYTES,
  validateBackupEntryName,
  validateStoredName,
} from "./security";

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
type ManifestFile = { path: string; size: number; sha256: string };
type Manifest = {
  format: "NinhoBackup";
  version: 1;
  createdAt: string;
  files: ManifestFile[];
};
const sha256 = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

// Only JSON metadata and an 8 KiB signature are retained; attachment bytes flow
// through Node's bounded streams. CRC catches damaged ZIPs, SHA binds the manifest.
class Inspector {
  private hash = createHash("sha256");
  private crc = 0xffffffff;
  private size = 0;
  private header = Buffer.alloc(0);
  constructor(
    private expected: { size: number; sha256?: string; crc32?: number },
    private maximum: number,
    private name?: string,
  ) {}
  update(chunk: Buffer): void {
    this.size += chunk.length;
    if (this.size > this.maximum || this.size > this.expected.size)
      throw new Error("Um arquivo do backup excede o limite permitido.");
    this.hash.update(chunk);
    if (this.expected.crc32 !== undefined) {
      for (const byte of chunk)
        this.crc = (this.crc >>> 8) ^ crcTable[(this.crc ^ byte) & 0xff];
    }
    if (this.name && this.header.length < 8192)
      this.header = Buffer.concat([
        this.header,
        chunk.subarray(0, 8192 - this.header.length),
      ]);
  }
  finish(): string {
    const hash = this.hash.digest("hex");
    if (
      this.size !== this.expected.size ||
      (this.expected.sha256 !== undefined && hash !== this.expected.sha256) ||
      (this.expected.crc32 !== undefined &&
        (this.crc ^ 0xffffffff) >>> 0 !== this.expected.crc32)
    ) {
      throw new Error("A integridade do backup não pôde ser confirmada.");
    }
    if (this.name) assertFileContent(materialExtension(this.name), this.header);
    return hash;
  }
}

async function regularFile(file: string, maximum: number, size?: number) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(
      "Escolha um arquivo comum, sem atalhos ou links simbólicos.",
    );
  if (stat.size > maximum || (size !== undefined && stat.size !== size))
    throw new Error(
      "O tamanho do arquivo não corresponde à coleção ou excede o limite permitido.",
    );
  return stat;
}

/** Atomic ZIP/ZIP64 export. Even large videos are never read into a Buffer. */
export async function writeBackupFile(
  input: AppState,
  materialsDirectory: string,
  destination: string,
): Promise<void> {
  const state = validateState(input);
  const stateData = Buffer.from(JSON.stringify(state, null, 2));
  if (stateData.length > MAX_STATE_BYTES)
    throw new Error("A coleção excede o limite de dados.");
  if (state.materials.length + 2 > MAX_BACKUP_ENTRIES)
    throw new Error("O backup suporta até 5.000 anexos.");
  const files: ManifestFile[] = [
    { path: "state.json", size: stateData.length, sha256: sha256(stateData) },
  ];
  const seen = new Set<string>();
  let total = stateData.length;
  for (const material of state.materials) {
    const name = validateStoredName(material.storedName);
    if (seen.has(name.toLowerCase()))
      throw new Error("Há anexos internos duplicados na coleção.");
    seen.add(name.toLowerCase());
    total += material.size;
    if (total > MAX_BACKUP_BYTES)
      throw new Error("O backup descompactado excede 20 GB.");
    await regularFile(
      managedPath(materialsDirectory, name),
      materialLimit(materialExtension(name)),
      material.size,
    );
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const zip = new yazl.ZipFile();
  const output = zip.outputStream as Readable;
  const active = new Set<Readable>();
  const drains: Promise<unknown>[] = [];
  let aborted = false;
  zip.on("error", (error: Error) => output.destroy(error));
  const sink = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
  let compressed = 0;
  const bounded = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      compressed += chunk.length;
      callback(
        compressed > MAX_BACKUP_BYTES
          ? new Error("O backup ZIP excede 20 GB.")
          : null,
        chunk,
      );
    },
  });
  // Attach the rejection handler immediately; lazy sources may fail before end().
  const completion = pipeline(output, bounded, sink).catch((error: unknown) => {
    aborted = true;
    for (const stream of active) stream.destroy(error as Error);
    return { error };
  });
  try {
    zip.addBuffer(stateData, "state.json");
    for (const material of state.materials) {
      const name = material.storedName;
      const entryPath = `materials/${name}`;
      const extension = materialExtension(name);
      zip.addReadStreamLazy(
        entryPath,
        {
          size: material.size,
          compress: !isMedia(extension),
          compressionLevel: isMedia(extension) ? 0 : 3,
          mode: 0o100600,
        },
        (callback) => {
          const stream = Readable.from(
            (async function* () {
              if (aborted) throw new Error("Backup interrompido.");
              const file = managedPath(materialsDirectory, name);
              const stat = await regularFile(
                file,
                materialLimit(extension),
                material.size,
              );
              const handle = await fs.open(file, constants.O_RDONLY);
              let source: Readable | undefined;
              try {
                const opened = await handle.stat();
                if (
                  !opened.isFile() ||
                  opened.size !== stat.size ||
                  opened.ino !== stat.ino
                )
                  throw new Error("O arquivo foi alterado durante a leitura.");
                if (aborted) throw new Error("Backup interrompido.");
                const inspector = new Inspector(
                  { size: material.size },
                  materialLimit(extension),
                  name,
                );
                source = handle.createReadStream({ autoClose: false });
                for await (const chunk of source) {
                  inspector.update(chunk);
                  yield chunk;
                }
                files.push({
                  path: entryPath,
                  size: material.size,
                  sha256: inspector.finish(),
                });
              } finally {
                source?.destroy();
                await handle.close();
              }
            })(),
          );
          active.add(stream);
          stream.on("error", (error) => output.destroy(error));
          drains.push(
            finished(stream)
              .catch(() => undefined)
              .finally(() => active.delete(stream)),
          );
          callback(null, stream);
        },
      );
    }
    zip.addReadStreamLazy("manifest.json", (callback) => {
      try {
        const manifest: Manifest = {
          format: "NinhoBackup",
          version: 1,
          createdAt: new Date().toISOString(),
          files,
        };
        const data = Buffer.from(JSON.stringify(manifest, null, 2));
        if (
          data.length > MAX_MANIFEST_BYTES ||
          total + data.length > MAX_BACKUP_BYTES
        )
          throw new Error("O índice ou o backup excede o limite permitido.");
        callback(null, Readable.from([data]));
      } catch (error) {
        callback(error, Readable.from([]));
      }
    });
    zip.end();
    const result = await completion;
    if (result && "error" in result) throw result.error;
    await Promise.all(drains);
    const handle = await fs.open(temporary, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, destination);
  } finally {
    aborted = true;
    output.destroy();
    for (const stream of active) stream.destroy();
    await completion;
    await Promise.all(drains);
    await fs.rm(temporary, { force: true });
  }
}

function entryLimit(name: string): number {
  return name === "manifest.json"
    ? MAX_MANIFEST_BYTES
    : name === "state.json"
      ? MAX_STATE_BYTES
      : name === "materials/"
        ? 0
        : materialLimit(materialExtension(name));
}

async function readMetadata(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  expected?: ManifestFile,
): Promise<Buffer> {
  const inspector = new Inspector(
    {
      size: entry.uncompressedSize,
      crc32: entry.crc32,
      sha256: expected?.sha256,
    },
    entryLimit(entry.fileName),
  );
  const chunks: Buffer[] = [];
  const stream = await zip.openReadStreamPromise(entry);
  for await (const chunk of stream) {
    inspector.update(chunk);
    chunks.push(chunk);
  }
  inspector.finish();
  return Buffer.concat(chunks);
}

function parseManifest(data: Buffer): Manifest {
  const manifest = JSON.parse(data.toString("utf8")) as Manifest;
  if (
    !manifest ||
    manifest.format !== "NinhoBackup" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_BACKUP_ENTRIES - 1
  )
    throw new Error("Versão ou estrutura de backup não suportada.");
  const seen = new Set<string>();
  for (const item of manifest.files) {
    if (
      !item ||
      typeof item.path !== "string" ||
      ["manifest.json", "materials/"].includes(item.path) ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0 ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error("Índice do backup inválido.");
    validateBackupEntryName(item.path);
    if (seen.has(item.path.toLowerCase()))
      throw new Error("Arquivo duplicado no índice do backup.");
    seen.add(item.path.toLowerCase());
  }
  return manifest;
}

/** Fully validates the archive before returning paths in a private staging folder.
 * The caller owns that folder and removes it on success or failure. */
export async function readBackupFile(
  source: string,
  stagingDirectory: string,
): Promise<{ state: AppState; materials: Map<string, string> }> {
  await regularFile(source, MAX_BACKUP_BYTES);
  const staging = await fs.lstat(stagingDirectory);
  if (
    !staging.isDirectory() ||
    staging.isSymbolicLink() ||
    (await fs.readdir(stagingDirectory)).length
  )
    throw new Error("A pasta temporária do backup precisa estar vazia.");
  const zip = await yauzl.openPromise(source, {
    autoClose: false,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const closed = new Promise<void>((resolve) => zip.once("close", resolve));
  try {
    if (zip.entryCount > MAX_BACKUP_ENTRIES || zip.fileSize > MAX_BACKUP_BYTES)
      throw new Error("O backup contém arquivos demais ou excede 20 GB.");
    const entries = new Map<string, yauzl.Entry>();
    const folded = new Set<string>();
    let total = 0;
    for await (const entry of zip.eachEntry()) {
      validateBackupEntryName(entry.fileName);
      if (
        entries.size >= MAX_BACKUP_ENTRIES ||
        folded.has(entry.fileName.toLowerCase())
      )
        throw new Error("O backup contém entradas demais ou nomes duplicados.");
      if (entry.isEncrypted())
        throw new Error("Backups criptografados não são aceitos.");
      if (![0, 8].includes(entry.compressionMethod))
        throw new Error("O backup usa uma compressão não suportada.");
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (
        unixType &&
        unixType !== 0x8000 &&
        !(unixType === 0x4000 && entry.fileName === "materials/")
      )
        throw new Error(
          "Links e arquivos especiais não são aceitos no backup.",
        );
      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0 ||
        entry.uncompressedSize > entryLimit(entry.fileName)
      )
        throw new Error("Um arquivo do backup excede o limite permitido.");
      total += entry.uncompressedSize;
      if (total > MAX_BACKUP_BYTES || !Number.isSafeInteger(total))
        throw new Error("O backup descompactado excede 20 GB.");
      entries.set(entry.fileName, entry);
      folded.add(entry.fileName.toLowerCase());
    }
    const manifestEntry = entries.get("manifest.json");
    const stateEntry = entries.get("state.json");
    if (!manifestEntry || !stateEntry)
      throw new Error("Este arquivo não é um backup completo do Ninho.");
    const manifest = parseManifest(await readMetadata(zip, manifestEntry));
    const expected = new Map(manifest.files.map((file) => [file.path, file]));
    if (
      !expected.has("state.json") ||
      entries.size !== expected.size + 1 + (entries.has("materials/") ? 1 : 0)
    )
      throw new Error("O índice do backup não corresponde aos arquivos.");
    for (const item of manifest.files) {
      const entry = entries.get(item.path);
      if (!entry || item.size !== entry.uncompressedSize)
        throw new Error(
          "O backup está sem um arquivo ou seu tamanho foi alterado.",
        );
    }
    const state = validateState(
      JSON.parse(
        (
          await readMetadata(zip, stateEntry, expected.get("state.json"))
        ).toString("utf8"),
      ),
    );
    const names = new Set<string>();
    for (const material of state.materials) {
      const name = validateStoredName(material.storedName);
      if (names.has(name.toLowerCase()))
        throw new Error("O backup contém anexos repetidos.");
      names.add(name.toLowerCase());
      const item = expected.get(`materials/${name}`);
      if (!item || material.size !== item.size)
        throw new Error(
          "O backup está sem um anexo ou seu tamanho foi alterado.",
        );
    }
    if (expected.size !== state.materials.length + 1)
      throw new Error("O backup contém anexos que não pertencem à coleção.");
    const materials = new Map<string, string>();
    for (const material of state.materials) {
      const name = material.storedName;
      const item = expected.get(`materials/${name}`)!;
      const entry = entries.get(item.path)!;
      const inspector = new Inspector(
        { ...item, crc32: entry.crc32 },
        materialLimit(materialExtension(name)),
        name,
      );
      const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          try {
            inspector.update(chunk);
            callback(null, chunk);
          } catch (error) {
            callback(error as Error);
          }
        },
        flush(callback) {
          try {
            inspector.finish();
            callback();
          } catch (error) {
            callback(error as Error);
          }
        },
      });
      const destination = managedPath(stagingDirectory, name);
      await pipeline(
        await zip.openReadStreamPromise(entry),
        verify,
        createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      );
      materials.set(name, destination);
    }
    return { state, materials };
  } finally {
    zip.close();
    await closed;
  }
}
