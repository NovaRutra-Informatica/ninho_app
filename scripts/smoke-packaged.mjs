import { _electron, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const project = path.resolve(import.meta.dirname, "..");
const expectedVersion = JSON.parse(
  await fs.readFile(path.join(project, "package.json"), "utf8"),
).version;
const root = path.join(os.tmpdir(), "Ninho-Packaged-QA");
await fs.mkdir(root, { recursive: true });
const profile = await fs.mkdtemp(path.join(root, "profile-"));
const artifacts = path.join(project, "test-results", "packaged");
await fs.mkdir(artifacts, { recursive: true });
const executablePath =
  process.env.NINHO_SMOKE_EXE ||
  path.join(project, "release", "win-unpacked", "Ninho.exe");
const env = {
  ...process.env,
  NINHO_E2E: "1",
  NINHO_E2E_VISIBLE: "1",
  NINHO_DATA_DIR: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NINHO_DEV_URL;
let app;
const errors = [];
const result = {
  executablePath,
  expectedVersion,
  passed: false,
  functionalPassed: false,
  appearancePassed: false,
  pages: [],
  launches: [],
  captures: [],
  captureErrors: [],
  capturedAt: new Date().toISOString(),
  errors,
};
const launch = async () => {
  app = await _electron.launch({ executablePath, env, timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.setBackgroundThrottling(false);
      window.setTitle("Ninho — Teste automático");
      window.showInactive();
    }
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("nav-today").waitFor();
  const paths = await page.evaluate(() => window.ninho.getPaths());
  assert.equal(
    path.resolve(paths.data).toLowerCase(),
    path.resolve(profile).toLowerCase(),
    "Smoke must use only its temporary profile",
  );
  result.launches.push({ pid: app.process().pid, dataDirectory: paths.data });
  await page.evaluate(() => {
    const stats = { started: 0, ready: 0, finished: 0, skipped: 0 };
    window.ninhoSmokeTransitions = stats;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      const transition = start(...args);
      stats.started++;
      transition.ready.then(
        () => stats.ready++,
        () => stats.skipped++,
      );
      transition.finished.then(
        () => stats.finished++,
        () => stats.finished++,
      );
      return transition;
    };
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
  return page;
};
const capture = async (page, filename) => {
  // CDP screenshots can stall after DOM checks; capture with BrowserWindow instead.
  try {
    await page.waitForFunction(
      () => !document.documentElement.dataset.pageTransition,
    );
    await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations === Infinity)
          animation.pause();
        else animation.finish();
      }
    });
    await page.evaluate(async () => {
      document
        .querySelector(".main-content")
        .scrollTo({ top: 0, behavior: "instant" });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const window = await app.browserWindow(page);
    const image = await window.evaluate(async (window) => {
      let timer;
      try {
        const image = await Promise.race([
          window.capturePage(undefined, { stayAwake: true }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(new Error("Native capture timed out after 10 seconds")),
              10000,
            );
          }),
        ]);
        if (image.isEmpty())
          throw new Error("Native capture returned an empty image");
        const size = image.getSize();
        // Exclude sidebar/toast so an empty page cannot pass the paint check.
        const bitmap = image
          .crop({
            x: Math.floor(size.width * 0.2),
            y: 0,
            width: Math.floor(size.width * 0.8),
            height: Math.floor(size.height * 0.8),
          })
          .toBitmap();
        const colors = new Set();
        const stride = Math.max(4, Math.floor(bitmap.length / 4096 / 4) * 4);
        for (let offset = 0; offset + 3 < bitmap.length; offset += stride)
          colors.add(bitmap.readUInt32LE(offset));
        return {
          size,
          colors: colors.size,
          png: image.toPNG().toString("base64"),
        };
      } finally {
        clearTimeout(timer);
      }
    });
    assert.ok(
      image.size.width >= 1000 && image.size.height >= 600,
      "Capture has usable dimensions",
    );
    assert.ok(
      image.colors > 12,
      "Capture contains rendered content rather than a blank frame",
    );
    const file = path.join(artifacts, filename);
    await fs.writeFile(file, Buffer.from(image.png, "base64"));
    result.captures.push({
      filename,
      method: "BrowserWindow.capturePage",
      width: image.size.width,
      height: image.size.height,
      sampledColors: image.colors,
    });
  } catch (failure) {
    result.captureErrors.push({ filename, message: String(failure) });
    console.warn(`Capture ${filename}: ${failure.message}`);
  }
};
try {
  let page = await launch();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  result.version = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(
    result.version,
    expectedVersion,
    "Installed version must match the project version",
  );
  let state = await page.evaluate(() => window.ninho.load());
  assert.equal(state.lessons.length, 271);
  assert.equal(state.cards.length, 71);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.version, 2);
  assert.equal(state.programs.length, 2);
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
    await expect(page.getByTestId(`nav-${area}`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
    await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
    await capture(page, `${area}-light.png`);
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
  await capture(page, "today-dark.png");
  await page.getByTestId("nav-mentor").click();
  await page.getByTestId("ai-chat").waitFor();
  await capture(page, "mentor-dark.png");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1100, 720),
  );
  for (const area of ["today", "agenda", "mentor", "settings"]) {
    await page.getByTestId(`nav-${area}`).click();
    await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
    await capture(page, `${area}-compact.png`);
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
  await page.waitForFunction(
    () => !document.documentElement.dataset.pageTransition,
  );
  result.transitions = await page.evaluate(() => window.ninhoSmokeTransitions);
  assert.ok(
    result.transitions.started > 0,
    "Navigation invokes native View Transitions",
  );
  assert.ok(
    result.transitions.ready > 0,
    "At least one real visible transition produced its snapshots",
  );
  assert.equal(
    result.transitions.finished,
    result.transitions.started,
    "All native transitions finish and release their marker",
  );
  await app.close();
  app = undefined;
  page = await launch();
  state = await page.evaluate(() => window.ninho.load());
  assert.equal(state.settings.theme, "dark");
  assert.equal(state.sessions.length, 0);
  assert.equal(state.exams.length, 0);
  assert.equal(errors.length, 0);
  result.functionalPassed = true;
  result.appearancePassed =
    result.captures.length === 14 && result.captureErrors.length === 0;
  result.passed = result.functionalPassed && result.appearancePassed;
  if (!result.passed) process.exitCode = 1;
  console.log(
    `Packaged app: navigation, themes, minimum window and restart persistence passed; ${result.captures.length}/14 native captures.`,
  );
} catch (failure) {
  result.failure = { message: String(failure), stack: failure.stack };
  throw failure;
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
