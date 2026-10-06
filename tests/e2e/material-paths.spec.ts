import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AppState, Subject } from "../../src/shared/types";
import { test, expect, minimalPdf, type NinhoTestApp } from "./fixtures";

const existingPdf = minimalPdf();
const initial = JSON.parse(
  readFileSync(new URL("../fixtures/v1-state.json", import.meta.url), "utf8"),
) as Omit<AppState, "version" | "programs" | "subjects"> & {
  version: 1;
  subjects: Omit<Subject, "programId">[];
};
const [firstLesson, nextLesson] = initial.lessons.filter(
  (lesson) => lesson.subjectId === "literatura",
);
const existing = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "PDF existente da aula 00.pdf",
  storedName: "22222222-2222-4222-8222-222222222222.pdf",
  type: "pdf",
  size: existingPdf.length,
  subjectId: firstLesson.subjectId,
  lessonId: firstLesson.id,
  createdAt: new Date().toISOString(),
  notes: "Anexo existente antes de abrir o aplicativo.",
};
initial.materials = [existing];

async function interceptReader(ninho: NinhoTestApp) {
  await ninho.app.evaluate(({ shell }) => {
    const context = globalThis as unknown as { qaOpenedFiles: string[] };
    context.qaOpenedFiles = [];
    shell.openPath = async (file) => {
      context.qaOpenedFiles.push(file);
      return "";
    };
  });
}

async function openedFiles(ninho: NinhoTestApp) {
  return ninho.app.evaluate(
    () => (globalThis as unknown as { qaOpenedFiles: string[] }).qaOpenedFiles,
  );
}

async function canonicalFile(ninho: NinhoTestApp, storedName: string) {
  const logical = path.join(ninho.dataDir, "materials", storedName);
  const canonical = await fs.realpath(logical);
  return { logical, canonical };
}

for (const mode of ["roaming-overlay", "junction-mixed-case"] as const) {
  test.describe(mode, () => {
    test.use({
      profilePathStyle: mode,
      initialState: initial,
      initialMaterials: [
        { storedName: existing.storedName, content: existingPdf },
      ],
    });

    test("PDF existente abre pelo caminho físico canônico e mantém prévia, vínculo e backup", async ({
      ninho,
    }) => {
      test.setTimeout(120_000);
      const { page } = ninho;
      const paths = await canonicalFile(ninho, existing.storedName);
      test.skip(
        mode === "roaming-overlay" &&
          paths.canonical.toLowerCase() === paths.logical.toLowerCase(),
        "Este Windows não virtualizou a pasta QA de AppData; não há overlay real para exercitar neste ambiente.",
      );
      // Keep realpath, lstat and IPC real: mocked paths miss Windows alias failures.
      expect(paths.canonical.toLowerCase()).not.toBe(
        paths.logical.toLowerCase(),
      );
      expect(await fs.readFile(paths.canonical)).toEqual(existingPdf);
      const preview = await page.evaluate(
        (id) => window.ninho!.previewMaterial(id),
        existing.id,
      );
      expect(preview.kind).toBe("pdf");
      expect(Buffer.from(preview.data!, "base64")).toEqual(existingPdf);
      await interceptReader(ninho);
      await page.getByTestId("nav-studies").click();
      await page.getByTestId("program-senado-federal").click();
      await page.getByTestId(`subject-${existing.subjectId}`).click();
      await page.getByTestId(`lesson-open-materials-${firstLesson.id}`).click();
      const section = page.getByTestId(`lesson-materials-${firstLesson.id}`);
      await section
        .getByRole("button", { name: `Abrir ${existing.name}`, exact: true })
        .click();
      const modal = page.getByRole("dialog", {
        name: existing.name,
        exact: true,
      });
      await modal
        .getByRole("button", { name: "Abrir no Windows", exact: true })
        .click();
      await expect.poll(() => openedFiles(ninho)).toEqual([paths.canonical]);
      await modal
        .getByRole("combobox", { name: "Aula do material", exact: true })
        .selectOption(nextLesson.id);
      await modal
        .getByRole("button", { name: "Salvar material", exact: true })
        .click();
      await expect
        .poll(async () => (await ninho.state()).materials[0].lessonId)
        .toBe(nextLesson.id);
      await modal
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await expect(
        section.getByTestId(`material-row-${existing.id}`),
      ).toHaveCount(0);
      await page.getByTestId(`lesson-open-materials-${nextLesson.id}`).click();
      await expect(
        page
          .getByTestId(`lesson-materials-${nextLesson.id}`)
          .getByTestId(`material-row-${existing.id}`),
      ).toBeVisible();

      await ninho.openDialog([
        path.join(ninho.fixtureDir, "revisao-redes.txt"),
      ]);
      const imported = await page.evaluate(
        (lesson) =>
          window.ninho!.importMaterials({
            subjectId: lesson.subjectId,
            lessonId: lesson.id,
          }),
        nextLesson,
      );
      expect(imported?.materials).toHaveLength(2);
      const txt = imported!.materials.find(
        (material) => material.id !== existing.id,
      )!;
      const textPaths = await canonicalFile(ninho, txt.storedName);
      await page.evaluate((id) => window.ninho!.openMaterial(id), txt.id);
      expect(await openedFiles(ninho)).toEqual([
        paths.canonical,
        textPaths.canonical,
      ]);
      expect(await fs.readFile(textPaths.canonical, "utf8")).toContain(
        "DNS traduz",
      );
      const beforeBackup = await ninho.state();
      await ninho.saveDialog(ninho.backupPath);
      expect(await page.evaluate(() => window.ninho!.exportBackup())).toBe(
        ninho.backupPath,
      );
      expect((await fs.stat(ninho.backupPath)).size).toBeGreaterThan(0);
      await page.evaluate(
        (id) => window.ninho!.dispatch({ type: "material.remove", id }),
        txt.id,
      );
      await ninho.openDialog([ninho.backupPath]);
      await ninho.confirmDialog(1);
      const restored = await page.evaluate(() => window.ninho!.restoreBackup());
      expect(restored?.materials).toHaveLength(2);
      const stripNames = (materials: typeof beforeBackup.materials) =>
        materials.map(({ storedName: _name, ...material }) => material);
      expect(stripNames(restored!.materials)).toEqual(
        stripNames(beforeBackup.materials),
      );
      await ninho.restart();
      expect(await ninho.state()).toEqual(restored);
      await interceptReader(ninho);
      const restoredPdf = restored!.materials.find(
        (material) => material.id === existing.id,
      )!;
      const restoredPaths = await canonicalFile(ninho, restoredPdf.storedName);
      await ninho.page.evaluate(
        (id) => window.ninho!.openMaterial(id),
        existing.id,
      );
      expect(await openedFiles(ninho)).toEqual([restoredPaths.canonical]);
      expect(await fs.readFile(restoredPaths.canonical)).toEqual(existingPdf);
      expect(
        (
          await ninho.page.evaluate(
            (id) => window.ninho!.previewMaterial(id),
            existing.id,
          )
        ).kind,
      ).toBe("pdf");
    });
  });
}

test.describe("anexo ausente", () => {
  test.use({
    initialState: initial,
    initialMaterials: [
      { storedName: existing.storedName, content: existingPdf },
    ],
  });
  test("abertura, prévia e exportação recusam arquivo ausente sem alterar dados ou chamar o leitor", async ({
    ninho,
  }) => {
    const before = await ninho.state();
    await interceptReader(ninho);
    const { canonical } = await canonicalFile(ninho, existing.storedName);
    await fs.unlink(canonical);
    const failures = await ninho.page.evaluate(async (id) => {
      const output: string[] = [];
      for (const action of [
        () => window.ninho!.openMaterial(id),
        () => window.ninho!.previewMaterial(id),
      ]) {
        try {
          await action();
          output.push("unexpected success");
        } catch (error) {
          output.push(String(error));
        }
      }
      return output;
    }, existing.id);
    expect(failures).toHaveLength(2);
    for (const failure of failures)
      expect(failure).toMatch(/não foi encontrado/i);
    expect(await openedFiles(ninho)).toEqual([]);
    await ninho.saveDialog(ninho.backupPath);
    const exportError = await ninho.page.evaluate(async () => {
      try {
        await window.ninho!.exportBackup();
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    });
    expect(exportError).not.toBe("unexpected success");
    expect(await fs.stat(ninho.backupPath).catch(() => null)).toBeNull();
    expect(await ninho.state()).toEqual(before);
    await ninho.page.getByTestId("nav-materials").click();
    await ninho.page
      .getByRole("button", { name: `Abrir ${existing.name}`, exact: true })
      .click();
    const modal = ninho.page.getByRole("dialog", {
      name: existing.name,
      exact: true,
    });
    await expect(
      modal.getByRole("heading", {
        name: "Não foi possível abrir a prévia.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      modal.getByRole("heading", {
        name: "Abra com seu aplicativo favorito.",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(modal).not.toContainText("Error invoking remote method");
    await modal
      .getByRole("textbox", { name: "Anotações do material", exact: true })
      .fill("Rascunho preservado ao recuperar a prévia.");
    await modal
      .getByRole("button", { name: "Abrir no Windows", exact: true })
      .click();
    expect(await openedFiles(ninho)).toEqual([]);
    await fs.writeFile(canonical, existingPdf);
    await modal
      .getByRole("button", { name: "Tentar prévia novamente", exact: true })
      .click();
    await expect(modal.locator("iframe")).toBeVisible();
    await expect(
      modal.getByRole("textbox", {
        name: "Anotações do material",
        exact: true,
      }),
    ).toHaveValue("Rascunho preservado ao recuperar a prévia.");
    await modal
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
    expect(await ninho.state()).toEqual(before);
  });
});

test.describe("recuperação de anexo danificado", () => {
  test.use({
    initialState: initial,
    initialMaterials: [
      { storedName: existing.storedName, content: existingPdf },
    ],
  });
  test("restaura um backup válido mesmo quando o PDF atual perdeu seu conteúdo", async ({
    ninho,
  }) => {
    const before = await ninho.state();
    await ninho.saveDialog(ninho.backupPath);
    expect(await ninho.page.evaluate(() => window.ninho!.exportBackup())).toBe(
      ninho.backupPath,
    );
    const { canonical } = await canonicalFile(ninho, existing.storedName);
    await fs.writeFile(canonical, Buffer.alloc(existingPdf.length));
    const previewError = await ninho.page.evaluate(async (id) => {
      try {
        await window.ninho!.previewMaterial(id);
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, existing.id);
    expect(previewError).not.toBe("unexpected success");
    await ninho.page.getByTestId("nav-settings").click();
    await ninho.openDialog([ninho.backupPath]);
    await ninho.confirmDialog(1);
    await ninho.page
      .getByRole("button", { name: "Restaurar backup", exact: true })
      .click();
    await ninho.page
      .getByRole("dialog", { name: "Restaurar um Ninho salvo?", exact: true })
      .getByRole("button", { name: "Escolher backup", exact: true })
      .click();
    await expect
      .poll(async () => (await ninho.state()).materials[0].storedName)
      .not.toBe(existing.storedName);
    const restored = await ninho.state();
    expect(restored.materials[0]).toEqual({
      ...before.materials[0],
      storedName: restored.materials[0].storedName,
    });
    expect({ ...restored, materials: before.materials }).toEqual(before);
    const restoredPaths = await canonicalFile(
      ninho,
      restored.materials[0].storedName,
    );
    expect(await fs.readFile(restoredPaths.canonical)).toEqual(existingPdf);
    expect(await fs.readFile(canonical)).toEqual(
      Buffer.alloc(existingPdf.length),
    );
    const preview = await ninho.page.evaluate(
      (id) => window.ninho!.previewMaterial(id),
      existing.id,
    );
    expect(preview.kind).toBe("pdf");
    expect(Buffer.from(preview.data!, "base64")).toEqual(existingPdf);
    await interceptReader(ninho);
    await ninho.page.evaluate(
      (id) => window.ninho!.openMaterial(id),
      existing.id,
    );
    expect(await openedFiles(ninho)).toEqual([restoredPaths.canonical]);
  });
});
