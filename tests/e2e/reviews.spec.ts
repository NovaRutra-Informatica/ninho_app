import { test, expect } from "./fixtures";

test("cartão pode ser criado, consultado, sinalizado, pausado, editado e excluído", async ({
  ninho,
}) => {
  const { page } = ninho;
  await page.getByTestId("nav-reviews").click();
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Guardar um conhecimento" });
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toBeVisible();
  expect(
    await modal
      .getByLabel("Pergunta", { exact: true })
      .evaluate(
        (element) => (element as HTMLTextAreaElement).validity.valueMissing,
      ),
  ).toBe(true);
  const question = "Qual é o papel do DNS? [E2E]";
  const answer =
    'Relacionar nomes a informações de endereçamento. <img src=x onerror="window.__ninhoXss=1">';
  await modal.getByLabel("Pergunta", { exact: true }).fill(question);
  await modal.getByLabel("Resposta", { exact: true }).fill(answer);
  await modal
    .getByLabel("Fonte", { exact: true })
    .fill("Minhas anotações — redes");
  await modal
    .getByLabel("Link da fonte")
    .fill("https://www.rfc-editor.org/rfc/rfc1034");
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const created = (await ninho.state()).cards.find(
    (card) => card.question === question,
  )!;
  expect(created.answer).toBe(answer);
  await page.getByRole("button", { name: /Meu acervo/ }).click();
  await page
    .getByRole("textbox", { name: "Buscar nos cartões…" })
    .fill(question);
  const panel = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: question, exact: true }),
    });
  await panel.getByText("Ver resposta", { exact: true }).click();
  await expect(panel).toContainText(answer);
  expect(
    await page.evaluate(
      () => (window as unknown as { __ninhoXss?: number }).__ninhoXss,
    ),
  ).toBeUndefined();
  await panel
    .getByRole("button", { name: "Conferir conteúdo", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filtrar cartões" })
    .selectOption("outdated");
  await expect(panel).toBeVisible();
  expect(
    (await ninho.state()).cards.find((card) => card.id === created.id)?.flag,
  ).toBe("outdated");
  await panel
    .getByRole("button", { name: "Pausar cartão", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filtrar cartões" })
    .selectOption("suspended");
  await expect(panel).toContainText("Pausado");
  await panel
    .getByRole("button", { name: "Retomar cartão", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filtrar cartões" })
    .selectOption("all");
  await panel
    .getByRole("button", { name: "Editar cartão", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar cartão" });
  await modal
    .getByRole("textbox", { name: "Resposta", exact: true })
    .fill("DNS é um sistema distribuído e hierárquico de nomes.");
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(
    (await ninho.state()).cards.find((card) => card.id === created.id)?.answer,
  ).toBe("DNS é um sistema distribuído e hierárquico de nomes.");
  await panel
    .getByRole("button", { name: "Excluir cartão", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Excluir este cartão?" });
  await modal.getByRole("button", { name: "Cancelar" }).click();
  expect(
    (await ninho.state()).cards.some((card) => card.id === created.id),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Excluir cartão", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir este cartão?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await ninho.state()).cards.some((card) => card.id === created.id),
    )
    .toBe(false);
  await expect(
    page.getByText("Nenhum cartão por aqui.", { exact: true }),
  ).toBeVisible();
});

test("revisar Literatura oferece novos cartões, revela só sob comando e agenda as quatro avaliações", async ({
  ninho,
}) => {
  const { page } = ninho;
  const state = await ninho.state();
  const literature = state.subjects.find(
    (subject) => subject.name === "Literatura",
  )!;
  await page.getByTestId("nav-reviews").click();
  await page
    .getByRole("combobox", { name: "Filtrar matéria" })
    .selectOption(literature.id);
  await expect(
    page.getByRole("heading", { name: "5 conhecimentos esperam por você." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Começar revisão", exact: true })
    .click();
  const ratings = [
    "Não lembrei",
    "Com esforço",
    "Lembrei",
    "Muito fácil",
    "Lembrei",
  ];
  const reviewedIds: string[] = [];
  for (let index = 0; index < ratings.length; index++) {
    const question = await page.getByTestId("card-review-question").innerText();
    const card = (await ninho.state()).cards.find(
      (item) => item.question === question,
    )!;
    expect(card.subjectId).toBe(literature.id);
    expect(reviewedIds).not.toContain(card.id);
    reviewedIds.push(card.id);
    await expect(page.getByTestId("card-review-answer")).toHaveCount(0);
    if (index === 0) {
      await page
        .getByRole("button", { name: "Rever aula", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await ninho.state()).cards.find((item) => item.id === card.id)
              ?.flag,
        )
        .toBe("relearn");
      await page.keyboard.press("Space");
    } else await page.getByRole("button", { name: /Revelar resposta/ }).click();
    await expect(page.getByTestId("card-review-answer")).toHaveText(
      card.answer,
    );
    await page
      .getByRole("button", { name: new RegExp(ratings[index]) })
      .click();
    await expect
      .poll(
        async () =>
          (await ninho.state()).cards.find((item) => item.id === card.id)
            ?.lastReviewedAt,
      )
      .not.toBeNull();
    const after = (await ninho.state()).cards.find(
      (item) => item.id === card.id,
    )!;
    expect(Date.parse(after.dueAt)).toBeGreaterThan(
      Date.parse(after.lastReviewedAt!),
    );
    expect(after.lapses).toBe(index === 0 ? 1 : 0);
  }
  await expect(
    page.getByRole("heading", { name: "5 conhecimentos revisitados." }),
  ).toBeVisible();
  const after = await ninho.state();
  expect(
    after.sessions.filter((session) => session.kind === "review"),
  ).toHaveLength(5);
  await ninho.restart();
  const restored = await ninho.state();
  expect(
    restored.cards.filter((card) => reviewedIds.includes(card.id)),
  ).toEqual(after.cards.filter((card) => reviewedIds.includes(card.id)));
});
