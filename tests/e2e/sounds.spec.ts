import { test, expect } from "./fixtures";

type AudioEvidence = {
  created: number;
  closed: number;
  frequencies: number[];
  peak: number;
};

test("sons reais acompanham ações persistidas, liberam áudio ocioso e respeitam a preferência", async ({
  ninho,
}, testInfo) => {
  const { page } = ninho;
  // Exercise Chromium's real audio graph. Only the final physical output is
  // muted: the analyser observes the generated waveform before that mute.
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    const evidence: AudioEvidence = {
      created: 0,
      closed: 0,
      frequencies: [],
      peak: 0,
    };
    Object.defineProperty(window, "ninhoAudioEvidence", { value: evidence });
    window.AudioContext = new Proxy(NativeContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args) as AudioContext;
        evidence.created++;
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        const output = context.createGain();
        output.gain.value = 0;
        analyser.connect(output);
        output.connect(context.destination);
        const waveform = new Float32Array(analyser.fftSize);
        const sample = setInterval(() => {
          analyser.getFloatTimeDomainData(waveform);
          for (const value of waveform)
            evidence.peak = Math.max(evidence.peak, Math.abs(value));
        }, 8);
        const createGain = context.createGain.bind(context);
        context.createGain = () => {
          const gain = createGain();
          const connect = gain.connect.bind(gain);
          Object.defineProperty(gain, "connect", {
            value: (destination: AudioNode) =>
              connect(
                destination === context.destination ? analyser : destination,
              ),
          });
          return gain;
        };
        const createOscillator = context.createOscillator.bind(context);
        context.createOscillator = () => {
          const oscillator = createOscillator();
          const setFrequency = oscillator.frequency.setValueAtTime.bind(
            oscillator.frequency,
          );
          oscillator.frequency.setValueAtTime = (value, time) => {
            evidence.frequencies.push(value);
            return setFrequency(value, time);
          };
          return oscillator;
        };
        const close = context.close.bind(context);
        context.close = async () => {
          try {
            await close();
          } finally {
            clearInterval(sample);
            evidence.closed++;
          }
        };
        return context;
      },
    });
  });
  await page.reload();
  await expect(page.getByTestId("nav-today")).toBeVisible();
  const evidence = () =>
    page.evaluate(
      () =>
        (window as unknown as { ninhoAudioEvidence: AudioEvidence })
          .ninhoAudioEvidence,
    );
  expect((await evidence()).created).toBe(0);
  await page.getByTestId("nav-settings").click();
  await page.getByRole("checkbox", { name: /Sons do Ninho/ }).check();
  expect((await evidence()).created).toBe(0);
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.sound)
    .toBe(true);
  await expect
    .poll(async () => (await evidence()).frequencies)
    .toEqual([659.25, 783.99]);
  await expect.poll(async () => (await evidence()).peak).toBeGreaterThan(0.001);
  await expect.poll(async () => (await evidence()).closed).toBe(1);

  const state = await ninho.state();
  const subject = state.subjects.find((entry) => entry.name === "Literatura")!;
  const lesson = state.lessons.find((entry) => entry.subjectId === subject.id)!;
  await page.getByTestId("nav-studies").click();
  await page.getByTestId(`program-${subject.programId}`).click();
  await page.getByTestId(`subject-${subject.id}`).click();
  await page.getByTestId(`lesson-status-${lesson.id}`).click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).lessons.find((entry) => entry.id === lesson.id)
          ?.status,
    )
    .toBe("done");
  await expect
    .poll(async () => (await evidence()).frequencies.slice(2))
    .toEqual([659.25, 783.99, 1046.5]);
  await expect.poll(async () => (await evidence()).closed).toBe(2);

  await page.getByTestId("nav-reviews").click();
  await page
    .getByRole("combobox", { name: "Filtrar matéria" })
    .selectOption(subject.id);
  await page
    .getByRole("button", { name: "Começar revisão", exact: true })
    .click();
  await page.getByRole("button", { name: /Revelar resposta/ }).click();
  await page.getByRole("button", { name: /Lembrei Seguir no ritmo/ }).click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).sessions.filter(
          (entry) => entry.kind === "review",
        ).length,
    )
    .toBe(1);
  await expect
    .poll(async () => (await evidence()).frequencies.slice(5))
    .toEqual([523.25, 659.25]);
  await expect.poll(async () => (await evidence()).closed).toBe(3);

  await page.getByTestId("open-focus").click();
  await page.getByTestId("focus-start").click();
  await expect(page.getByTestId("focus-timer")).not.toHaveText("25:00");
  await page.getByTestId("focus-finish").click();
  await expect
    .poll(
      async () =>
        (await ninho.state()).sessions.filter((entry) => entry.kind === "focus")
          .length,
    )
    .toBe(1);
  await expect
    .poll(async () => (await evidence()).frequencies.slice(7))
    .toEqual([523.25, 659.25, 880]);
  await page
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  await expect.poll(async () => (await evidence()).closed).toBe(4);
  const played = await evidence();
  expect(played.peak).toBeLessThan(0.15);
  await testInfo.attach("audio-real-silenciado-na-saida", {
    body: JSON.stringify(played, null, 2),
    contentType: "application/json",
  });

  await page.getByTestId("nav-settings").click();
  await page.getByRole("checkbox", { name: /Sons do Ninho/ }).uncheck();
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect
    .poll(async () => (await ninho.state()).settings.sound)
    .toBe(false);
  expect(await evidence()).toEqual(played);
  await page.reload();
  await expect(page.getByTestId("nav-today")).toBeVisible();
  expect((await ninho.state()).settings.sound).toBe(false);
  expect((await evidence()).created).toBe(0);
});
