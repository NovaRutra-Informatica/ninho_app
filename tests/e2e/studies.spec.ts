import { test, expect } from "./fixtures";
import path from "node:path";

test("catálogo inclui matéria fora de TI, busca, filtro de situação e notas persistentes", async ({
  ninho,
}) => {
  const { page } = ninho;
  const original = await ninho.state();
  const subject = original.subjects.find((item) => item.name === "Literatura")!;
  const lesson = original.lessons.find(
    (item) => item.subjectId === subject.id,
  )!;
  await page.getByTestId("nav-studies").click();
  await page
    .getByRole("textbox", { name: "Buscar matéria ou conteúdo…" })
    .fill("Literatura");
  await page.getByTestId(`subject-${subject.id}`).click();
  await expect(
    page.getByRole("heading", { name: "Literatura", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar aula ou conteúdo…" })
    .fill("conteúdo inexistente 987654");
  await expect(
    page.getByText("Nenhuma aula corresponde ao filtro.").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await row
    .getByRole("button", { name: `Detalhes de ${lesson.title}`, exact: true })
    .click();
  await row
    .getByRole("combobox", { name: "Situação", exact: true })
    .selectOption("in-progress");
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.status,
    )
    .toBe("in-progress");
  const notes =
    "Rever a relação entre o período literário e o contexto histórico.\nExemplo pessoal: romantismo.";
  await page.getByTestId(`lesson-notes-${lesson.id}`).fill(notes);
  await row.getByRole("button", { name: "Salvar anotações" }).click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.notes,
    )
    .toBe(notes);
  await page.getByTestId(`lesson-status-${lesson.id}`).click();
  await page
    .getByRole("combobox", { name: "Filtrar situação" })
    .selectOption("done");
  await expect(row).toBeVisible();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.status,
    )
    .toBe("done");

  await ninho.restart();
  const restored = (await ninho.state()).lessons.find(
    (item) => item.id === lesson.id,
  )!;
  expect(restored.notes).toBe(notes);
  expect(restored.status).toBe("done");
  await ninho.page.getByTestId("nav-studies").click();
  await ninho.page.getByTestId(`subject-${subject.id}`).click();
  await ninho.page.getByTestId(`lesson-status-${lesson.id}`).click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.status,
    )
    .toBe("not-started");
  expect(
    (await ninho.state()).lessons.find((item) => item.id === lesson.id)?.notes,
  ).toBe(notes);
});

test("cria matéria da faculdade, curso, aula e cartão contextual sem alterar o catálogo original", async ({
  ninho,
}) => {
  const { page } = ninho;
  await page.getByTestId("nav-studies").click();
  await page.getByRole("button", { name: "Nova matéria", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Um novo caminho" });
  await modal.getByLabel("Nome da matéria").fill("Sistemas Distribuídos — E2E");
  await modal
    .getByRole("combobox", { name: "Objetivo", exact: true })
    .selectOption("faculdade");
  await modal.getByRole("button", { name: "Criar matéria" }).click();
  await expect(modal).toHaveCount(0);
  const subject = (await ninho.state()).subjects.find(
    (item) => item.name === "Sistemas Distribuídos — E2E",
  )!;
  expect(subject.track).toBe("faculdade");
  await page.getByRole("button", { name: "Mauá", exact: true }).click();
  await page.getByTestId(`subject-${subject.id}`).click();
  await page
    .getByRole("button", { name: "Adicionar curso", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Adicionar curso" });
  await modal.getByLabel("Nome do curso").fill("Mauá — semestre final");
  await modal
    .getByLabel("Instituição ou plataforma")
    .fill("Instituto Mauá de Tecnologia");
  await modal
    .getByRole("button", { name: "Adicionar curso", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("button", { name: "Adicionar aula", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Adicionar aula" });
  await modal.getByLabel("Nome da aula").fill("Consistência e replicação");
  await modal
    .getByLabel("Conteúdo", { exact: true })
    .fill("Modelos de consistência e réplicas de dados.");
  await modal
    .getByRole("button", { name: "Adicionar aula", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  const state = await ninho.state();
  const lesson = state.lessons.find(
    (item) => item.title === "Consistência e replicação",
  )!;
  expect(lesson.subjectId).toBe(subject.id);
  expect(state.courses).toHaveLength(21);
  expect(state.lessons).toHaveLength(272);
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await row
    .getByRole("button", { name: `Detalhes de ${lesson.title}` })
    .click();
  await row.getByRole("button", { name: "Criar cartão", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Guardar um conhecimento" });
  await modal
    .getByLabel("Pergunta", { exact: true })
    .fill("Por que replicar dados?");
  await modal
    .getByLabel("Resposta", { exact: true })
    .fill("Para melhorar disponibilidade e distribuir a carga de leitura.");
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const card = (await ninho.state()).cards.find(
    (item) => item.question === "Por que replicar dados?",
  )!;
  expect(card.lessonId).toBe(lesson.id);
  expect(card.subjectId).toBe(subject.id);
  expect(card.lastReviewedAt).toBeNull();
  await ninho.openDialog([path.join(ninho.fixtureDir, "revisao-redes.txt")]);
  await row
    .getByRole("button", { name: "Anexar arquivo", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(1);
  expect((await ninho.state()).materials[0]).toMatchObject({
    lessonId: lesson.id,
    subjectId: subject.id,
  });
});

test("edita matéria, curso e aula preservando vínculos, anotações e progresso", async ({
  ninho,
}) => {
  const { page } = ninho;
  const initial = await ninho.state();
  const subject = initial.subjects.find((item) => item.name === "Literatura")!;
  const lesson = initial.lessons.find(
    (item) => item.subjectId === subject.id && initial.cards.some((card) => card.lessonId === item.id),
  )!;
  const course = initial.courses.find((item) => item.id === lesson.courseId)!;
  const originalCards = initial.cards.filter(
    (item) => item.lessonId === lesson.id,
  );
  expect(originalCards.length).toBeGreaterThan(0);
  await page.getByTestId("nav-studies").click();
  await page.getByTestId(`subject-${subject.id}`).click();
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await row
    .getByRole("button", { name: `Detalhes de ${lesson.title}`, exact: true })
    .click();
  await row.getByTestId(`lesson-status-${lesson.id}`).click();
  const notes =
    "Anotações pessoais que devem sobreviver à reorganização do curso.";
  await row.getByTestId(`lesson-notes-${lesson.id}`).fill(notes);
  await row
    .getByRole("button", { name: "Salvar anotações", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((item) => item.id === lesson.id)
          ?.notes,
    )
    .toBe(notes);

  await row
    .getByRole("button", { name: `Editar aula ${lesson.title}`, exact: true })
    .click();
  let modal = page.getByRole("dialog", { name: "Editar aula", exact: true });
  await modal
    .getByRole("textbox", { name: "Nome da aula", exact: true })
    .fill("Aula introdutória — edição E2E");
  await modal
    .getByRole("textbox", { name: "Conteúdo", exact: true })
    .fill("Organização dos conceitos iniciais de Literatura.");
  const lessonUrl = new URL(lesson.url || course.url);
  lessonUrl.searchParams.set("ninho", "teste");
  await modal
    .getByRole("textbox", { name: "Link da aula", exact: true })
    .fill(lessonUrl.href);
  await modal.getByRole("button", { name: "Salvar aula", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText("Aula introdutória — edição E2E");
  expect(
    (await ninho.state()).lessons.find((item) => item.id === lesson.id),
  ).toMatchObject({
    id: lesson.id,
    courseId: course.id,
    subjectId: subject.id,
    status: "done",
    notes,
    url: lessonUrl.href,
  });

  await page
    .getByRole("button", { name: `Editar curso ${course.title}`, exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar curso", exact: true });
  await modal
    .getByRole("textbox", { name: "Nome do curso", exact: true })
    .fill("Literatura — organização pessoal E2E");
  const courseUrl = new URL(course.url);
  courseUrl.searchParams.set("organizacao", "teste");
  await modal
    .getByRole("textbox", { name: "Link do curso", exact: true })
    .fill(courseUrl.href);
  await modal
    .getByRole("button", { name: "Salvar curso", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar matéria", exact: true })
    .click();
  modal = page.getByRole("dialog", { name: "Editar matéria", exact: true });
  await modal
    .getByRole("textbox", { name: "Nome da matéria", exact: true })
    .fill("Literatura revisada — E2E");
  await modal
    .getByRole("button", { name: "Salvar matéria", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Literatura revisada — E2E",
      exact: true,
    }),
  ).toBeVisible();
  const edited = await ninho.state();
  expect(edited.subjects).toHaveLength(initial.subjects.length);
  expect(edited.courses).toHaveLength(initial.courses.length);
  expect(edited.lessons).toHaveLength(initial.lessons.length);
  expect(edited.courses.find((item) => item.id === course.id)).toMatchObject({
    subjectId: subject.id,
    title: "Literatura — organização pessoal E2E",
    url: courseUrl.href,
  });
  expect(edited.cards.filter((item) => item.lessonId === lesson.id)).toEqual(
    originalCards,
  );
  await ninho.restart();
  expect(await ninho.state()).toEqual(edited);
  await ninho.page.getByTestId("nav-studies").click();
  await ninho.page.getByTestId(`subject-${subject.id}`).click();
  const restoredRow = ninho.page.getByTestId(`lesson-row-${lesson.id}`);
  await restoredRow
    .getByRole("button", {
      name: "Detalhes de Aula introdutória — edição E2E",
      exact: true,
    })
    .click();
  await expect(
    restoredRow.getByTestId(`lesson-notes-${lesson.id}`),
  ).toHaveValue(notes);
  await expect(
    restoredRow.getByRole("combobox", { name: "Situação", exact: true }),
  ).toHaveValue("done");
});
