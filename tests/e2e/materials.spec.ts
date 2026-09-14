import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";

test("importa PDF e texto, exibe prévia, guarda anotações e conserva os originais", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  const originalTxt = path.join(ninho.fixtureDir, "revisao-redes.txt");
  const originalPdf = path.join(ninho.fixtureDir, "resumo-algoritmos.pdf");
  const before = await ninho.state();
  const subject = before.subjects.find(
    (item) => item.name === "Banco de dados",
  )!;
  const literature = before.subjects.find(
    (item) => item.name === "Literatura",
  )!;
  await page.getByTestId("nav-materials").click();
  await page
    .getByRole("combobox", { name: "Filtrar matéria" })
    .selectOption(subject.id);
  await ninho.openDialog([], true);
  await page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Adicionar arquivos", exact: true }),
  ).toBeEnabled();
  expect((await ninho.state()).materials).toEqual(before.materials);
  await ninho.openDialog([originalTxt, originalPdf]);
  await page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).materials.length)
    .toBe(before.materials.length + 2);
  const materials = (await ninho.state()).materials;
  const txt = materials.find((item) => item.name === "revisao-redes.txt")!;
  const pdf = materials.find((item) => item.name === "resumo-algoritmos.pdf")!;
  expect(txt.subjectId).toBe(subject.id);
  expect(pdf.subjectId).toBe(subject.id);
  await page
    .getByTestId(`material-row-${txt.id}`)
    .getByRole("button", { name: `Abrir ${txt.name}`, exact: true })
    .click();
  let modal = page.getByRole("dialog", { name: txt.name, exact: true });
  await expect(modal).toContainText("DNS traduz nomes de domínio");
  await ninho.app.evaluate(({ shell }) => {
    shell.openPath = async (file) => {
      (
        globalThis as typeof globalThis & { ninhoOpenedFile?: string }
      ).ninhoOpenedFile = file;
      return "";
    };
  });
  await modal
    .getByRole("button", { name: "Abrir no Windows", exact: true })
    .click();
  const openedFile = await ninho.app.evaluate(
    () =>
      (globalThis as typeof globalThis & { ninhoOpenedFile?: string })
        .ninhoOpenedFile,
  );
  expect(openedFile).toBeDefined();
  expect(path.relative(ninho.dataDir, openedFile!).startsWith("..")).toBe(
    false,
  );
  expect(await fs.readFile(openedFile!, "utf8")).toContain("DNS traduz");
  await modal
    .getByRole("combobox", { name: "Matéria", exact: true })
    .selectOption(literature.id);
  await modal
    .getByLabel("Anotações do material")
    .fill("Rever exemplos de nomes e endereços antes da prova.");
  await modal
    .getByRole("button", { name: "Salvar material", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).materials.find((item) => item.id === txt.id)
          ?.notes,
    )
    .toBe("Rever exemplos de nomes e endereços antes da prova.");
  expect(
    (await ninho.state()).materials.find((item) => item.id === txt.id)
      ?.subjectId,
  ).toBe(literature.id);
  await modal
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tipo de arquivo" })
    .selectOption("pdf");
  await expect(page.getByTestId(`material-row-${txt.id}`)).toHaveCount(0);
  await page
    .getByTestId(`material-row-${pdf.id}`)
    .getByRole("button", { name: `Abrir ${pdf.name}`, exact: true })
    .click();
  modal = page.getByRole("dialog", { name: pdf.name, exact: true });
  await expect(modal.locator("iframe")).toHaveAttribute(
    "src",
    /^data:application\/pdf;base64,JVBER/,
  );
  await expect(modal.locator("iframe")).toBeVisible();
  await expect(modal).toHaveCSS("opacity", "1");
  const bounds = (await modal.boundingBox())!;
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  let pdfViewerFrame: import("@playwright/test").Frame | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      if (await frame.locator("pdf-viewer").count()) {
        pdfViewerFrame = frame;
        return true;
      }
    }
    return false;
  }).toBe(true);
  await expect(pdfViewerFrame!.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
  await expect(pdfViewerFrame!.getByRole("tab", { name: "Thumbnail for page 1", exact: true })).toBeVisible();
  const pdfScreenshot = testInfo.outputPath("pdf-carregado.png");
  await page.screenshot({ path: pdfScreenshot, animations: "disabled" });
  await testInfo.attach("previa-pdf", {
    path: pdfScreenshot,
    contentType: "image/png",
  });
  await modal
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  // Move only the fixture original. The library must use its private copy.
  await fs.rename(
    originalPdf,
    path.join(ninho.fixtureDir, "original-movido.pdf"),
  );
  expect(
    await page.evaluate((id) => window.ninho!.previewMaterial(id), pdf.id),
  ).toMatchObject({ kind: "pdf", name: pdf.name });
  await page
    .getByRole("combobox", { name: "Tipo de arquivo" })
    .selectOption("all");
  await page
    .getByRole("combobox", { name: "Filtrar matéria" })
    .selectOption("");
  await page
    .getByTestId(`material-row-${txt.id}`)
    .getByRole("button", { name: `Remover ${txt.name}` })
    .click();
  await page
    .getByRole("dialog", { name: "Remover da biblioteca?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await ninho.state()).materials.some((item) => item.id === txt.id),
    )
    .toBe(false);
  expect(await fs.readFile(originalTxt, "utf8")).toContain("DNS traduz");
  await ninho.restart();
  expect(
    (await ninho.state()).materials.find((item) => item.id === pdf.id),
  ).toEqual(pdf);
  expect(
    await ninho.page.evaluate(
      (id) => window.ninho!.previewMaterial(id),
      pdf.id,
    ),
  ).toMatchObject({ kind: "pdf", name: pdf.name });
});
