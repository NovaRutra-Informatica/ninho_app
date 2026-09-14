import path from "node:path";

export const MAX_MATERIAL_BYTES = 100 * 1024 * 1024;
export const MAX_STATE_BYTES = 32 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 5002;
export const MATERIAL_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "txt",
  "md",
  "docx",
  "pptx",
  "xlsx",
] as const;
export type MaterialExtension = (typeof MATERIAL_EXTENSIONS)[number];

export function materialExtension(name: string): MaterialExtension {
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!MATERIAL_EXTENSIONS.includes(extension as MaterialExtension)) {
    throw new Error(
      "Formato não aceito. Escolha PDF, imagem (PNG, JPG ou WebP), TXT, Markdown, DOCX, PPTX ou XLSX.",
    );
  }
  return extension as MaterialExtension;
}

export function validateStoredName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg|webp|txt|md|docx|pptx|xlsx)$/i.test(
      value,
    )
  ) {
    throw new Error("Nome interno do arquivo inválido.");
  }
  return value;
}

export function managedPath(directory: string, storedName: unknown): string {
  const name = validateStoredName(storedName);
  const resolved = path.resolve(directory, name);
  if (
    path.dirname(resolved).toLowerCase() !==
    path.resolve(directory).toLowerCase()
  ) {
    throw new Error("O arquivo precisa estar dentro da biblioteca.");
  }
  return resolved;
}

export function validateExternalUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    throw new Error("Endereço inválido.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Endereço inválido.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Somente links http ou https, sem credenciais, podem ser abertos.",
    );
  }
  return url.href;
}

export function isTrustedDocument(
  candidate: string,
  expected: string,
): boolean {
  try {
    const actualUrl = new URL(candidate);
    const expectedUrl = new URL(expected);
    actualUrl.hash = "";
    expectedUrl.hash = "";
    return actualUrl.href === expectedUrl.href;
  } catch {
    return false;
  }
}

export function validateBackupEntryName(name: string): void {
  if (
    name === "manifest.json" ||
    name === "state.json" ||
    name === "materials/"
  )
    return;
  if (!name.startsWith("materials/"))
    throw new Error("O backup contém um caminho não permitido.");
  validateStoredName(name.slice("materials/".length));
}

export function assertFileContent(
  extension: MaterialExtension,
  data: Buffer,
): void {
  if (data.length > MAX_MATERIAL_BYTES)
    throw new Error("O arquivo excede o limite de 100 MB.");
  if (
    data.subarray(0, 2).toString() === "MZ" ||
    data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  ) {
    throw new Error(
      "Arquivos executáveis não podem ser adicionados à biblioteca.",
    );
  }
  if (
    extension === "pdf" &&
    !data.subarray(0, 1024).includes(Buffer.from("%PDF-"))
  )
    throw new Error("O arquivo não parece ser um PDF válido.");
  if (
    extension === "png" &&
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("A imagem PNG é inválida.");
  if (
    ["jpg", "jpeg"].includes(extension) &&
    !(data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
  )
    throw new Error("A imagem JPEG é inválida.");
  if (
    extension === "webp" &&
    !(
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP"
    )
  )
    throw new Error("A imagem WebP é inválida.");
  if (
    ["docx", "pptx", "xlsx"].includes(extension) &&
    !data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  )
    throw new Error("O documento Office é inválido.");
  if (["txt", "md"].includes(extension) && data.subarray(0, 8192).includes(0))
    throw new Error("O texto precisa estar salvo em UTF-8.");
}
