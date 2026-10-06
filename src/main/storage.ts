import { constants, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import AdmZip from "adm-zip";
import { applyCommand, createInitialState, validateState } from "../domain";
import { inferMaterialContext } from "./material-context";
import { readBackupFile, writeBackupFile } from "./backup";
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
  materialLimit,
  isMedia,
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
          const id = randomUUID();
          const storedName = `${id}.${extension}`;
          const destination = managedPath(this.materialsDirectory, storedName);
          let size: number;
          if (isMedia(extension)) {
            const stat = await fs.lstat(original);
            if (!stat.isFile() || stat.isSymbolicLink())
              throw new Error(
                "Escolha um arquivo comum, sem atalhos ou links simbólicos.",
              );
            if (stat.size > materialLimit(extension))
              throw new Error("O vídeo ou áudio excede o limite de 2 GB.");
            const handle = await fs.open(original, constants.O_RDONLY);
            try {
              const opened = await handle.stat();
              if (!opened.isFile() || opened.size !== stat.size)
                throw new Error("O arquivo foi alterado durante a leitura.");
              const header = Buffer.alloc(8192);
              const { bytesRead } = await handle.read(
                header,
                0,
                header.length,
                0,
              );
              assertFileContent(extension, header.subarray(0, bytesRead));
              size = 0;
              const bounded = new Transform({
                transform(chunk, _encoding, callback) {
                  size += chunk.length;
                  callback(
                    size > materialLimit(extension)
                      ? new Error("O vídeo ou áudio excede o limite de 2 GB.")
                      : null,
                    chunk,
                  );
                },
              });
              const output = createWriteStream(destination, {
                flags: "wx",
                mode: 0o600,
              });
              output.once("open", () => createdFiles.push(destination));
              await pipeline(
                handle.createReadStream({ start: 0, autoClose: false }),
                bounded,
                output,
              );
              if (size !== opened.size)
                throw new Error("O arquivo foi alterado durante a cópia.");
            } finally {
              await handle.close();
            }
          } else {
            const data = await readBounded(original, MAX_MATERIAL_BYTES);
            assertFileContent(extension, data);
            await fs.writeFile(destination, data, { flag: "wx", mode: 0o600 });
            createdFiles.push(destination);
            size = data.length;
          }
          materials.push({
            id,
            name: path.basename(original),
            storedName,
            type: extension,
            size,
            ...inferMaterialContext(state, original, context),
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
    const directoryStat = await fs
      .lstat(this.materialsDirectory)
      .catch((error) => {
        if (isMissing(error))
          throw new Error(
            "A pasta de materiais não foi encontrada. Restaure um backup que contenha seus anexos.",
          );
        throw error;
      });
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
      throw new Error(
        "A pasta de materiais não pode ser um atalho ou link simbólico.",
      );
    const stat = await fs.lstat(file, { bigint: true }).catch((error) => {
      if (isMissing(error))
        throw new Error(
          "O arquivo da biblioteca não foi encontrado. Restaure um backup que contenha seus anexos.",
        );
      throw error;
    });
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("O anexo não é um arquivo válido da biblioteca.");
    const realFile = await fs.realpath(file);
    const resolvedStat = await fs.lstat(realFile, { bigint: true });
    // MSIX can merge physical and redirected AppData: compare file identity, not canonical parents.
    if (
      !resolvedStat.isFile() ||
      resolvedStat.isSymbolicLink() ||
      resolvedStat.dev !== stat.dev ||
      resolvedStat.ino !== stat.ino
    )
      throw new Error(
        "O arquivo foi alterado durante a abertura. Tente novamente.",
      );
    // The default Windows reader may run outside the package's virtual view.
    return { material, file: realFile };
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

  private async backupFile(
    state: AppState,
    destination: string,
  ): Promise<void> {
    await writeBackupFile(state, this.materialsDirectory, destination);
  }

  exportBackup(destination: string): Promise<string> {
    return this.serial(async () => {
      if (
        !path.isAbsolute(destination) ||
        path.extname(destination).toLowerCase() !== ".zip"
      )
        throw new Error("Salve o backup como um arquivo .zip.");
      const state = await this.loadUnlocked();
      await this.backupFile(state, destination);
      return destination;
    });
  }

  private async auditPreviousMaterials(state: AppState): Promise<{
    available: Material[];
    missing: number;
    damaged: number;
  }> {
    const result = { available: [] as Material[], missing: 0, damaged: 0 };
    for (const material of state.materials) {
      const file = managedPath(this.materialsDirectory, material.storedName);
      const extension = materialExtension(material.storedName);
      const stat = await fs.lstat(file, { bigint: true }).catch((error) => {
        if (isMissing(error)) return undefined;
        throw error;
      });
      if (!stat) {
        result.missing++;
        continue;
      }
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== BigInt(material.size) ||
        stat.size > BigInt(materialLimit(extension))
      ) {
        result.damaged++;
        continue;
      }
      const handle = await fs.open(file, constants.O_RDONLY).catch((error) => {
        if (isMissing(error)) return undefined;
        throw error;
      });
      if (!handle) {
        result.missing++;
        continue;
      }
      let header: Buffer;
      try {
        const opened = await handle.stat({ bigint: true });
        if (
          !opened.isFile() ||
          opened.dev !== stat.dev ||
          opened.ino !== stat.ino ||
          opened.size !== stat.size
        )
          throw new Error(
            "Um anexo mudou durante a verificação de segurança. Tente restaurar novamente.",
          );
        header = Buffer.alloc(Math.min(material.size, 8192));
        let offset = 0;
        while (offset < header.length) {
          const { bytesRead } = await handle.read(
            header,
            offset,
            header.length - offset,
            offset,
          );
          if (!bytesRead)
            throw new Error(
              "Um anexo mudou durante a verificação de segurança. Tente restaurar novamente.",
            );
          offset += bytesRead;
        }
        const checked = await handle.stat({ bigint: true });
        if (checked.size !== opened.size || checked.mtimeNs !== opened.mtimeNs)
          throw new Error(
            "Um anexo mudou durante a verificação de segurança. Tente restaurar novamente.",
          );
      } finally {
        await handle.close();
      }
      try {
        assertFileContent(extension, header);
      } catch {
        // Catch signature errors only; I/O or backup failures must abort restoration.
        result.damaged++;
        continue;
      }
      result.available.push(material);
    }
    return result;
  }

  restoreBackup(source: string): Promise<AppState> {
    return this.serial(async () => {
      if (!path.isAbsolute(source))
        throw new Error("Escolha um backup ZIP válido do Ninho.");
      await this.prepareDirectories();
      const staging = await fs.mkdtemp(path.join(this.directory, ".restore-"));
      try {
        const restored = await readBackupFile(source, staging);
        let restorationNotice: string | undefined;
        let oldState: AppState | undefined;
        try {
          oldState = await this.loadUnlocked();
        } catch (error) {
          if (!(error instanceof DataRecoveryError)) throw error;
        }
        if (oldState) {
          const safetyName = `antes-de-restaurar-${timestamp()}-${randomUUID()}`;
          const audit = await this.auditPreviousMaterials(oldState);
          if (!audit.missing && !audit.damaged) {
            await this.backupFile(
              oldState,
              path.join(this.backupsDirectory, `${safetyName}.zip`),
            );
          } else {
            await atomicWrite(
              path.join(
                this.backupsDirectory,
                `${safetyName}-indice-original.json`,
              ),
              JSON.stringify(oldState, null, 2),
            );
            await this.backupFile(
              { ...oldState, materials: audit.available },
              path.join(
                this.backupsDirectory,
                `${safetyName}-anexos-disponiveis.zip`,
              ),
            );
            restorationNotice = [
              audit.missing
                ? `${audit.missing} anexo(s) da coleção anterior já estavam ausentes.`
                : "",
              audit.damaged
                ? `${audit.damaged} anexo(s) apresentavam tamanho ou formato inválido. Esses arquivos foram mantidos sem alteração em ${this.materialsDirectory}.`
                : "",
              `Preservamos o índice original e um backup dos anexos válidos em ${this.backupsDirectory}. O backup selecionado foi restaurado.`,
            ]
              .filter(Boolean)
              .join(" ");
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
            const storedName = `${randomUUID()}.${materialExtension(originalName)}`;
            const destination = managedPath(
              this.materialsDirectory,
              storedName,
            );
            await fs.copyFile(
              restored.materials.get(originalName)!,
              destination,
              constants.COPYFILE_EXCL,
            );
            createdFiles.push(destination);
            material.storedName = storedName;
          }
          const committed = await this.commit(restored.state);
          if (restorationNotice) this.recoveryNotice = restorationNotice;
          return committed;
        } catch (error) {
          await Promise.all(
            createdFiles.map((file) => fs.rm(file, { force: true })),
          );
          throw error;
        }
      } finally {
        if (
          path.dirname(path.resolve(staging)).toLowerCase() !==
            this.directory.toLowerCase() ||
          !path.basename(staging).startsWith(".restore-")
        )
          throw new Error("Pasta temporária fora do diretório de dados.");
        await fs.rm(staging, { recursive: true, force: true });
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
  const bufferLimit = 100 * 1024 * 1024;
  if (data.length > bufferLimit)
    throw new Error(
      "Use a restauração de arquivo para backups maiores que 100 MB.",
    );
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
      total > bufferLimit ||
      !Number.isSafeInteger(total) ||
      entry.header.size < 0
    )
      throw new Error(
        "Use a restauração de arquivo para backups maiores que 100 MB.",
      );
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
      expected.path === "state.json"
        ? MAX_STATE_BYTES
        : Math.min(
            bufferLimit,
            materialLimit(materialExtension(expected.path)),
          ),
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
