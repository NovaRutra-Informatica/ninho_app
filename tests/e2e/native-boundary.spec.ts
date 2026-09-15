import path from "node:path";
import { writeFile } from "node:fs/promises";
import { test, expect, projectDir } from "./fixtures";

test("o aplicativo abre localmente com catálogo completo e uma ponte nativa restrita", async ({
  ninho,
}, testInfo) => {
  const { page, app } = ninho;
  const runtime = await app.evaluate(() => ({
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
  }));
  await writeFile(
    testInfo.outputPath("runtime.json"),
    JSON.stringify(runtime, null, 2),
  );
  await testInfo.attach("runtime", {
    body: JSON.stringify(runtime),
    contentType: "application/json",
  });
  expect(runtime.electron).toBe("44.3.0");
  expect(runtime.chromium).toBe("152.0.7977.78");
  expect(page.url()).toMatch(/^file:\/\//);
  const bridge = await page.evaluate(() => ({
    methods: Object.keys(window.ninho ?? {}).sort(),
    requireType: typeof (window as unknown as { require?: unknown }).require,
    processType: typeof (window as unknown as { process?: unknown }).process,
  }));
  expect(bridge.methods).toEqual(
    [
      "aiStatus",
      "aiChat",
      "aiCancel",
      "aiUnload",
      "dispatch",
      "exportBackup",
      "getPaths",
      "importMaterials",
      "load",
      "openExternal",
      "openMaterial",
      "previewMaterial",
      "restoreBackup",
    ].sort(),
  );
  expect(bridge.requireType).toBe("undefined");
  expect(bridge.processType).toBe("undefined");
  const browserWindow = await app.browserWindow(page);
  const preferences = await browserWindow.evaluate((win) =>
    win.webContents.getLastWebPreferences(),
  );
  expect(preferences.contextIsolation).toBe(true);
  expect(preferences.nodeIntegration).toBe(false);
  expect(preferences.sandbox).toBe(true);
  expect(preferences.nodeIntegrationInWorker).toBe(false);
  expect(preferences.webviewTag).toBe(false);
  expect(preferences.webSecurity).toBe(true);

  const state = await ninho.state();
  expect(state.version).toBe(2);
  expect(state.programs.map((program) => program.id)).toEqual([
    "senado-federal",
    "maua",
  ]);
  expect(state.courses).toHaveLength(20);
  expect(state.lessons).toHaveLength(271);
  expect(new Set(state.lessons.map((lesson) => lesson.id)).size).toBe(271);
  expect(state.subjects.map((subject) => subject.name)).toEqual(
    expect.arrayContaining([
      "Banco de dados",
      "Direito Administrativo",
      "Direito Constitucional",
      "Inglês",
      "Literatura",
    ]),
  );
  expect(
    state.lessons.filter((lesson) => lesson.status === "done"),
  ).toHaveLength(0);
  expect(state.sessions).toHaveLength(0);
  expect(state.cards.length).toBeGreaterThan(0);
  expect(
    state.cards.every(
      (card) => card.repetitions === 0 && card.lastReviewedAt === null,
    ),
  ).toBe(true);
});

test("outra janela não recebe dados pelo IPC mesmo usando o documento e preload do Ninho", async ({
  ninho,
}) => {
  const result = await ninho.app.evaluate(
    async ({ BrowserWindow }, preload) => {
      const original = BrowserWindow.getAllWindows()[0];
      const secondary = new BrowserWindow({
        show: false,
        webPreferences: {
          preload,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      try {
        await secondary.loadURL(original.webContents.getURL());
        return await secondary.webContents.executeJavaScript(
          `window.ninho.load().then(() => "UNEXPECTED_SUCCESS", error => error.message)`,
        );
      } finally {
        secondary.destroy();
      }
    },
    path.join(projectDir, "dist-electron", "preload.cjs"),
  );
  expect(result).toContain("Esta página não tem acesso aos seus dados.");
  await expect(ninho.page.getByTestId("nav-today")).toBeVisible();
});

test("IPC rejeita comandos desconhecidos e links executáveis sem alterar o perfil", async ({
  ninho,
}) => {
  const { page } = ninho;
  const before = await ninho.state();
  const errors = await page.evaluate(async () => {
    const results: string[] = [];
    const operations = [
      () =>
        window.ninho!.dispatch({
          type: "execute-shell",
          command: "invalid",
        } as never),
      () => window.ninho!.openExternal("javascript:alert(1)"),
      () => window.ninho!.openExternal("file:///C:/Windows/System32/cmd.exe"),
      () => window.ninho!.previewMaterial("../../not-a-material"),
    ];
    for (const operation of operations) {
      try {
        await operation();
        results.push("UNEXPECTED_SUCCESS");
      } catch (error) {
        results.push(String(error));
      }
    }
    return results;
  });
  expect(errors).toHaveLength(4);
  for (const error of errors) {
    expect(error).not.toBe("UNEXPECTED_SUCCESS");
    expect(error.length).toBeGreaterThan(8);
  }
  expect(await ninho.state()).toEqual(before);
});

test("a integração envia ao navegador o link real do curso e não modifica seu progresso", async ({
  ninho,
}) => {
  const before = await ninho.state();
  const course = before.courses.find((item) =>
    item.url.includes("estrategiaconcursos.com.br"),
  )!;
  expect(course).toBeDefined();
  await ninho.app.evaluate(({ shell }) => {
    const context = globalThis as typeof globalThis & {
      openedNinhoUrls?: string[];
    };
    context.openedNinhoUrls = [];
    shell.openExternal = async (url) => {
      context.openedNinhoUrls!.push(url);
    };
  });
  await ninho.page.evaluate(
    (url) => window.ninho!.openExternal(url),
    course.url,
  );
  const opened = await ninho.app.evaluate(
    () =>
      (globalThis as typeof globalThis & { openedNinhoUrls?: string[] })
        .openedNinhoUrls,
  );
  expect(opened).toEqual([course.url]);
  expect(await ninho.state()).toEqual(before);
});
