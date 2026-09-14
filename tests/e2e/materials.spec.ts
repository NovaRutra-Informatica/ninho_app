import { promises as fs } from "node:fs";
import path from "node:path";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { test, expect, minimalPdf } from "./fixtures";

async function assertPdfPainted(
  page: Page,
  app: ElectronApplication,
  testInfo: TestInfo,
  label: string,
) {
  const frame = page.getByRole("dialog").locator("iframe");
  await expect(frame).toBeVisible();
  const box = (await frame.boundingBox())!;
  let clip = {
    x: Math.ceil(box.x),
    y: Math.ceil(box.y),
    width: Math.floor(box.width),
    height: Math.floor(box.height),
  };
  const sample = async () => {
    // The native PDF plugin is a separate child frame. Its rectangle excludes
    // the viewer's sidebar, so a painted thumbnail alone cannot satisfy this.
    let pluginBox: Awaited<ReturnType<typeof frame.boundingBox>> = null;
    for (const child of page.frames()) {
      if (child.isDetached()) continue;
      const plugin = child.locator("pdf-viewer #plugin");
      if (await plugin.count()) {
        pluginBox = await plugin.boundingBox();
        if (pluginBox) break;
      }
    }
    if (!pluginBox)
      return {
        magenta: 0,
        cyan: 0,
        dimensions: { width: 0, height: 0 },
        plugin: false,
      };
    const left = Math.max(box.x, pluginBox.x);
    const top = Math.max(box.y, pluginBox.y);
    clip = {
      x: Math.ceil(left),
      y: Math.ceil(top),
      width: Math.floor(
        Math.min(box.x + box.width, pluginBox.x + pluginBox.width) - left,
      ),
      height: Math.floor(
        Math.min(box.y + box.height, pluginBox.y + pluginBox.height) - top,
      ),
    };
    expect(clip.width).toBeGreaterThan(0);
    expect(clip.height).toBeGreaterThan(0);
    return app.evaluate(async ({ BrowserWindow }, bounds) => {
      const window = BrowserWindow.getAllWindows().find(
        (item) => !item.isDestroyed(),
      )!;
      const capture = await window.capturePage(bounds);
      const pixels = capture.toBitmap();
      let magenta = 0;
      let cyan = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const blue = pixels[index];
        const green = pixels[index + 1];
        const red = pixels[index + 2];
        if (red > 240 && green < 15 && Math.abs(blue - 153) < 15) magenta++;
        if (red < 15 && Math.abs(green - 204) < 15 && blue > 240) cyan++;
      }
      return { magenta, cyan, dimensions: capture.getSize(), plugin: true };
    }, clip);
  };
  let paint: Awaited<ReturnType<typeof sample>> | undefined;
  try {
    await expect
      .poll(
        async () => {
          paint = await sample();
          return Math.min(paint.magenta, paint.cyan);
        },
        {
          message:
            "The PDF page must paint both fixture vector blocks, not only create its viewer",
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(400);
  } finally {
    const capture = await app.evaluate(async ({ BrowserWindow }, bounds) => {
      const window = BrowserWindow.getAllWindows().find(
        (item) => !item.isDestroyed(),
      )!;
      return (await window.capturePage(bounds)).toPNG().toString("base64");
    }, clip);
    await testInfo.attach(`${label}-pdf-paint`, {
      body: Buffer.from(capture, "base64"),
      contentType: "image/png",
    });
    await testInfo.attach(`${label}-pdf-pixels`, {
      body: JSON.stringify({ ...paint, clip }),
      contentType: "application/json",
    });
  }
}

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
  expect(openedFile).toBe(
    await fs.realpath(path.join(ninho.dataDir, "materials", txt.storedName)),
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
  await expect(modal.locator("iframe")).toHaveAttribute("src", /^blob:/);
  await expect(modal.locator("iframe")).toBeVisible();
  await expect(modal).toHaveCSS("opacity", "1");
  const bounds = (await modal.boundingBox())!;
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  let pdfViewerFrame: import("@playwright/test").Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        if (await frame.locator("pdf-viewer").count()) {
          pdfViewerFrame = frame;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  await expect(
    pdfViewerFrame!.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("1");
  await expect(
    pdfViewerFrame!.getByRole("tab", {
      name: "Thumbnail for page 1",
      exact: true,
    }),
  ).toBeVisible();
  await assertPdfPainted(page, ninho.app, testInfo, "small");
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

test("renderiza o conteúdo de PDF grande, além da prévia de um PDF pequeno", async ({
  ninho,
}, testInfo) => {
  const small = path.join(ninho.fixtureDir, "resumo-algoritmos.pdf");
  const large = path.join(ninho.fixtureDir, "aula-completa-12mb.pdf");
  const largeBytes = minimalPdf(12 * 1024 * 1024);
  expect(largeBytes.byteLength).toBeGreaterThan(12 * 1024 * 1024);
  await fs.writeFile(large, largeBytes);
  await ninho.page.getByTestId("nav-materials").click();
  await ninho.openDialog([small, large]);
  await ninho.page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).materials.filter((item) =>
          [path.basename(small), path.basename(large)].includes(item.name),
        ).length,
    )
    .toBe(2);
  for (const [label, file] of [
    ["small-control", small],
    ["large-12mb", large],
  ]) {
    const material = (await ninho.state()).materials.find(
      (item) => item.name === path.basename(file),
    )!;
    await ninho.page
      .getByTestId(`material-row-${material.id}`)
      .getByRole("button", { name: `Abrir ${material.name}`, exact: true })
      .click();
    await assertPdfPainted(ninho.page, ninho.app, testInfo, label);
    await ninho.page
      .getByRole("dialog", { name: material.name, exact: true })
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
  }
  const savedLarge = (await ninho.state()).materials.find(
    (item) => item.name === path.basename(large),
  )!;
  await ninho.restart();
  expect(
    (await ninho.state()).materials.find((item) => item.id === savedLarge.id),
  ).toEqual(savedLarge);
  await ninho.page.getByTestId("nav-materials").click();
  await ninho.page
    .getByTestId(`material-row-${savedLarge.id}`)
    .getByRole("button", { name: `Abrir ${savedLarge.name}`, exact: true })
    .click();
  await assertPdfPainted(
    ninho.page,
    ninho.app,
    testInfo,
    "large-after-restart",
  );
});
