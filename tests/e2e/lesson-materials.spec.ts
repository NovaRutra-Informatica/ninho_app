import { promises as fs } from "node:fs";
import path from "node:path";
import type { Frame } from "@playwright/test";
import type { Lesson, Subject } from "../../src/shared/types";
import { test, expect, type NinhoTestApp } from "./fixtures";

async function openSubject(ninho: NinhoTestApp, subject: Subject) {
  await ninho.page.getByTestId("nav-studies").click();
  await ninho.page.getByTestId(`program-${subject.programId}`).click();
  await ninho.page.getByTestId(`subject-${subject.id}`).click();
}

async function openLessonMaterials(ninho: NinhoTestApp, lesson: Lesson) {
  await ninho.page.getByRole("tab", { name: "Aulas", exact: true }).click();
  const row = ninho.page.getByTestId(`lesson-row-${lesson.id}`);
  await row.getByTestId(`lesson-open-materials-${lesson.id}`).click();
  const section = row.getByTestId(`lesson-materials-${lesson.id}`);
  await expect(
    section.getByRole("heading", { name: "Materiais desta aula", exact: true }),
  ).toBeVisible();
  return section;
}

test("PDF pessoal fica na aula escolhida, pode ser movido e preserva vínculo e conteúdo ao reabrir", async ({
  ninho,
}, testInfo) => {
  test.setTimeout(180_000);
  let { page } = ninho;
  const before = await ninho.state();
  const subject = before.subjects.find((item) => item.id === "literatura")!;
  const otherSubject = before.subjects.find(
    (item) => item.name === "Banco de dados",
  )!;
  const [first, second] = before.lessons.filter(
    (item) => item.subjectId === subject.id,
  );
  const [otherLesson, otherNeighbor] = before.lessons.filter(
    (item) => item.subjectId === otherSubject.id,
  );
  const originalPdf = path.join(ninho.fixtureDir, "meu-resumo-pessoal.pdf");
  await fs.rename(
    path.join(ninho.fixtureDir, "resumo-algoritmos.pdf"),
    originalPdf,
  );
  const originalBytes = await fs.readFile(originalPdf);

  await openSubject(ninho, subject);
  let section = await openLessonMaterials(ninho, first);
  await ninho.openDialog([originalPdf]);
  await section
    .getByRole("button", { name: "Adicionar arquivos à aula", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(1);
  const material = (await ninho.state()).materials[0];
  expect(material).toMatchObject({
    name: "meu-resumo-pessoal.pdf",
    subjectId: subject.id,
    lessonId: first.id,
    type: "pdf",
  });
  await expect(
    section.getByTestId(`material-row-${material.id}`),
  ).toBeVisible();
  await testInfo.attach("pdf-dentro-da-aula", {
    body: await section.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  section = await openLessonMaterials(ninho, second);
  await expect(section.getByTestId(`material-row-${material.id}`)).toHaveCount(
    0,
  );

  await page.getByRole("tab", { name: /^Materiais/ }).click();
  const library = page.getByRole("tabpanel", {
    name: "Materiais da matéria",
    exact: true,
  });
  await expect(
    library.getByTestId(`material-row-${material.id}`),
  ).toContainText(first.title);
  await expect(library.locator("[data-testid^='material-row-']")).toHaveCount(
    1,
  );
  await library
    .getByRole("button", { name: `Abrir ${material.name}`, exact: true })
    .click();
  let modal = page.getByRole("dialog", { name: material.name, exact: true });
  await expect(
    modal.getByRole("combobox", { name: "Aula do material", exact: true }),
  ).toHaveValue(first.id);
  await modal
    .getByRole("combobox", { name: "Aula do material", exact: true })
    .selectOption(second.id);
  await modal
    .getByRole("textbox", { name: "Anotações do material", exact: true })
    .fill("Resumo pessoal. Rever os exemplos antes da prova.");
  await modal
    .getByRole("button", { name: "Salvar material", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).materials[0].lessonId)
    .toBe(second.id);
  await modal
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(
    library.getByTestId(`material-row-${material.id}`),
  ).toContainText(second.title);
  section = await openLessonMaterials(ninho, first);
  await expect(section.getByTestId(`material-row-${material.id}`)).toHaveCount(
    0,
  );
  section = await openLessonMaterials(ninho, second);
  await expect(
    section.getByTestId(`material-row-${material.id}`),
  ).toBeVisible();
  await section
    .getByRole("button", { name: `Abrir ${material.name}`, exact: true })
    .click();
  modal = page.getByRole("dialog", { name: material.name, exact: true });
  await expect(modal.locator("iframe")).toBeVisible();
  let pdfViewerFrame: Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        if (await frame.locator("pdf-viewer").count()) {
          pdfViewerFrame = frame;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  await expect(
    pdfViewerFrame!.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("1");
  await expect(
    pdfViewerFrame!.getByRole("tab", {
      name: "Thumbnail for page 1",
      exact: true,
    }),
  ).toBeVisible();
  await testInfo.attach("pdf-da-aula-aberto", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });

  await modal
    .getByRole("combobox", { name: "Matéria", exact: true })
    .selectOption(otherSubject.id);
  const lessonSelect = modal.getByRole("combobox", {
    name: "Aula do material",
    exact: true,
  });
  await expect(lessonSelect).toHaveValue("");
  await expect(
    lessonSelect.locator(`option[value="${second.id}"]`),
  ).toHaveCount(0);
  await lessonSelect.selectOption(otherLesson.id);
  await modal
    .getByRole("button", { name: "Salvar material", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).materials[0].lessonId)
    .toBe(otherLesson.id);
  await modal
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect(section.getByTestId(`material-row-${material.id}`)).toHaveCount(
    0,
  );
  await openSubject(ninho, otherSubject);
  section = await openLessonMaterials(ninho, otherLesson);
  await expect(
    section.getByTestId(`material-row-${material.id}`),
  ).toBeVisible();
  section = await openLessonMaterials(ninho, otherNeighbor);
  await expect(section.getByTestId(`material-row-${material.id}`)).toHaveCount(
    0,
  );
  const snapshot = await ninho.state();
  expect(snapshot.materials[0]).toMatchObject({
    id: material.id,
    subjectId: otherSubject.id,
    lessonId: otherLesson.id,
    notes: "Resumo pessoal. Rever os exemplos antes da prova.",
  });
  expect(snapshot.lessons).toEqual(before.lessons);
  expect(snapshot.sessions).toEqual(before.sessions);
  expect(snapshot.cards).toEqual(before.cards);
  expect(await fs.readFile(originalPdf)).toEqual(originalBytes);

  await ninho.restart();
  page = ninho.page;
  expect(await ninho.state()).toEqual(snapshot);
  await openSubject(ninho, otherSubject);
  section = await openLessonMaterials(ninho, otherLesson);
  await expect(
    section.getByTestId(`material-row-${material.id}`),
  ).toBeVisible();
  const preview = await page.evaluate(
    (id) => window.ninho!.previewMaterial(id),
    material.id,
  );
  expect(preview.kind).toBe("pdf");
  if (preview.kind !== "pdf") throw new Error("Expected a persisted PDF");
  expect(Buffer.from(preview.data!, "base64")).toEqual(originalBytes);
  await openSubject(ninho, subject);
  section = await openLessonMaterials(ninho, second);
  await expect(section.getByTestId(`material-row-${material.id}`)).toHaveCount(
    0,
  );
});
