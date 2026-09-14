import { test, expect } from "./fixtures";

test("as áreas abrem sem cortes horizontais e permanecem acessíveis pelo teclado", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  const areas = [
    "today",
    "studies",
    "reviews",
    "materials",
    "agenda",
    "progress",
    "mentor",
    "settings",
  ];
  for (const area of areas) {
    const navigation = page.getByTestId(`nav-${area}`);
    await navigation.click();
    await expect(navigation).toHaveAttribute("aria-current", "page");
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect(main.getByRole("heading").first()).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      layout.content,
      `A área ${area} não deve ultrapassar a largura da janela`,
    ).toBeLessThanOrEqual(layout.width + 1);
    await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
    await testInfo.attach(`area-${area}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  }

  const today = page.getByTestId("nav-today");
  await today.focus();
  await page.keyboard.press("Enter");
  await expect(today).toHaveAttribute("aria-current", "page");
  await page.getByTestId("today-calendar").click();
  await expect(page.getByTestId("nav-agenda")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByTestId("open-focus").click();
  await expect(page.getByTestId("focus-timer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
