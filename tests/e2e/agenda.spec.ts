import { test, expect } from "./fixtures";

test("agenda cria, edita, conclui, reabre e remove provas e tarefas", async ({
  ninho,
}) => {
  const { page } = ninho;
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  await page.getByTestId("nav-agenda").click();
  const originalMonth = await page
    .locator(".calendar")
    .getByRole("heading")
    .textContent();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.locator(".calendar").getByRole("heading")).not.toHaveText(
    originalMonth!,
  );
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.locator(".calendar").getByRole("heading")).toHaveText(
    originalMonth!,
  );
  await page.getByRole("button", { name: "Marcar prova", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Uma prova no horizonte" });
  await modal.getByRole("button", { name: "Salvar prova" }).click();
  await expect(modal).toBeVisible();
  await modal
    .getByLabel("Nome da prova")
    .fill("Prova de Sistemas Distribuídos — E2E");
  await modal.getByLabel("Data", { exact: true }).fill(tomorrow);
  await modal.getByLabel("Horário").fill("18:30");
  await modal
    .getByLabel("Local", { exact: true })
    .fill("Mauá — São Caetano, sala de teste");
  await modal
    .getByLabel("Observações")
    .fill("Revisar consistência, replicação e tolerância a falhas.");
  await modal.getByRole("button", { name: "Salvar prova" }).click();
  await expect(modal).toHaveCount(0);
  let exam = (await ninho.state()).exams.find(
    (item) => item.title === "Prova de Sistemas Distribuídos — E2E",
  )!;
  expect(exam.date).toBe(tomorrow);
  const examPanel = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: exam.title, exact: true }),
    });
  await expect(examPanel).toContainText("18:30");
  await examPanel.getByRole("button", { name: "Editar prova" }).click();
  modal = page.getByRole("dialog", { name: "Editar prova" });
  await modal.getByLabel("Local", { exact: true }).fill("Mauá — sala 101");
  await modal.getByRole("button", { name: "Salvar prova" }).click();
  await expect(examPanel).toContainText("Mauá — sala 101");
  await examPanel
    .getByRole("button", { name: "Concluir prova", exact: true })
    .click();
  await expect(examPanel).toContainText("Concluída");
  await examPanel
    .getByRole("button", { name: "Reabrir prova", exact: true })
    .click();
  await expect(examPanel).not.toContainText("Concluída");
  await page.getByTestId("nav-today").click();
  await expect(page.getByRole("main")).toContainText(exam.title);
  await page.getByTestId("nav-agenda").click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Um passo de cada vez" });
  await modal
    .getByLabel("Tarefa", { exact: true })
    .fill("Resolver 10 questões de Redes — E2E");
  await modal.getByRole("button", { name: "Salvar tarefa" }).click();
  await expect(modal).toHaveCount(0);
  const task = (await ninho.state()).tasks.find(
    (item) => item.title === "Resolver 10 questões de Redes — E2E",
  )!;
  const taskRow = page.locator(".task-row").filter({ hasText: task.title });
  await taskRow
    .getByRole("button", { name: `Concluir tarefa ${task.title}`, exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).tasks.find((item) => item.id === task.id)
          ?.completed,
    )
    .toBe(true);
  await taskRow
    .getByRole("button", { name: `Reabrir tarefa ${task.title}`, exact: true })
    .click();
  await taskRow
    .getByRole("button", { name: "Editar tarefa", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar tarefa" });
  await modal
    .getByLabel("Tarefa", { exact: true })
    .fill("Resolver 15 questões de Redes — E2E");
  await modal.getByRole("button", { name: "Salvar tarefa" }).click();
  await expect(modal).toHaveCount(0);
  const expected = await ninho.state();
  await ninho.restart();
  expect((await ninho.state()).exams).toEqual(expected.exams);
  expect((await ninho.state()).tasks).toEqual(expected.tasks);
  await ninho.page.getByTestId("nav-agenda").click();
  await ninho.page
    .locator(".task-row")
    .filter({ hasText: "Resolver 15 questões de Redes — E2E" })
    .getByRole("button", { name: "Excluir tarefa" })
    .click();
  await ninho.page
    .getByRole("dialog", { name: "Excluir esta tarefa?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await ninho.state()).tasks.some((item) => item.id === task.id),
    )
    .toBe(false);
  exam = expected.exams.find((item) => item.id === exam.id)!;
  await ninho.page
    .getByRole("article")
    .filter({ has: ninho.page.getByRole("heading", { name: exam.title }) })
    .getByRole("button", { name: "Excluir prova" })
    .click();
  await ninho.page
    .getByRole("dialog", { name: "Excluir esta prova?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await ninho.state()).exams.some((item) => item.id === exam.id),
    )
    .toBe(false);
});
