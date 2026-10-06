import { describe, expect, it } from "vitest";
import { applyCommand, createInitialState, validateState } from "./index";
import { emptyProfile, profileContext } from "../shared/profile";
import { buildStudyPrompt } from "../main/ai";

describe("perfil local canônico", () => {
  it("mantém backups antigos válidos e abre onboarding apenas no estado novo", () => {
    const fresh = createInitialState();
    expect(fresh.profile?.completedAt).toBeNull();
    const legacy = { ...fresh };
    delete legacy.profile;
    expect(validateState(legacy).profile).toBeUndefined();
    expect(validateState({ ...legacy, profile: null }).profile).toBeNull();
  });
  it("preserva o perfil, tutoriais e plano ao validar um backup", () => {
    let state = applyCommand(createInitialState(), {
      type: "profile.save",
      profile: {
        ...emptyProfile("Ana"),
        goal: "Passar no vestibular",
        dailyMinutes: 45,
        completedAt: new Date().toISOString(),
      },
    });
    state = applyCommand(state, {
      type: "profile.tutorial",
      page: "today",
      seen: true,
    });
    state = applyCommand(state, {
      type: "profile.plan",
      revision: 1,
      status: "ready",
      plan: "Revisar álgebra por 20 minutos.",
    });
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(state.settings.name).toBe("Ana");
    expect(state.settings.dailyMinutes).toBe(45);
  });
  it("ignora geração antiga depois de editar objetivos e preserva os tutoriais", () => {
    let state = applyCommand(createInitialState(), {
      type: "profile.save",
      profile: emptyProfile("Ana"),
    });
    state = applyCommand(state, {
      type: "profile.tutorial",
      page: "today",
      seen: true,
    });
    state = applyCommand(state, {
      type: "profile.save",
      profile: { ...state.profile!, goal: "Matemática", tutorialsSeen: [] },
    });
    const result = applyCommand(state, {
      type: "profile.plan",
      revision: 1,
      plan: "Plano antigo",
      status: "ready",
    });
    expect(result.profile?.plan).toBe("");
    expect(result.profile?.tutorialsSeen).toEqual(["today"]);
    expect(result.profile?.revision).toBe(2);
  });
  it("ajustes de tempo e nome atualizam o contexto e invalidam o plano anterior", () => {
    let state = applyCommand(createInitialState(), {
      type: "profile.save",
      profile: emptyProfile("Ana"),
    });
    state = applyCommand(state, {
      type: "profile.plan",
      revision: 1,
      plan: "Plano",
      status: "ready",
    });
    state = applyCommand(state, {
      type: "settings.update",
      patch: { name: "Lu", dailyMinutes: 35, focusMinutes: 15 },
    });
    expect(state.profile).toMatchObject({
      name: "Lu",
      dailyMinutes: 35,
      sessionMinutes: 15,
      revision: 2,
      planStatus: "none",
    });
  });
  it("não aceita plano de um backup diferente com a mesma revisão", () => {
    const state = applyCommand(createInitialState(), {
      type: "profile.save",
      profile: { ...emptyProfile("Ana"), goal: "Meta anterior" },
    });
    const contextKey = JSON.stringify(profileContext(state.profile!));
    const restored = {
      ...state,
      profile: { ...state.profile!, goal: "Meta do backup" },
    };
    const result = applyCommand(restored, {
      type: "profile.plan",
      revision: 1,
      contextKey,
      plan: "Plano antigo",
      status: "ready",
    });
    expect(result.profile?.plan).toBe("");
    expect(result.profile?.goal).toBe("Meta do backup");
  });
  it("aceita os limites de tempo e IDs de dias interoperáveis", () => {
    const state = applyCommand(createInitialState(), {
      type: "profile.save",
      profile: {
        ...emptyProfile("Ana"),
        dailyMinutes: 1440,
        sessionMinutes: 240,
        availableDays: ["mon", "sun"],
      },
    });
    expect(state.settings).toMatchObject({
      dailyMinutes: 1440,
      focusMinutes: 240,
    });
    expect(validateState(state).profile?.availableDays).toEqual(["mon", "sun"]);
  });
  it("mantém todas as respostas no prompt mesmo com muitos registros, sem incluir plano derivado", () => {
    const state = createInitialState();
    state.profile = {
      ...emptyProfile("Ana"),
      goal: "Meta canônica",
      challenges: "Dificuldade declarada",
      routine: "Trabalho à tarde",
      plan: "DERIVADO não é contexto",
    };
    state.subjects.forEach((s) => (s.name = "Matéria extensa ".repeat(8)));
    const prompt = buildStudyPrompt(state);
    expect(prompt).toContain("Meta canônica");
    expect(prompt).toContain("Dificuldade declarada");
    expect(prompt).toContain("Trabalho à tarde");
    expect(prompt).not.toContain("DERIVADO");
  });
  it("recusa respostas ilimitadas e campos inválidos sem alterar a fonte", () => {
    const state = createInitialState();
    expect(() =>
      applyCommand(state, {
        type: "profile.save",
        profile: { ...emptyProfile(), goal: "x".repeat(401) },
      }),
    ).toThrow();
    expect(state.profile?.goal).toBe("");
  });
});
