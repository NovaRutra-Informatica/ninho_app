import { test, expect } from "./fixtures";

test("organiza Senado e Mauá separadamente e cria um curso pessoal com matéria editável", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  const original = await ninho.state();
  const senateSubject = original.subjects.find(
    (subject) => subject.programId === "senado-federal",
  )!;
  const universitySubject = original.subjects.find(
    (subject) => subject.programId === "maua",
  )!;
  await page.getByTestId("nav-studies").click();
  await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
  await testInfo.attach("cursos-senado-maua", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await expect(page.getByTestId(`subject-${senateSubject.id}`)).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Buscar curso ou conteúdo…" })
    .fill("Literatura");
  await expect(page.getByTestId("program-senado-federal")).toBeVisible();
  await expect(page.getByTestId("program-maua")).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page.getByTestId("program-maua").click();
  await expect(
    page.getByTestId(`subject-${universitySubject.id}`),
  ).toBeVisible();
  await expect(page.getByTestId(`subject-${senateSubject.id}`)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Todos os cursos", exact: true })
    .click();

  await page.getByRole("button", { name: "Novo curso", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Novo curso", exact: true });
  await modal
    .getByRole("textbox", { name: "Nome do curso", exact: true })
    .fill("Aprendizado pessoal E2E");
  await modal
    .getByRole("combobox", { name: "Objetivo", exact: true })
    .selectOption("pessoal");
  await modal
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Leituras e práticas pessoais, fora dos concursos.");
  await modal.getByRole("button", { name: "Criar curso", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const program = (await ninho.state()).programs.find(
    (item) => item.name === "Aprendizado pessoal E2E",
  )!;
  expect(program.track).toBe("pessoal");
  await page.getByTestId(`program-${program.id}`).click();
  await page.getByRole("button", { name: "Nova matéria", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Um novo caminho", exact: true });
  await expect(
    modal.getByRole("combobox", { name: "Curso", exact: true }),
  ).toHaveValue(program.id);
  await modal
    .getByRole("textbox", { name: "Nome da matéria", exact: true })
    .fill("Métodos de estudo E2E");
  await modal
    .getByRole("button", { name: "Criar matéria", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  const subject = (await ninho.state()).subjects.find(
    (item) => item.name === "Métodos de estudo E2E",
  )!;
  expect(subject).toMatchObject({ programId: program.id, track: "pessoal" });
  await page.getByRole("button", { name: "Editar curso", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Editar curso", exact: true });
  await modal
    .getByRole("textbox", { name: "Nome do curso", exact: true })
    .fill("Aprendizado contínuo E2E");
  await modal
    .getByRole("button", { name: "Salvar curso", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Aprendizado contínuo E2E",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByTestId(`subject-${subject.id}`).click();
  await page
    .getByRole("button", { name: "Editar matéria", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar matéria", exact: true });
  await modal
    .getByRole("combobox", { name: "Curso", exact: true })
    .selectOption("maua");
  await modal
    .getByRole("button", { name: "Salvar matéria", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Voltar para Mauá", exact: true }),
  ).toBeVisible();
  await page.getByTestId("nav-studies").click();
  await expect(page.getByTestId("program-senado-federal")).toBeVisible();
  await expect(page.getByTestId("program-maua")).toBeVisible();
  await expect(page.getByTestId(`program-${program.id}`)).toContainText(
    "Aprendizado contínuo E2E",
  );
  await expect(page.getByTestId(`subject-${subject.id}`)).toHaveCount(0);
  const saved = await ninho.state();
  expect(saved.subjects.find((item) => item.id === subject.id)).toMatchObject({
    programId: "maua",
    track: "faculdade",
  });
  expect(saved.lessons).toEqual(original.lessons);
  expect(saved.cards).toEqual(original.cards);
  expect(saved.courses).toEqual(original.courses);
  await ninho.restart();
  expect(await ninho.state()).toEqual(saved);
});
