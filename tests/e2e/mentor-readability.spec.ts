import { test, expect } from "./fixtures";

test("explicações da Íris são legíveis em janela compacta e respeitam movimento reduzido", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const doc = document as Document & { ninhoTransitionCalls?: number };
    doc.ninhoTransitionCalls = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (
      ...args: Parameters<Document["startViewTransition"]>
    ) => {
      doc.ninhoTransitionCalls!++;
      return start(...args);
    };
  });
  const window = await ninho.app.browserWindow(page);
  await window.evaluate((window) => window.setSize(1100, 720));
  await page.getByTestId("nav-mentor").click();
  expect(
    await page.evaluate(
      () =>
        (document as Document & { ninhoTransitionCalls: number })
          .ninhoTransitionCalls,
    ),
  ).toBeGreaterThan(0);
  await page.getByTestId("mentor-subject-filter").selectOption("literatura");
  await page.locator(".mentor-subject-footer summary").click();
  await expect(page.locator(".mentor-subject-footer details")).toHaveAttribute(
    "open",
    "",
  );
  const selectors = [
    ".mentor-action-copy small",
    ".mentor-coverage small",
    ".mentor-signals li",
    ".mentor-intro small",
    ".mentor-limits li",
    ".mentor-subject-footer details li",
    ".ai-status",
    ".ai-context small",
    ".ai-composer small",
  ];
  for (const selector of selectors) {
    const elements = page.locator(selector);
    expect(
      await elements.count(),
      `${selector} must exist in the real screen`,
    ).toBeGreaterThan(0);
    const fonts = await elements.evaluateAll((elements) =>
      elements.map((element) => ({
        text: element.textContent?.trim(),
        size: parseFloat(getComputedStyle(element).fontSize),
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      })),
    );
    for (const font of fonts) {
      expect(font.size, `${selector}: ${font.text}`).toBeGreaterThanOrEqual(14);
      expect(
        font.lineHeight,
        `${selector} needs comfortable line spacing`,
      ).toBeGreaterThanOrEqual(font.size * 1.35);
    }
  }
  const layout = await page.evaluate(() => {
    const main = document.querySelector(".main-content")!;
    const panels = Array.from(
      document.querySelector(".mentor-layout")!.children,
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    return { client: main.clientWidth, scroll: main.scrollWidth, panels };
  });
  expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  expect(layout.panels).toHaveLength(3);
  for (let firstIndex = 0; firstIndex < layout.panels.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < layout.panels.length;
      secondIndex++
    ) {
      const first = layout.panels[firstIndex];
      const second = layout.panels[secondIndex];
      const overlapX =
        Math.min(first.right, second.right) - Math.max(first.x, second.x);
      const overlapY =
        Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y);
      expect(
        overlapX <= 1 || overlapY <= 1,
        `Mentor panels ${firstIndex + 1} and ${secondIndex + 1} must not overlap`,
      ).toBe(true);
    }
  }
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-page-transition",
    "true",
  );
  const entrance = await page
    .locator(".page-enter")
    .evaluate((element) =>
      parseFloat(getComputedStyle(element).animationDuration),
    );
  expect(entrance).toBeGreaterThanOrEqual(0.3);
  expect(entrance).toBeLessThanOrEqual(0.6);
  await page
    .locator(".main-content")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("mentor-introducao-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("mentor-introducao-compacto", {
    path: testInfo.outputPath("mentor-introducao-compacto.png"),
    contentType: "image/png",
  });
  await page.locator(".mentor-plan").screenshot({
    path: testInfo.outputPath("mentor-plano-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("mentor-plano-compacto", {
    path: testInfo.outputPath("mentor-plano-compacto.png"),
    contentType: "image/png",
  });
  await page.getByRole("region", {name:"Acompanhamento proativo"}).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("mentor-acompanhamento-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("mentor-acompanhamento-compacto", {
    path: testInfo.outputPath("mentor-acompanhamento-compacto.png"),
    contentType: "image/png",
  });
  await page.locator(".mentor-diagnosis").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("mentor-textos-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("mentor-textos-compacto", {
    path: testInfo.outputPath("mentor-textos-compacto.png"),
    contentType: "image/png",
  });

  await page.getByTestId("nav-settings").click();
  await page.getByRole("checkbox", { name: /Reduzir animações/ }).check();
  await expect
    .poll(async () => (await ninho.state()).settings.reducedMotion)
    .toBe(true);
  const beforeReduced = await page.evaluate(
    () =>
      (document as Document & { ninhoTransitionCalls: number })
        .ninhoTransitionCalls,
  );
  await page.getByTestId("nav-mentor").click();
  expect(
    await page.evaluate(
      () =>
        (document as Document & { ninhoTransitionCalls: number })
          .ninhoTransitionCalls,
    ),
  ).toBe(beforeReduced);
  await expect(page.locator(".page-enter")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".mentor-action").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".owl-float").last()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );

  await page.getByTestId("nav-settings").click();
  await page.getByRole("checkbox", { name: /Reduzir animações/ }).uncheck();
  await expect
    .poll(async () => (await ninho.state()).settings.reducedMotion)
    .toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const beforeSystemReduced = await page.evaluate(
    () =>
      (document as Document & { ninhoTransitionCalls: number })
        .ninhoTransitionCalls,
  );
  await page.getByTestId("nav-mentor").click();
  expect(
    await page.evaluate(
      () =>
        (document as Document & { ninhoTransitionCalls: number })
          .ninhoTransitionCalls,
    ),
  ).toBe(beforeSystemReduced);
  await expect(page.locator(".page-enter")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".mentor-action").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});
