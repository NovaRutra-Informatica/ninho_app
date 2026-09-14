import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StudyStore } from "./storage";
import {
  assertFileContent,
  materialExtension,
  validateStoredName,
  MAX_MEDIA_BYTES,
} from "./security";

const headers: Record<string, Buffer> = {
  mp4: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]),
  mov: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 113, 116, 32, 32]),
  m4a: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32]),
  webm: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]),
  mkv: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]),
  mp3: Buffer.from("ID3\x04\x00\x00"),
  wav: Buffer.from("RIFF0000WAVE"),
  ogg: Buffer.from("OggS0000"),
  aac: Buffer.from([0xff, 0xf1, 0x50, 0]),
  flac: Buffer.from("fLaC0000"),
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ninho-media-test-"));
  roots.push(root);
  return { root, store: new StudyStore(path.join(root, "data")) };
}
describe("materiais de vídeo e áudio sem carregar o arquivo inteiro", () => {
  it.each(Object.keys(headers))(
    "reconhece %s, guarda uma cópia e abre externamente",
    async (extension) => {
      const { root, store } = await setup();
      const source = path.join(root, `minha-aula.${extension}`);
      await fs.writeFile(source, headers[extension]);
      const state = await store.importFiles([source], {
        subjectId: "banco-de-dados",
      });
      const material = state.materials[0];
      expect(material.type).toBe(extension);
      expect(materialExtension(source)).toBe(extension);
      expect(validateStoredName(material.storedName)).toBe(material.storedName);
      expect(
        await fs.readFile(await store.resolveMaterial(material.id)),
      ).toEqual(headers[extension]);
      expect(await fs.readFile(source)).toEqual(headers[extension]);
      expect(await store.previewMaterial(material.id)).toEqual({
        kind: "external",
        name: `minha-aula.${extension}`,
      });
    },
  );
  it.each(Object.keys(headers))(
    "rejeita executável ou texto renomeado para %s",
    (extension) => {
      expect(() =>
        assertFileContent(
          materialExtension(`a.${extension}`),
          Buffer.from("MZ-unsafe"),
        ),
      ).toThrow(/executáveis/);
      expect(() =>
        assertFileContent(
          materialExtension(`a.${extension}`),
          Buffer.from("arquivo incorreto"),
        ),
      ).toThrow(/corresponde/);
    },
  );
  it("copia vídeo acima de 100 MiB e preserva seu tamanho após reiniciar", async () => {
    const { root, store } = await setup();
    const source = path.join(root, "gravacao.mp4");
    const handle = await fs.open(source, "w");
    await handle.write(headers.mp4);
    await handle.truncate(101 * 1024 * 1024);
    await handle.close();
    const state = await store.importFiles([source]);
    const material = state.materials[0];
    expect(material.size).toBe(101 * 1024 * 1024);
    expect((await fs.stat(await store.resolveMaterial(material.id))).size).toBe(
      material.size,
    );
    expect((await new StudyStore(store.directory).load()).materials[0]).toEqual(
      material,
    );
  });
  it("recusa mídia acima de 2 GiB antes de copiá-la e não deixa anexo parcial", async () => {
    const { root, store } = await setup();
    const source = path.join(root, "grande.mp4");
    const handle = await fs.open(source, "w");
    await handle.write(headers.mp4);
    await handle.truncate(MAX_MEDIA_BYTES + 1);
    await handle.close();
    await expect(store.importFiles([source])).rejects.toThrow(/2 GB/);
    expect((await store.load()).materials).toHaveLength(0);
    expect(await fs.readdir(store.materialsDirectory)).toHaveLength(0);
  });
  it("desfaz a cópia do lote se outro anexo é inválido", async () => {
    const { root, store } = await setup();
    const good = path.join(root, "gravacao.mp4"),
      bad = path.join(root, "falso.wav");
    await fs.writeFile(good, headers.mp4);
    await fs.writeFile(bad, "invalido");
    await expect(store.importFiles([good, bad])).rejects.toThrow(/corresponde/);
    expect(await fs.readdir(store.materialsDirectory)).toHaveLength(0);
  });
});
