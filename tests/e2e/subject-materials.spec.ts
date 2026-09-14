import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";

test("materiais da matéria mantêm o contexto e aceitam vídeo e áudio pessoais copiados", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  // A tiny, genuinely encoded WebM created inside the isolated renderer. No
  // camera, screen, personal media, remote download or original app is read.
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const parts: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) parts.push(event.data);
    };
    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    context.fillStyle = "#527969";
    context.fillRect(0, 0, 160, 90);
    context.fillStyle = "white";
    context.font = "16px sans-serif";
    context.fillText("Ninho E2E", 25, 48);
    await new Promise((resolve) => setTimeout(resolve, 500));
    recorder.stop();
    await finished;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(parts, { type: "video/webm" }).arrayBuffer(),
      ),
    );
  });
  expect(videoBytes.length).toBeGreaterThan(100);
  const videoPath = path.join(ninho.fixtureDir, "aula-pessoal.webm");
  await fs.writeFile(videoPath, Buffer.from(videoBytes));
  const wav = Buffer.alloc(44 + 1600);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(1600, 40);
  const audioPath = path.join(ninho.fixtureDir, "resumo-pessoal.wav");
  await fs.writeFile(audioPath, wav);

  await page.getByTestId("nav-materials").click();
  await ninho.openDialog([
    path.join(ninho.fixtureDir, "resumo-algoritmos.pdf"),
  ]);
  await page
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(1);
  const unrelated = (await ninho.state()).materials[0];
  await page.getByTestId("nav-studies").click();
  await page.getByTestId("program-senado-federal").click();
  await page.getByTestId("subject-literatura").click();
  await page.getByRole("tab", { name: /^Materiais/ }).click();
  const section = page.getByRole("tabpanel", {
    name: "Materiais da matéria",
    exact: true,
  });
  await expect(
    section.getByRole("combobox", { name: "Filtrar matéria" }),
  ).toHaveCount(0);
  await expect(section.getByTestId(`material-row-${unrelated.id}`)).toHaveCount(
    0,
  );
  await ninho.openDialog([
    videoPath,
    audioPath,
    path.join(ninho.fixtureDir, "revisao-redes.txt"),
  ]);
  await section
    .getByRole("button", { name: "Adicionar arquivos", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(4);
  await expect(page.getByRole("tab", { name: /^Materiais/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const imported = (await ninho.state()).materials.filter(
    (material) => material.id !== unrelated.id,
  );
  expect(
    imported.every(
      (material) =>
        material.subjectId === "literatura" && material.lessonId === "",
    ),
  ).toBe(true);
  await expect(section.locator("[data-testid^='material-row-']")).toHaveCount(
    3,
  );
  const video = imported.find((material) => material.type === "webm")!;
  const audio = imported.find((material) => material.type === "wav")!;
  await section
    .getByRole("combobox", { name: "Tipo de arquivo", exact: true })
    .selectOption("video");
  await expect(section.getByTestId(`material-row-${video.id}`)).toBeVisible();
  await expect(section.getByTestId(`material-row-${audio.id}`)).toHaveCount(0);
  await section
    .getByRole("button", { name: `Abrir ${video.name}`, exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: video.name, exact: true });
  await expect(modal).toContainText(
    "Este formato é aberto pelo programa padrão do Windows.",
  );
  await ninho.app.evaluate(({ shell }) => {
    const context = globalThis as unknown as { openedMedia: string[] };
    context.openedMedia = [];
    shell.openPath = async (filePath) => {
      context.openedMedia.push(filePath);
      return "";
    };
  });
  await fs.rename(videoPath, `${videoPath}.moved`);
  await modal
    .getByRole("button", { name: "Abrir no Windows", exact: true })
    .first()
    .click();
  const opened = await ninho.app.evaluate(
    () => (globalThis as unknown as { openedMedia: string[] }).openedMedia,
  );
  expect(opened).toEqual([
    path.join(ninho.dataDir, "materials", video.storedName),
  ]);
  expect(await fs.readFile(opened[0])).toEqual(Buffer.from(videoBytes));
  await modal
    .getByRole("textbox", { name: "Anotações do material", exact: true })
    .fill("Retomar este trecho antes de revisar as figuras de linguagem.");
  await modal
    .getByRole("button", { name: "Salvar material", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).materials.find((item) => item.id === video.id)
          ?.notes,
    )
    .toContain("figuras de linguagem");
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: /^Materiais/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await section
    .getByRole("combobox", { name: "Tipo de arquivo", exact: true })
    .selectOption("audio");
  await expect(section.getByTestId(`material-row-${audio.id}`)).toBeVisible();
  await expect(section.getByTestId(`material-row-${video.id}`)).toHaveCount(0);
  await section
    .getByRole("combobox", { name: "Tipo de arquivo", exact: true })
    .selectOption("all");
  await testInfo.attach("materiais-na-materia", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  const snapshot = await ninho.state();
  await page.getByTestId("nav-settings").click();
  await ninho.saveDialog(ninho.backupPath);
  await page
    .getByRole("button", { name: "Exportar backup", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await fs.stat(ninho.backupPath).catch(() => null))?.size || 0,
    )
    .toBeGreaterThan(0);
  await page.getByTestId("nav-materials").click();
  await page
    .getByRole("button", { name: `Remover ${video.name}`, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Remover da biblioteca?", exact: true })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await ninho.state()).materials.some((item) => item.id === video.id),
    )
    .toBe(false);
  await page.getByTestId("nav-settings").click();
  await ninho.openDialog([ninho.backupPath]);
  await ninho.confirmDialog(1);
  await page
    .getByRole("button", { name: "Restaurar backup", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Restaurar um Ninho salvo?", exact: true })
    .getByRole("button", { name: "Escolher backup", exact: true })
    .click();
  await expect.poll(async () => (await ninho.state()).materials.length).toBe(4);
  const restored = await ninho.state();
  const portable = (state: typeof restored) => ({
    ...state,
    materials: state.materials.map(
      ({ storedName: _physicalCopy, ...material }) => material,
    ),
  });
  expect(portable(restored)).toEqual(portable(snapshot));
  const restoredVideo = restored.materials.find(
    (item) => item.id === video.id,
  )!;
  const restoredAudio = restored.materials.find(
    (item) => item.id === audio.id,
  )!;
  expect(
    await fs.readFile(
      path.join(ninho.dataDir, "materials", restoredVideo.storedName),
    ),
  ).toEqual(Buffer.from(videoBytes));
  await ninho.restart();
  expect(await ninho.state()).toEqual(restored);
  expect(
    await fs.readFile(
      path.join(ninho.dataDir, "materials", restoredAudio.storedName),
    ),
  ).toEqual(wav);
  expect(await fs.readFile(`${videoPath}.moved`)).toEqual(
    Buffer.from(videoBytes),
  );
});
