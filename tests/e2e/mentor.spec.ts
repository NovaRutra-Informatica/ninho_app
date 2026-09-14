import { test, expect } from "./fixtures";

test("Íris distingue falta de histórico, responde no contexto e não inventa progresso", async ({
  ninho,
}) => {
  const { page } = ninho;
  const before = await ninho.state();
  const literature = before.subjects.find(
    (subject) => subject.name === "Literatura",
  )!;
  await page.getByTestId("nav-mentor").click();
  await expect(
    page.getByRole("heading", { name: "Seu próximo passo, com a Íris." }),
  ).toBeVisible();
  const insight = page.getByTestId(`mentor-insight-${literature.id}`);
  await expect(insight).toContainText("Ainda sem evidência");
  await expect(insight).toContainText("Isso não mede domínio da matéria.");
  await expect(
    page.getByRole("button", { name: "Enviar pergunta à Íris" }),
  ).toBeDisabled();
  await page.getByLabel("Pergunte à Íris").fill("   ");
  await expect(
    page.getByRole("button", { name: "Enviar pergunta à Íris" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "O que estudar hoje?", exact: true })
    .click();
  const log = page.getByRole("log", { name: "Conversa com a Íris" });
  await expect(log.getByRole("article")).toHaveCount(3);
  await expect(log).toContainText("O que estudar hoje?");
  expect(await ninho.state()).toEqual(before);
  await page.getByTestId("mentor-subject-filter").selectOption(literature.id);
  await page
    .getByLabel("Pergunte à Íris")
    .fill("Onde preciso melhorar em Literatura?");
  await page.getByLabel("Pergunte à Íris").press("Enter");
  await expect(log.getByRole("article")).toHaveCount(5);
  await expect(log.getByRole("article").last()).toContainText("Literatura");
  await expect(page.getByLabel("Pergunte à Íris")).toHaveValue("");
  await page
    .getByRole("button", { name: "Limpar conversa com a Íris" })
    .click();
  await expect(log.getByRole("article")).toHaveCount(1);
  await expect(page.getByLabel("Pergunte à Íris")).toBeFocused();
  await page
    .getByRole("combobox", { name: "Filtrar sinais do estudo" })
    .selectOption("outdated");
  await expect(
    page.getByText("Nenhuma matéria com esse sinal.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver todos os sinais", exact: true })
    .click();
  await expect(insight).toBeVisible();
  expect(await ninho.state()).toEqual(before);
});

test("uma fonte sinalizada vira atenção explicada e abre as revisões da matéria correta", async ({
  ninho,
}) => {
  const { page } = ninho;
  const initial = await ninho.state();
  const literature = initial.subjects.find(
    (subject) => subject.name === "Literatura",
  )!;
  const card = initial.cards.find((item) => item.subjectId === literature.id)!;
  await page.getByTestId("nav-reviews").click();
  await page.getByRole("button", { name: /Meu acervo/ }).click();
  await page
    .getByRole("textbox", { name: "Buscar nos cartões…" })
    .fill(card.question);
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: card.question, exact: true }),
    })
    .getByRole("button", { name: "Conferir conteúdo", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).cards.find((item) => item.id === card.id)?.flag,
    )
    .toBe("outdated");
  await page.getByTestId("nav-mentor").click();
  await page.getByTestId("mentor-subject-filter").selectOption(literature.id);
  const insight = page.getByTestId(`mentor-insight-${literature.id}`);
  await expect(insight).toContainText("Conferir fonte");
  await page
    .getByRole("button", {
      name: "O que pode estar desatualizado?",
      exact: true,
    })
    .click();
  const reply = page
    .getByRole("log", { name: "Conversa com a Íris" })
    .getByRole("article")
    .last();
  await expect(reply).toContainText(/fonte|marcad|sinaliz/i);
  const snapshot = await ninho.state();
  await insight
    .getByRole("button", { name: "Abrir revisões de Literatura", exact: true })
    .click();
  await expect(page.getByTestId("nav-reviews")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("combobox", { name: "Filtrar matéria" }),
  ).toHaveValue(literature.id);
  await expect(
    page.getByRole("combobox", { name: "Filtrar cartões" }),
  ).toHaveValue("outdated");
  await expect(page.getByTestId(`card-library-${card.id}`)).toContainText(
    card.question,
  );
  expect(await ninho.state()).toEqual(snapshot);
});

test("plano da Íris abre a aula indicada e se atualiza depois de uma conclusão", async ({
  ninho,
}) => {
  const { page } = ninho;
  const initial = await ninho.state();
  const literature = initial.subjects.find(
    (subject) => subject.name === "Literatura",
  )!;
  await page.getByTestId("nav-mentor").click();
  await page.getByTestId("mentor-subject-filter").selectOption(literature.id);
  const lessonAction = page
    .locator('[data-testid^="mentor-plan-lesson:"]')
    .first();
  await expect(lessonAction).toBeVisible();
  const actionId = await lessonAction.getAttribute("data-testid");
  const lessonId = actionId!.slice("mentor-plan-lesson:".length);
  const lesson = initial.lessons.find((item) => item.id === lessonId)!;
  expect(lesson.subjectId).toBe(literature.id);
  await lessonAction.click();
  await expect(page.getByTestId("nav-studies")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await expect(row).toBeInViewport();
  await expect(row.getByTestId(`lesson-notes-${lesson.id}`)).toBeVisible();
  await row.getByTestId(`lesson-status-${lesson.id}`).click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.status,
    )
    .toBe("done");
  await page.getByTestId("nav-mentor").click();
  await page.getByTestId("mentor-subject-filter").selectOption(literature.id);
  await expect(page.getByTestId(actionId!)).toHaveCount(0);
  await expect(
    page.getByTestId(`mentor-insight-${literature.id}`),
  ).toContainText(
    `1/${initial.lessons.filter((item) => item.subjectId === literature.id).length} aulas concluídas`,
  );
});
