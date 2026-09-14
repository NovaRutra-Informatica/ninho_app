import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect, type NinhoTestApp } from "./fixtures";
import type { AppState } from "../../src/shared/types";

function portableState(state: AppState) {
  return {
    ...state,
    materials: state.materials.map(
      ({ storedName: _physicalFilename, ...material }) => material,
    ),
  };
}

async function restore(ninho: NinhoTestApp, filePath: string, confirm = true) {
  await ninho.openDialog([filePath]);
  await ninho.confirmDialog(confirm ? 1 : 0);
  await ninho.page
    .getByRole("button", { name: "Restaurar backup", exact: true })
    .click();
  await ninho.page
    .getByRole("dialog", { name: "Restaurar um Ninho salvo?" })
    .getByRole("button", { name: "Escolher backup", exact: true })
    .click();
}

test("preferências de estudo e acessibilidade persistem após reiniciar", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  await page.getByTestId("nav-settings").click();
  await page.getByLabel("Como quer ser chamado?").fill("Alessandro — teste");
  await page.getByLabel("Meta diária (minutos)").fill("30");
  await page.getByLabel("Novos cartões por dia").fill("8");
  await page.getByLabel("Tempo de foco (minutos)").fill("20");
  await page.getByLabel("Tempo de pausa (minutos)").fill("4");
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Som ao concluir o foco/ })
    .uncheck();
  await page.getByRole("checkbox", { name: /Reduzir animações/ }).check();
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.name)
    .toBe("Alessandro — teste");
  const expected = {
    name: "Alessandro — teste",
    dailyMinutes: 30,
    newCardsPerDay: 8,
    focusMinutes: 20,
    breakMinutes: 4,
    theme: "dark",
    sound: false,
    reducedMotion: true,
  };
  expect((await ninho.state()).settings).toMatchObject(expected);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(23, 36, 31)",
  );
  await expect(page.locator("html")).toHaveCSS("color", "rgb(230, 237, 223)");
  await testInfo.attach("tema-escuro", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await ninho.restart();
  expect((await ninho.state()).settings).toMatchObject(expected);
  await ninho.page.getByTestId("nav-settings").click();
  await expect(ninho.page.getByLabel("Como quer ser chamado?")).toHaveValue(
    "Alessandro — teste",
  );
  await expect(
    ninho.page.getByRole("button", { name: "Escuro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    ninho.page.getByRole("checkbox", { name: /Reduzir animações/ }),
  ).toBeChecked();
  await ninho.page.getByRole("button", { name: "Claro", exact: true }).click();
  await ninho.page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.theme)
    .toBe("light");
  await testInfo.attach("tema-claro", {
    body: await ninho.page.screenshot(),
    contentType: "image/png",
  });
  await ninho.page
    .getByRole("button", { name: "Sistema", exact: true })
    .click();
  await ninho.page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.theme)
    .toBe("system");
  await ninho.page.emulateMedia({ colorScheme: "dark" });
  await expect(ninho.page.locator("html")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await ninho.page.emulateMedia({ colorScheme: "light" });
  await expect(ninho.page.locator("html")).toHaveAttribute(
    "data-theme",
    "light",
  );
});

test("backup restaura dados e anexos, cancelamento e arquivo inválido preservam o perfil", async ({
  ninho,
}) => {
  const { page } = ninho;
  await page.getByTestId("nav-materials").click();
  await ninho.openDialog([path.join(ninho.fixtureDir, "revisao-redes.txt")]);
  await page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(1);
  await page.getByTestId("nav-settings").click();
  await page
    .getByLabel("Como quer ser chamado?")
    .fill("Nome guardado no backup");
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.name)
    .toBe("Nome guardado no backup");
  const snapshot = await ninho.state();
  await ninho.saveDialog(ninho.backupPath, true);
  await page
    .getByRole("button", { name: "Exportar backup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exportar backup", exact: true }),
  ).toBeEnabled();
  expect(
    await fs.stat(ninho.backupPath).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  await ninho.saveDialog(ninho.backupPath);
  await page
    .getByRole("button", { name: "Exportar backup", exact: true })
    .click();
  await expect
    .poll(async () =>
      fs.stat(ninho.backupPath).then(
        (stat) => stat.size,
        () => 0,
      ),
    )
    .toBeGreaterThan(100);
  await page
    .getByLabel("Como quer ser chamado?")
    .fill("Nome posterior ao backup");
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.name)
    .toBe("Nome posterior ao backup");
  await restore(ninho, ninho.backupPath, false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await ninho.state()).settings.name).toBe("Nome posterior ao backup");

  const invalidBackup = path.join(ninho.fixtureDir, "invalido.zip");
  await fs.writeFile(invalidBackup, "Isto não é um backup do Ninho.");
  await restore(ninho, invalidBackup);
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await ninho.state()).settings.name).toBe("Nome posterior ao backup");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await restore(ninho, ninho.backupPath);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await ninho.state()).settings.name)
    .toBe(snapshot.settings.name);
  const restored = await ninho.state();
  expect(portableState(restored)).toEqual(portableState(snapshot));
  const material = snapshot.materials[0];
  const preview = await page.evaluate(
    (id) => window.ninho!.previewMaterial(id),
    material.id,
  );
  expect(preview).toMatchObject({ kind: "text", name: material.name });
  expect(preview.data).toContain("DNS traduz nomes de domínio");
  const paths = await page.evaluate(() => window.ninho!.getPaths());
  expect(
    (await fs.readdir(paths.backup)).some((name) => name.endsWith(".zip")),
  ).toBe(true);
  await ninho.restart();
  expect(await ninho.state()).toEqual(restored);
});
