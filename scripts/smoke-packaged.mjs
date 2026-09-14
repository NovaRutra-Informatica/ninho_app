import { _electron } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const project = path.resolve(import.meta.dirname, "..");
const root = path.join(os.tmpdir(), "Ninho-Packaged-QA");
await fs.mkdir(root, { recursive: true });
const profile = await fs.mkdtemp(path.join(root, "profile-"));
const artifacts = path.join(project, "test-results", "packaged");
await fs.mkdir(artifacts, { recursive: true });
const executablePath = path.join(
  project,
  "release",
  "win-unpacked",
  "Ninho.exe",
);
const env = { ...process.env, NINHO_E2E: "1", NINHO_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NINHO_DEV_URL;
let app;
const errors = [];
const result = {
  executablePath,
  passed: false,
  pages: [],
  capturedAt: new Date().toISOString(),
  errors,
};
const launch = async () => {
  app = await _electron.launch({ executablePath, env, timeout: 30000 });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByTestId("nav-today").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
};
try {
  let page = await launch();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  let state = await page.evaluate(() => window.ninho.load());
  assert.equal(state.lessons.length, 271);
  assert.equal(state.cards.length, 71);
  assert.equal(state.sessions.length, 0);
  for (const area of [
    "today",
    "studies",
    "reviews",
    "materials",
    "agenda",
    "progress",
    "mentor",
    "settings",
  ]) {
    await page.getByTestId(`nav-${area}`).click();
    await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
    await page.screenshot({
      path: path.join(artifacts, `${area}-light.png`),
      animations: "disabled",
      scale: "css",
    });
    const overflow = await page.evaluate(
      () =>
        document.querySelector(".main-content").scrollWidth >
        document.querySelector(".main-content").clientWidth + 1,
    );
    assert.equal(overflow, false, `${area}: horizontal overflow`);
    result.pages.push(area);
  }
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await page.getByTestId("nav-today").click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement).backgroundColor ===
        "rgb(23, 36, 31)" &&
      getComputedStyle(document.documentElement).color === "rgb(230, 237, 223)",
  );
  await page.screenshot({
    path: path.join(artifacts, "today-dark.png"),
    animations: "disabled",
    scale: "css",
  });
  await page.getByTestId("nav-mentor").click();
  await page
    .getByRole("button", { name: "O que estudar hoje?", exact: true })
    .click();
  await page.screenshot({
    path: path.join(artifacts, "mentor-dark.png"),
    animations: "disabled",
    scale: "css",
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1100, 720),
  );
  for (const area of ["today", "agenda", "mentor", "settings"]) {
    await page.getByTestId(`nav-${area}`).click();
    await page.screenshot({
      path: path.join(artifacts, `${area}-compact.png`),
      animations: "disabled",
      scale: "css",
    });
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(".main-content").scrollWidth >
          document.querySelector(".main-content").clientWidth + 1,
      ),
      false,
      `${area} compact overflow`,
    );
  }
  await app.close();
  app = undefined;
  page = await launch();
  state = await page.evaluate(() => window.ninho.load());
  assert.equal(state.settings.theme, "dark");
  assert.equal(state.sessions.length, 0);
  assert.equal(state.exams.length, 0);
  assert.equal(errors.length, 0);
  result.passed = true;
  console.log(
    "Packaged app: 8 pages, light/dark, minimum window and persistence passed.",
  );
} finally {
  if (app) await app.close();
  await fs.writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(result, null, 2),
  );
  const relative = path.relative(
    await fs.realpath(root),
    await fs.realpath(profile),
  );
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Unsafe QA cleanup path");
  await fs.rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
