import {
  test as base,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { AppState } from "../../src/shared/types";

export const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const runRoot = path.join(os.tmpdir(), "Ninho-E2E");

export interface NinhoTestApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  fixtureDir: string;
  backupPath: string;
  state(): Promise<AppState>;
  openDialog(paths: string[], canceled?: boolean): Promise<void>;
  saveDialog(filePath: string, canceled?: boolean): Promise<void>;
  confirmDialog(response?: number): Promise<void>;
  restart(): Promise<void>;
}

export function minimalPdf(paddingBytes = 0): Buffer {
  // Colored vectors distinguish PDF page paint from viewer controls and thumbnails.
  const contents =
    "BT /F1 18 Tf 50 760 Td (Ninho - Material de teste) Tj ET\n" +
    "q 1 0 0.6 rg 50 660 120 60 re f Q\n" +
    "q 0 0.8 1 rg 200 660 120 60 re f Q\n" +
    "% Synthetic PDF padding, part of the declared content stream.\n" +
    (paddingBytes
      ? ("%" + "x".repeat(78) + "\n").repeat(Math.ceil(paddingBytes / 80))
      : "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contents)} >>\nstream\n${contents}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output);
}

type ProfileOptions = {
  initialState: unknown | undefined;
  initialMaterials: { storedName: string; content: string | Uint8Array }[];
  profilePathStyle: "normal" | "junction-mixed-case" | "roaming-overlay";
};

export const test = base.extend<{ ninho: NinhoTestApp } & ProfileOptions>({
  initialState: [undefined, { option: true }],
  initialMaterials: [[], { option: true }],
  profilePathStyle: ["normal", { option: true }],
  ninho: async (
    { initialState, initialMaterials, profilePathStyle },
    use,
    testInfo,
  ) => {
    if (profilePathStyle === "roaming-overlay" && !process.env.APPDATA)
      throw new Error("APPDATA is required for the Windows overlay fixture");
    const fixtureRoot =
      profilePathStyle === "roaming-overlay"
        ? path.join(process.env.APPDATA!, "Ninho-QA-E2E-Overlay")
        : runRoot;
    await fs.mkdir(fixtureRoot, { recursive: true });
    const testRoot = await fs.mkdtemp(path.join(fixtureRoot, "profile-"));
    let dataDir = path.join(testRoot, "data");
    let junction: string | undefined;
    if (profilePathStyle === "junction-mixed-case") {
      const physical = path.join(testRoot, "PhysicalProfile");
      junction = path.join(testRoot, "ProfileAlias");
      await fs.mkdir(path.join(physical, "Data"), { recursive: true });
      await fs.symlink(physical, junction, "junction");
      dataDir = path.join(junction.toUpperCase(), "dAtA");
    }
    const fixtureDir = path.join(testRoot, "imports");
    await fs.mkdir(fixtureDir, { recursive: true });
    if (initialState !== undefined) {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(
        path.join(dataDir, "state.json"),
        JSON.stringify(initialState),
      );
    }
    for (const material of initialMaterials) {
      if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(material.storedName))
        throw new Error("Unsafe synthetic material filename");
      const materialsDir = path.join(dataDir, "materials");
      await fs.mkdir(materialsDir, { recursive: true });
      await fs.writeFile(
        path.join(materialsDir, material.storedName),
        material.content,
      );
    }
    await fs.writeFile(
      path.join(fixtureDir, "revisao-redes.txt"),
      "Revisão de redes\nDNS traduz nomes de domínio em informações de endereçamento.\nArquivo de teste sem dados pessoais.\n",
    );
    await fs.writeFile(
      path.join(fixtureDir, "resumo-algoritmos.pdf"),
      minimalPdf(),
    );
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env))
      if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE")
        env[key] = value;
    delete env.NINHO_DEV_URL;
    env.NINHO_DATA_DIR = dataDir;
    env.NINHO_E2E = "1";
    let app = await _electron.launch({
      args: [path.join(projectDir, "tests", "e2e", "bootstrap.cjs")],
      cwd: projectDir,
      env,
      timeout: 30_000,
    });
    const errors: string[] = [];
    let page: Page | undefined;
    try {
      page = await app.firstWindow();
      let windowPage = page;
      page.on("pageerror", (error) => errors.push(error.message));
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByTestId("nav-today")).toBeVisible();
      const paths = await page.evaluate(() => window.ninho!.getPaths());
      expect(path.resolve(paths.data).toLowerCase()).toBe(
        path.resolve(dataDir).toLowerCase(),
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
      const homeScreenshot = testInfo.outputPath("hoje-inicial.png");
      await page.screenshot({ path: homeScreenshot, animations: "disabled" });
      await testInfo.attach("hoje-inicial", {
        path: homeScreenshot,
        contentType: "image/png",
      });
      const ninho: NinhoTestApp = {
        app,
        page,
        dataDir,
        fixtureDir,
        backupPath: path.join(testRoot, "ninho-backup.zip"),
        state: () => windowPage.evaluate(() => window.ninho!.load()),
        openDialog: async (filePaths, canceled = false) => {
          await app.evaluate(
            ({ dialog }, value) => {
              dialog.showOpenDialog = (async () =>
                value) as typeof dialog.showOpenDialog;
            },
            { canceled, filePaths },
          );
        },
        saveDialog: async (filePath, canceled = false) => {
          await app.evaluate(
            ({ dialog }, value) => {
              dialog.showSaveDialog = (async () =>
                value) as typeof dialog.showSaveDialog;
            },
            { canceled, filePath },
          );
        },
        confirmDialog: async (response = 0) => {
          await app.evaluate(({ dialog }, value) => {
            dialog.showMessageBox = (async () => ({
              response: value,
              checkboxChecked: false,
            })) as typeof dialog.showMessageBox;
          }, response);
        },
        restart: async () => {
          await app.close();
          app = await _electron.launch({
            args: [path.join(projectDir, "tests", "e2e", "bootstrap.cjs")],
            cwd: projectDir,
            env,
            timeout: 30_000,
          });
          windowPage = page = await app.firstWindow();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.waitForLoadState("domcontentloaded");
          await expect(page.getByTestId("nav-today")).toBeVisible();
          ninho.app = app;
          ninho.page = page;
        },
      };
      await use(ninho);
      expect(
        errors,
        "O renderer não deve produzir exceções não tratadas",
      ).toEqual([]);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await page
          ?.screenshot({
            path: testInfo.outputPath("failure.png"),
            fullPage: true,
          })
          .catch(() => {});
        await testInfo.attach("renderer-errors", {
          body: errors.join("\n"),
          contentType: "text/plain",
        });
      }
      await app.close();
      // Refuse any recursive cleanup outside the dedicated temporary test root.
      const resolvedRoot = await fs.realpath(fixtureRoot);
      const resolvedTest = await fs.realpath(testRoot);
      const relative = path.relative(resolvedRoot, resolvedTest);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Unsafe E2E cleanup path");
      if (junction) {
        const target = await fs.realpath(junction);
        const inside = path.relative(resolvedTest, target);
        if (
          inside.startsWith("..") ||
          path.isAbsolute(inside) ||
          !(await fs.lstat(junction)).isSymbolicLink()
        )
          throw new Error("Unsafe QA junction cleanup");
        await fs.rmdir(junction);
      }
      await fs.rm(resolvedTest, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  },
});

export { expect };
