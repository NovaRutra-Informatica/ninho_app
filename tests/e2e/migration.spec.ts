import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";
import type { AppState, Subject } from "../../src/shared/types";

const legacyState = JSON.parse(
  readFileSync(new URL("../fixtures/v1-state.json", import.meta.url), "utf8"),
) as Omit<AppState, "version" | "programs" | "subjects"> & {
  version: 1;
  subjects: Omit<Subject, "programId">[];
};

test.use({
  initialState: legacyState,
  initialMaterials: [
    {
      storedName: legacyState.materials[0].storedName,
      content: "Documento legado de teste",
    },
  ],
});

function withoutPrograms(state: AppState) {
  const { programs: _programs, ...rest } = state;
  return {
    ...rest,
    version: 1,
    subjects: rest.subjects.map(
      ({ programId: _programId, ...subject }) => subject,
    ),
  };
}

test("migra o perfil v1 preservando integralmente estudos, revisões, anexos e preferências", async ({
  ninho,
}) => {
  const migrated = await ninho.state();
  expect(migrated.version).toBe(2);
  expect(withoutPrograms(migrated)).toEqual(legacyState);
  expect(migrated.programs.map((program) => program.id)).toEqual(
    expect.arrayContaining(["senado-federal", "maua", "outros"]),
  );
  for (const subject of migrated.subjects) {
    expect(subject.programId).toBe(
      subject.track === "concurso"
        ? "senado-federal"
        : subject.track === "faculdade"
          ? "maua"
          : "outros",
    );
  }
  const { page } = ninho;
  await page.getByTestId("nav-studies").click();
  await expect(page.getByTestId("program-senado-federal")).toBeVisible();
  await expect(page.getByTestId("program-maua")).toBeVisible();
  await expect(page.getByTestId("program-outros")).toBeVisible();
  await page.getByTestId("program-senado-federal").click();
  const lesson = migrated.lessons[0];
  await page.getByTestId(`subject-${lesson.subjectId}`).click();
  const row = page.getByTestId(`lesson-row-${lesson.id}`);
  await row
    .getByRole("button", { name: `Detalhes de ${lesson.title}`, exact: true })
    .click();
  await expect(row.getByTestId(`lesson-notes-${lesson.id}`)).toHaveValue(
    lesson.notes,
  );
  await expect(
    row.getByRole("combobox", { name: "Situação", exact: true }),
  ).toHaveValue("done");

  await page.getByRole("tab", { name: /^Materiais/ }).click();
  const material = migrated.materials[0];
  await page
    .getByRole("button", { name: `Abrir ${material.name}`, exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: material.name, exact: true });
  await expect(modal).toContainText("Documento legado de teste");
  await expect(
    modal.getByRole("textbox", { name: "Anotações do material", exact: true }),
  ).toHaveValue(material.notes);
  await page.keyboard.press("Escape");

  await page.getByTestId("nav-settings").click();
  await page
    .getByRole("textbox", { name: "Como quer ser chamado?", exact: true })
    .fill("Perfil migrado e salvo");
  await expect
    .poll(async () => (await ninho.state()).settings.name)
    .toBe("Perfil migrado e salvo");
  const saved = await ninho.state();
  expect(
    JSON.parse(
      await fs.readFile(path.join(ninho.dataDir, "state.json"), "utf8"),
    ),
  ).toEqual(saved);
  await ninho.restart();
  expect(await ninho.state()).toEqual(saved);
  expect(
    await fs.readFile(
      path.join(ninho.dataDir, "materials", material.storedName),
      "utf8",
    ),
  ).toBe("Documento legado de teste");
});
