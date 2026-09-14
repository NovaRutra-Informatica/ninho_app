import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import AdmZip from "adm-zip";
import { applyCommand, createInitialState, validateState } from "../domain";
import type {
  AppState,
  Command,
  Material,
  MaterialPreview,
} from "../shared/types";
import {
  assertFileContent,
  managedPath,
  materialExtension,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ENTRIES,
  MAX_MATERIAL_BYTES,
  MAX_STATE_BYTES,
  validateBackupEntryName,
  validateStoredName,
} from "./security";

type MaterialContext = { subjectId?: string; lessonId?: string };
type Manifest = {
  format: "NinhoBackup";
  version: 1;
  createdAt: string;
  files: { path: string; size: number; sha256: string }[];
};
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
};
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

export class DataRecoveryError extends Error {
  constructor(public readonly dataDirectory: string) {
    super(
      "Não foi possível ler seus dados. Os arquivos foram preservados. Restaure um backup para continuar.",
    );
    this.name = "DataRecoveryError";
  }
}

async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, file);
  } finally {
    await handle?.close();
    await fs.rm(temp, { force: true });
  }
}

async function readBounded(
  file: string,
  limit: number,
  rejectLink = true,
): Promise<Buffer> {
  const stat = await fs.lstat(file);
  if ((rejectLink && stat.isSymbolicLink()) || !stat.isFile())
    throw new Error(
      "Escolha um arquivo comum, sem atalhos ou links simbólicos.",
    );
  if (stat.size > limit)
    throw new Error(
      `O arquivo excede o limite de ${Math.round(limit / 1024 / 1024)} MB.`,
    );
  const handle = await fs.open(file, constants.O_RDONLY);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > limit)
      throw new Error("O arquivo foi alterado durante a leitura.");
    const data = await handle.readFile();
    if (data.length > limit)
      throw new Error("O arquivo excede o limite permitido.");
    return data;
  } finally {
    await handle.close();
  }
}

export class StudyStore {
  readonly directory: string;
  readonly materialsDirectory: string;
  readonly backupsDirectory: string;
  private readonly stateFile: string;
  private readonly previousFile: string;
  private current: AppState | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private recoveryNotice: string | null = null;

  constructor(
    directory: string,
    private readonly makeInitialState: () => AppState = createInitialState,
  ) {
    this.directory = path.resolve(directory);
    this.materialsDirectory = path.join(this.directory, "materials");
    this.backupsDirectory = path.join(this.directory, "backups");
    this.stateFile = path.join(this.directory, "state.json");
    this.previousFile = path.join(this.directory, "state.previous.json");
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(work, work);
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async prepareDirectories(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.mkdir(this.materialsDirectory, { recursive: true });
    await fs.mkdir(this.backupsDirectory, { recursive: true });
    const materialStat = await fs.lstat(this.materialsDirectory);
    const backupStat = await fs.lstat(this.backupsDirectory);
    if (
      materialStat.isSymbolicLink() ||
      !materialStat.isDirectory() ||
      backupStat.isSymbolicLink() ||
      !backupStat.isDirectory()
    ) {
      throw new Error(
        "As pastas internas de dados não podem ser atalhos ou links simbólicos.",
      );
    }
  }

  private async parseStateFile(file: string): Promise<AppState> {
    const state = validateState(
      JSON.parse((await readBounded(file, MAX_STATE_BYTES)).toString("utf8")),
    );
    state.materials.forEach((material) =>
      validateStoredName(material.storedName),
    );
    return state;
  }

  private async loadUnlocked(): Promise<AppState> {
    if (this.current) return this.current;
    await this.prepareDirectories();
    let currentError: unknown;
    try {
      this.current = await this.parseStateFile(this.stateFile);
      return this.current;
    } catch (error) {
      currentError = error;
    }
    let previousError: unknown;
    try {
      const recovered = await this.parseStateFile(this.previousFile);
      let preserved = "";
      if (!isMissing(currentError)) {
        preserved = path.join(
          this.backupsDirectory,
          `state-corrompido-${timestamp()}-${randomUUID()}.json`,
        );
        await fs.copyFile(this.stateFile, preserved, constants.COPYFILE_EXCL);
      }
      await atomicWrite(this.stateFile, JSON.stringify(recovered, null, 2));
      this.current = recovered;
      this.recoveryNotice = `O último salvamento estava indisponível. Recuperamos automaticamente a cópia anterior.${preserved ? ` O arquivo original foi preservado em ${preserved}.` : ""}`;
      return recovered;
    } catch (error) {
      previousError = error;
    }
    if (!isMissing(currentError) || !isMissing(previousError))
      throw new DataRecoveryError(this.directory);
    const initial = validateState(this.makeInitialState());
    await atomicWrite(this.stateFile, JSON.stringify(initial, null, 2));
    this.current = initial;
    return initial;
  }

  takeRecoveryNotice(): string | null {
    const notice = this.recoveryNotice;
    this.recoveryNotice = null;
    return notice;
  }

  load(): Promise<AppState> {
    return this.serial(async () => structuredClone(await this.loadUnlocked()));
  }

  private async commit(next: AppState): Promise<AppState> {
    const validated = validateState(next);
    validated.materials.forEach((material) =>
      validateStoredName(material.storedName),
    );
    const serialized = JSON.stringify(validated, null, 2);
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES)
      throw new Error(
        "A coleção excede o limite de dados. Exporte um backup antes de reorganizá-la.",
      );
    if (this.current)
      await atomicWrite(
        this.previousFile,
        JSON.stringify(this.current, null, 2),
      );
    await atomicWrite(this.stateFile, serialized);
    this.current = validated;
    return structuredClone(validated);
  }

  dispatch(command: Command): Promise<AppState> {
    return this.serial(async () => {
      const state = await this.loadUnlocked();
      return this.commit(applyCommand(state, command));
    });
  }

  importFiles(
    files: string[],
    context: MaterialContext = {},
  ): Promise<AppState> {
    return this.serial(async () => {
      const state = await this.loadUnlocked();
      if (!Array.isArray(files) || files.length < 1 || files.length > 100)
        throw new Error("Selecione entre 1 e 100 arquivos por vez.");
      if (
        !context ||
        typeof context !== "object" ||
        Array.isArray(context) ||
        Object.keys(context).some(
          (key) => !["subjectId", "lessonId"].includes(key),
        )
      )
        throw new Error("O vínculo da biblioteca é inválido.");
      const createdFiles: string[] = [];
      const materials: Material[] = [];
      try {
        for (const original of files) {
          if (typeof original !== "string" || !path.isAbsolute(original))
            throw new Error("Caminho de arquivo inválido.");
          const extension = materialExtension(original);
          const data = await readBounded(original, MAX_MATERIAL_BYTES);
          assertFileContent(extension, data);
          const id = randomUUID();
          const storedName = `${id}.${extension}`;
          const destination = managedPath(this.materialsDirectory, storedName);
          await fs.writeFile(destination, data, { flag: "wx", mode: 0o600 });
          createdFiles.push(destination);
          materials.push({
            id,
            name: path.basename(original),
            storedName,
            type: extension,
            size: data.length,
            subjectId: context.subjectId ?? "",
            lessonId: context.lessonId ?? "",
            createdAt: new Date().toISOString(),
            notes: "",
          });
        }
        return await this.commit({
          ...state,
          materials: [...state.materials, ...materials],
        });
      } catch (error) {
        await Promise.all(
          createdFiles.map((file) => fs.rm(file, { force: true })),
        );
        throw error;
      }
    });
  }

  private async materialFileUnlocked(
    id: string,
  ): Promise<{ material: Material; file: string }> {
    if (typeof id !== "string") throw new Error("Arquivo inválido.");
    const state = await this.loadUnlocked();
    const material = state.materials.find((item) => item.id === id);
    if (!material) throw new Error("Este arquivo não está mais na biblioteca.");
    const file = managedPath(this.materialsDirectory, material.storedName);
    const stat = await fs.lstat(file).catch((error) => {
      if (isMissing(error))
        throw new Error(
          "O arquivo da biblioteca não foi encontrado. Restaure um backup que contenha seus anexos.",
        );
      throw error;
    });
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("O anexo não é um arquivo válido da biblioteca.");
    const realDirectory = await fs.realpath(this.materialsDirectory);
    const realFile = await fs.realpath(file);
    if (path.dirname(realFile).toLowerCase() !== realDirectory.toLowerCase())
      throw new Error("O arquivo está fora da biblioteca.");
    return { material, file };
  }

  resolveMaterial(id: string): Promise<string> {
    return this.serial(async () => (await this.materialFileUnlocked(id)).file);
  }

  previewMaterial(id: string): Promise<MaterialPreview> {
    return this.serial(async () => {
      const { material, file } = await this.materialFileUnlocked(id);
      const extension = materialExtension(material.storedName);
      if (
        !["pdf", "png", "jpg", "jpeg", "webp", "txt", "md"].includes(extension)
      )
        return { kind: "external", name: material.name };
      const data = await readBounded(file, MAX_MATERIAL_BYTES);
      assertFileContent(extension, data);
      if (["txt", "md"].includes(extension)) {
        const limit = 1024 * 1024;
        return {
          kind: "text",
          name: material.name,
          mime: MIME[extension],
          data:
            data.subarray(0, limit).toString("utf8") +
            (data.length > limit
              ? "\n\n[Prévia limitada a 1 MB. Abra o arquivo para ler o restante.]"
              : ""),
        };
      }
      return {
        kind: extension === "pdf" ? "pdf" : "image",
        name: material.name,
        mime: MIME[extension],
        data: data.toString("base64"),
      };
    });
  }

  private async backupBuffer(state: AppState): Promise<Buffer> {
    const zip = new AdmZip();
    const stateData = Buffer.from(
      JSON.stringify(validateState(state), null, 2),
    );
    const files: Manifest["files"] = [
      { path: "state.json", size: stateData.length, sha256: digest(stateData) },
    ];
    zip.addFile("state.json", stateData);
    let total = stateData.length;
    if (state.materials.length > MAX_BACKUP_ENTRIES - 2)
      throw new Error("O backup suporta até 5.000 anexos.");
    const storedNames = new Set<string>();
    for (const material of state.materials) {
      const name = validateStoredName(material.storedName);
      if (storedNames.has(name.toLowerCase()))
        throw new Error("Há anexos internos duplicados na coleção.");
      storedNames.add(name.toLowerCase());
      const data = await readBounded(
        managedPath(this.materialsDirectory, name),
        MAX_MATERIAL_BYTES,
      );
      assertFileContent(materialExtension(name), data);
      total += data.length;
      if (total > MAX_BACKUP_BYTES)
        throw new Error("O backup excede o limite de 1 GB.");
      const entryPath = `materials/${name}`;
      zip.addFile(entryPath, data);
      files.push({ path: entryPath, size: data.length, sha256: digest(data) });
    }
    const manifest: Manifest = {
      format: "NinhoBackup",
      version: 1,
      createdAt: new Date().toISOString(),
      files,
    };
    zip.addFile(
      "manifest.json",
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );
    return zip.toBuffer();
  }

  exportBackup(destination: string): Promise<string> {
    return this.serial(async () => {
      if (
        !path.isAbsolute(destination) ||
        path.extname(destination).toLowerCase() !== ".zip"
      )
        throw new Error("Salve o backup como um arquivo .zip.");
      const state = await this.loadUnlocked();
      await atomicWrite(destination, await this.backupBuffer(state));
      return destination;
    });
  }

  restoreBackup(source: string): Promise<AppState> {
    return this.serial(async () => {
      const zipData = await readBounded(source, MAX_BACKUP_BYTES);
      const restored = readBackup(zipData);
      await this.prepareDirectories();
      let oldState: AppState | undefined;
      try {
        oldState = await this.loadUnlocked();
      } catch (error) {
        if (!(error instanceof DataRecoveryError)) throw error;
      }
      if (oldState) {
        const safetyName = `antes-de-restaurar-${timestamp()}-${randomUUID()}`;
        try {
          await atomicWrite(
            path.join(this.backupsDirectory, `${safetyName}.zip`),
            await this.backupBuffer(oldState),
          );
        } catch (error) {
          if (!isMissing(error)) throw error;
          const available: Material[] = [];
          for (const material of oldState.materials) {
            try {
              await fs.access(
                managedPath(this.materialsDirectory, material.storedName),
              );
              available.push(material);
            } catch (missingError) {
              if (!isMissing(missingError)) throw missingError;
            }
          }
          await atomicWrite(
            path.join(
              this.backupsDirectory,
              `${safetyName}-indice-original.json`,
            ),
            JSON.stringify(oldState, null, 2),
          );
          await atomicWrite(
            path.join(
              this.backupsDirectory,
              `${safetyName}-anexos-disponiveis.zip`,
            ),
            await this.backupBuffer({ ...oldState, materials: available }),
          );
          this.recoveryNotice = `Alguns anexos da coleção anterior já estavam ausentes. Preservamos o índice original e todos os arquivos disponíveis em ${this.backupsDirectory}. O backup selecionado foi restaurado.`;
        }
      } else {
        for (const file of [this.stateFile, this.previousFile]) {
          try {
            await fs.copyFile(
              file,
              path.join(
                this.backupsDirectory,
                `${path.basename(file)}-preservado-${timestamp()}-${randomUUID()}`,
              ),
              constants.COPYFILE_EXCL,
            );
          } catch (error) {
            if (!isMissing(error)) throw error;
          }
        }
      }
      const createdFiles: string[] = [];
      try {
        for (const material of restored.state.materials) {
          const originalName = material.storedName;
          const data = restored.materials.get(originalName)!;
          const storedName = `${randomUUID()}.${materialExtension(originalName)}`;
          const destination = managedPath(this.materialsDirectory, storedName);
          await fs.writeFile(destination, data, { flag: "wx", mode: 0o600 });
          createdFiles.push(destination);
          material.storedName = storedName;
        }
        return await this.commit(restored.state);
      } catch (error) {
        await Promise.all(
          createdFiles.map((file) => fs.rm(file, { force: true })),
        );
        throw error;
      }
    });
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const value of data) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function readEntry(entry: AdmZip.IZipEntry, maximum: number): Buffer {
  const { header } = entry;
  if (header.flags & 1)
    throw new Error("Backups criptografados não são aceitos.");
  if (
    !Number.isSafeInteger(header.size) ||
    header.size < 0 ||
    header.size > maximum
  )
    throw new Error("Um arquivo do backup excede o limite permitido.");
  const compressed = entry.getCompressedData();
  let data: Buffer;
  if (header.method === 0) data = compressed;
  else if (header.method === 8)
    data = inflateRawSync(compressed, {
      maxOutputLength: Math.max(1, Math.min(maximum, header.size) + 1),
    });
  else throw new Error("O backup usa uma compressão não suportada.");
  if (
    data.length !== header.size ||
    data.length > maximum ||
    crc32(data) !== header.crc
  )
    throw new Error("O backup está incompleto ou corrompido.");
  return data;
}

export function readBackup(data: Buffer): {
  state: AppState;
  materials: Map<string, Buffer>;
} {
  if (data.length > MAX_BACKUP_BYTES)
    throw new Error("O backup excede o limite de 1 GB.");
  let zip: AdmZip;
  try {
    zip = new AdmZip(data);
  } catch {
    throw new Error("Escolha um backup ZIP válido do Ninho.");
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_BACKUP_ENTRIES)
    throw new Error("O backup contém arquivos demais.");
  const entriesByName = new Map<string, AdmZip.IZipEntry>();
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    validateBackupEntryName(entry.entryName);
    const key = entry.entryName.toLowerCase();
    if (seen.has(key))
      throw new Error("O backup contém nomes de arquivo duplicados.");
    seen.add(key);
    if (entry.isDirectory && entry.entryName !== "materials/")
      throw new Error("Pasta inválida no backup.");
    total += entry.header.size;
    if (
      total > MAX_BACKUP_BYTES ||
      !Number.isSafeInteger(total) ||
      entry.header.size < 0
    )
      throw new Error("O backup descompactado excede 1 GB.");
    entriesByName.set(entry.entryName, entry);
  }
  const manifestEntry = entriesByName.get("manifest.json");
  const stateEntry = entriesByName.get("state.json");
  if (
    !manifestEntry ||
    !stateEntry ||
    manifestEntry.isDirectory ||
    stateEntry.isDirectory
  )
    throw new Error("Este arquivo não é um backup completo do Ninho.");
  const manifest = JSON.parse(
    readEntry(manifestEntry, 2 * 1024 * 1024).toString("utf8"),
  ) as Manifest;
  if (
    !manifest ||
    manifest.format !== "NinhoBackup" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_BACKUP_ENTRIES - 1
  )
    throw new Error("Versão ou estrutura de backup não suportada.");
  const payloads = new Map<string, Buffer>();
  for (const expected of manifest.files) {
    if (
      !expected ||
      typeof expected.path !== "string" ||
      expected.path === "manifest.json" ||
      expected.path === "materials/" ||
      !Number.isSafeInteger(expected.size) ||
      expected.size < 0 ||
      typeof expected.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(expected.sha256)
    )
      throw new Error("Índice do backup inválido.");
    validateBackupEntryName(expected.path);
    if (payloads.has(expected.path))
      throw new Error("Arquivo duplicado no índice do backup.");
    const entry = entriesByName.get(expected.path);
    if (!entry || entry.isDirectory)
      throw new Error("O backup está sem um dos arquivos.");
    const payload = readEntry(
      entry,
      expected.path === "state.json" ? MAX_STATE_BYTES : MAX_MATERIAL_BYTES,
    );
    if (payload.length !== expected.size || digest(payload) !== expected.sha256)
      throw new Error("A integridade do backup não pôde ser confirmada.");
    payloads.set(expected.path, payload);
  }
  const serializedState = payloads.get("state.json");
  if (
    !serializedState ||
    entries.length !==
      payloads.size + 1 + (entriesByName.has("materials/") ? 1 : 0)
  )
    throw new Error("O índice do backup não corresponde aos arquivos.");
  const state = validateState(JSON.parse(serializedState.toString("utf8")));
  const materials = new Map<string, Buffer>();
  for (const material of state.materials) {
    const name = validateStoredName(material.storedName);
    if (materials.has(name))
      throw new Error("O backup contém anexos repetidos.");
    const payload = payloads.get(`materials/${name}`);
    if (!payload || payload.length !== material.size)
      throw new Error(
        "O backup está sem um anexo ou seu tamanho foi alterado.",
      );
    assertFileContent(materialExtension(name), payload);
    materials.set(name, payload);
  }
  if (payloads.size !== materials.size + 1)
    throw new Error("O backup contém anexos que não pertencem à coleção.");
  return { state, materials };
}
