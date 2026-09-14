import { test, expect } from "./fixtures";

test("o aplicativo abre localmente com catálogo completo e uma ponte nativa restrita", async ({
  ninho,
}) => {
  const { page, app } = ninho;
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
