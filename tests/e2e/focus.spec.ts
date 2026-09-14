import { test, expect } from "./fixtures";

test("foco inicia, pausa, retoma, reinicia e registra uma sessão real sem duplicação", async ({
  ninho,
}) => {
  const { page } = ninho;
  await page.getByTestId("nav-today").click();
  // Keep virtual completion in the past of the main process's real clock.
  await page.clock.install({ time: new Date(Date.now() - 180_000) });
  await page.reload();
  await page.getByTestId("open-focus").click();
  const timer = page.getByTestId("focus-timer");
  const initial = await timer.textContent();

  await page.getByTestId("focus-start").click();
  await page.clock.runFor(3_000);
  await expect(timer).not.toHaveText(initial!);
  await page.getByTestId("focus-pause").click();
  const paused = await timer.textContent();
  await page.clock.runFor(8_000);
  await expect(timer).toHaveText(paused!);

  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.clock.runFor(3_000);
  await expect(timer).not.toHaveText(paused!);
  await page.getByTestId("focus-reset").click();
  await expect(timer).toHaveText(initial!);
  expect((await ninho.state()).sessions).toHaveLength(0);

  await page.getByTestId("focus-start").click();
  await page.clock.runFor(61_000);
  await page.getByTestId("focus-finish").click();
  await expect.poll(async () => (await ninho.state()).sessions.length).toBe(1);
  const [session] = (await ninho.state()).sessions;
  expect(session.kind).toBe("focus");
  expect(session.durationMinutes).toBeGreaterThanOrEqual(1);
  expect(session.durationMinutes).toBeLessThanOrEqual(2);
  await expect(page.getByRole("dialog")).toContainText(
    "Respire. Alongue. Beba água.",
  );
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(2_000);
  await page.getByTestId("focus-finish").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Presente, um minuto de cada vez.",
  );
  expect((await ninho.state()).sessions).toHaveLength(1);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await page.getByTestId("nav-progress").click();
  await expect(page.getByRole("main")).toContainText(/min/i);

  await ninho.restart();
  expect((await ninho.state()).sessions).toEqual([session]);
});

test("ao chegar a zero o foco é registrado uma vez e oferece uma pausa", async ({
  ninho,
}) => {
  const { page } = ninho;
  await page.getByTestId("nav-settings").click();
  await page.getByLabel("Tempo de foco (minutos)").fill("1");
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.focusMinutes)
    .toBe(1);
  await page.clock.install({ time: new Date(Date.now() - 180_000) });
  await page.reload();
  await page.getByTestId("open-focus").click();
  await page.getByTestId("focus-reset").click();
  await expect(page.getByTestId("focus-timer")).toHaveText("01:00");
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(61_000);
  await expect.poll(async () => (await ninho.state()).sessions.length).toBe(1);
  await expect(page.getByRole("dialog")).toContainText(
    "Respire. Alongue. Beba água.",
  );
  await page.clock.runFor(5_000);
  const sessions = (await ninho.state()).sessions;
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ kind: "focus", durationMinutes: 1 });
});
