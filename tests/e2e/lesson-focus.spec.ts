import { test, expect, type NinhoTestApp } from "./fixtures";
import type { Lesson, Subject } from "../../src/shared/types";

async function openLesson(
  ninho: NinhoTestApp,
  subject: Subject,
  lesson: Lesson,
) {
  const { page } = ninho;
  await page.getByTestId("nav-studies").click();
  await page.getByTestId(`program-${subject.programId}`).click();
  await page.getByTestId(`subject-${subject.id}`).click();
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await row
    .getByRole("button", { name: `Detalhes de ${lesson.title}`, exact: true })
    .click();
  return row;
}

test("tempo de foco pertence à aula escolhida e a sessão pausada sobrevive ao reinício", async ({
  ninho,
}, testInfo) => {
  test.setTimeout(150_000);
  let { page } = ninho;
  const window = await ninho.app.browserWindow(page);
  await window.evaluate((window) => window.setSize(1100, 720));
  const original = await ninho.state();
  const subject = original.subjects.find((item) => item.id === "literatura")!;
  const lesson = original.lessons.find(
    (item) => item.subjectId === subject.id,
  )!;
  await page.clock.install({ time: new Date(Date.now() - 600_000) });
  await page.reload();
  let row = await openLesson(ninho, subject, lesson);
  await expect(row.getByTestId(`lesson-time-${lesson.id}`)).toContainText(
    "0 s",
  );
  await row.getByTestId(`lesson-focus-${lesson.id}`).click();
  let modal = page.getByRole("dialog", {
    name: "Um tempo só para estudar",
    exact: true,
  });
  await expect(
    modal.getByRole("combobox", { name: "Matéria", exact: true }),
  ).toHaveValue(subject.id);
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toHaveValue(lesson.id);
  await expect(page.getByTestId("focus-lesson")).toContainText(lesson.title);
  const bounds = await modal.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(page.getByTestId("focus-finish")).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("foco-aula-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("foco-aula-compacto", {
    path: testInfo.outputPath("foco-aula-compacto.png"),
    contentType: "image/png",
  });
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(70_000);
  await expect(page.getByTestId("focus-finish")).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("foco-aula-rodando-compacto.png"),
    animations: "disabled",
  });
  await testInfo.attach("foco-aula-rodando-compacto", {
    path: testInfo.outputPath("foco-aula-rodando-compacto.png"),
    contentType: "image/png",
  });
  await page.getByTestId("focus-pause").click();
  await expect(page.getByTestId("focus-finish")).toBeInViewport({ ratio: 1 });
  const paused = await page.getByTestId("focus-timer").textContent();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId("focus-timer")).toHaveText(paused!);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(
    row.getByTestId(`lesson-focus-active-${lesson.id}`),
  ).toContainText(/Pausado/i);
  expect((await ninho.state()).sessions).toHaveLength(0);

  await ninho.restart();
  page = ninho.page;
  await page.clock.install({ time: new Date(Date.now() - 600_000) });
  await page.reload();
  row = await openLesson(ninho, subject, lesson);
  await row.getByTestId(`lesson-focus-${lesson.id}`).click();
  modal = page.getByRole("dialog", {
    name: "Um tempo só para estudar",
    exact: true,
  });
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toHaveValue(lesson.id);
  await expect(page.getByTestId("focus-timer")).toHaveText(paused!);
  const defaultBounds = await modal.boundingBox();
  const defaultViewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(defaultViewport.height).toBeGreaterThan(viewport.height);
  expect(defaultBounds!.x).toBeGreaterThanOrEqual(0);
  expect(defaultBounds!.y).toBeGreaterThanOrEqual(0);
  expect(defaultBounds!.x + defaultBounds!.width).toBeLessThanOrEqual(
    defaultViewport.width + 1,
  );
  expect(defaultBounds!.y + defaultBounds!.height).toBeLessThanOrEqual(
    defaultViewport.height + 1,
  );
  await expect(page.getByTestId("focus-finish")).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("foco-aula-padrao.png"),
    animations: "disabled",
  });
  await testInfo.attach("foco-aula-padrao", {
    path: testInfo.outputPath("foco-aula-padrao.png"),
    contentType: "image/png",
  });
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.clock.runFor(4_000);
  await page.getByTestId("focus-finish").click();
  await expect.poll(async () => (await ninho.state()).sessions.length).toBe(1);
  const [session] = (await ninho.state()).sessions;
  expect(session).toMatchObject({
    kind: "focus",
    subjectId: subject.id,
    lessonId: lesson.id,
  });
  expect(session.durationMinutes * 60).toBeGreaterThanOrEqual(74);
  expect(session.durationMinutes * 60).toBeLessThan(115);
  await expect(modal).toContainText("Respire. Alongue. Beba água.");
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(3_000);
  await page.getByTestId("focus-finish").click();
  expect((await ninho.state()).sessions).toEqual([session]);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(row.getByTestId(`lesson-time-${lesson.id}`)).toContainText(
    /1 sess/,
  );
  await expect(row.getByTestId(`lesson-time-${lesson.id}`)).toContainText(
    /1 min/,
  );
  expect(
    (await ninho.state()).lessons.find((item) => item.id === lesson.id)?.status,
  ).toBe(lesson.status);
  await page.screenshot({
    path: testInfo.outputPath("tempo-por-aula.png"),
    animations: "disabled",
  });
  await testInfo.attach("tempo-por-aula", {
    path: testInfo.outputPath("tempo-por-aula.png"),
    contentType: "image/png",
  });
  await ninho.restart();
  expect((await ninho.state()).sessions).toEqual([session]);
  row = await openLesson(ninho, subject, lesson);
  await expect(row.getByTestId(`lesson-time-${lesson.id}`)).toContainText(
    /1 sess/,
  );
});

test("trocar de aula com tempo em andamento preserva o vínculo até concluir ou reiniciar", async ({
  ninho,
}) => {
  const { page } = ninho;
  const original = await ninho.state();
  const subject = original.subjects.find((item) => item.id === "literatura")!;
  const [first, second] = original.lessons.filter(
    (item) => item.subjectId === subject.id,
  );
  await page.clock.install({ time: new Date(Date.now() - 600_000) });
  await page.reload();
  const firstRow = await openLesson(ninho, subject, first);
  await firstRow.getByTestId(`lesson-focus-${first.id}`).click();
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(6_000);
  await page.getByTestId("focus-pause").click();
  const paused = await page.getByTestId("focus-timer").textContent();
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  const secondRow = page.getByTestId(`lesson-row-${second.id}`);
  await secondRow
    .getByRole("button", { name: `Detalhes de ${second.title}`, exact: true })
    .click();
  await secondRow.getByTestId(`lesson-focus-${second.id}`).click();
  const modal = page.getByRole("dialog", {
    name: "Um tempo só para estudar",
    exact: true,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Conclua ou reinicie" }),
  ).toBeVisible();
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toHaveValue(first.id);
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toBeDisabled();
  await expect(
    modal.getByRole("combobox", { name: "Matéria", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("focus-timer")).toHaveText(paused!);
  expect((await ninho.state()).sessions).toHaveLength(0);
  await page.getByTestId("focus-reset").click();
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await secondRow.getByTestId(`lesson-focus-${second.id}`).click();
  await expect(
    modal.getByRole("combobox", { name: "Aula", exact: true }),
  ).toHaveValue(second.id);
  await page.getByTestId("focus-start").click();
  await page.clock.runFor(11_000);
  await page.getByTestId("focus-finish").click();
  await expect.poll(async () => (await ninho.state()).sessions.length).toBe(1);
  const [session] = (await ninho.state()).sessions;
  expect(session).toMatchObject({
    lessonId: second.id,
    subjectId: subject.id,
    kind: "focus",
  });
  expect(session.durationMinutes).toBeGreaterThan(0);
  expect(session.durationMinutes).toBeLessThan(1);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(firstRow.getByTestId(`lesson-time-${first.id}`)).toContainText(
    "0 s",
  );
  await expect(secondRow.getByTestId(`lesson-time-${second.id}`)).toContainText(
    /1 sess/,
  );
  expect(
    (await ninho.state()).lessons.find((item) => item.id === first.id)?.status,
  ).toBe(first.status);
  expect(
    (await ninho.state()).lessons.find((item) => item.id === second.id)?.status,
  ).toBe(second.status);
});
