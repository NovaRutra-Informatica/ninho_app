import { describe, it, expect } from "vitest";
import { createInitialState } from "./index";
import { adaptiveOverview } from "./adaptive";
import { activeSeconds, normalizeActivity, type ActivityDay } from "./activity";
const now = new Date("2026-09-23T18:00:00");
function fixture() {
  const state = createInitialState(now);
  state.sessions = [];
  state.cards = [];
  state.profile!.name = "Ana";
  state.profile!.goal = "Aprender estatística";
  state.profile!.completedAt = now.toISOString();
  return state;
}
function samples(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    subjectId: "x",
    lessonId: "",
    durationMinutes: 10,
    completedAt: new Date(2026, 8, 20 + Math.floor(i / 2), 19, 0).toISOString(),
    kind: "focus" as const,
  }));
}
describe("acompanhamento proativo explicável", () => {
  it("usa perfil direto e separa navegação da meta de estudo", () => {
    const state = fixture();
    state.profile!.dailyMinutes = 45;
    state.profile!.sessionMinutes = 20;
    const result = adaptiveOverview(
      state,
      [
        {
          date: "2026-09-23",
          route: "materials",
          visits: 4,
          activeSeconds: 3600,
          backgrounds: 0,
          focusPauses: 0,
        },
      ],
      now,
    );
    expect(result.signals[0].summary).toContain("0 de 45");
    expect(result.samples.minutes).toBe(0);
    expect(result.samples.activeMinutes).toBe(60);
    expect(result.signals.find((s) => s.id === "goal")?.summary).toBe(
      "Aprender estatística",
    );
  });
  it("só sugere ajustar blocos e observar horários após amostra mínima", () => {
    const state = fixture();
    state.sessions = samples(4);
    expect(
      adaptiveOverview(state, [], now).signals.some((s) =>
        ["blocks", "schedule"].includes(s.id),
      ),
    ).toBe(false);
    state.sessions = samples();
    const result = adaptiveOverview(state, [], now);
    expect(result.signals.some((s) => s.id === "blocks")).toBe(true);
    expect(result.signals.find((s) => s.id === "schedule")?.summary).toContain(
      "6 de 6",
    );
    expect(result.signals.find((s) => s.id === "schedule")?.limit).toContain(
      "não de início",
    );
    expect(state.profile!.sessionMinutes).toBe(25);
  });
  it("descarta registros futuros e antigos ao observar padrões", () => {
    const state = fixture();
    state.sessions = [
      ...samples(),
      ...samples().map((s) => ({
        ...s,
        id: `future${s.id}`,
        completedAt: "2027-01-01T12:00:00Z",
      })),
      ...samples().map((s) => ({
        ...s,
        id: `past${s.id}`,
        completedAt: "2025-01-01T12:00:00Z",
      })),
    ];
    expect(adaptiveOverview(state, [], now).samples.sessions).toBe(6);
  });
  it("mostra lacunas sem transformar ausência de dados em esquecimento", () => {
    const state = fixture();
    const subject = state.subjects[0];
    state.sessions = [
      {
        ...samples(1)[0],
        subjectId: subject.id,
        completedAt: "2026-09-01T12:00:00Z",
      },
    ];
    const result = adaptiveOverview(state, [], now);
    expect(
      result.signals.find((s) => s.id === `gap:${subject.id}`)?.limit,
    ).toContain("estudou fora");
    expect(result.signals.filter((s) => s.id.startsWith("gap:"))).toHaveLength(
      1,
    );
    expect(result.gaps[0]).toContain("não calcula taxa de acerto");
  });
  it("não interpreta saída de janela como interrupção de foco", () => {
    const state = fixture();
    const activity: ActivityDay[] = [
      {
        date: "2026-09-21",
        route: "focus",
        visits: 1,
        activeSeconds: 30,
        backgrounds: 50,
        focusPauses: 0,
      },
      {
        date: "2026-09-22",
        route: "focus",
        visits: 1,
        activeSeconds: 30,
        backgrounds: 50,
        focusPauses: 0,
      },
    ];
    expect(
      adaptiveOverview(state, activity, now).signals.some(
        (s) => s.id === "pauses",
      ),
    ).toBe(false);
    activity[0].focusPauses = 2;
    activity[1].focusPauses = 1;
    expect(
      adaptiveOverview(state, activity, now).signals.find(
        (s) => s.id === "pauses",
      )?.limit,
    ).toContain("não indica desatenção");
  });
});
describe("uso agregado local limitado", () => {
  it("aceita somente rotas próprias e mantém no máximo 90 dias", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      date: new Date(2026, 8, 23 - i).toISOString().slice(0, 10),
      route: "today",
      visits: 1,
      activeSeconds: 20,
      backgrounds: 0,
      focusPauses: 0,
    }));
    expect(
      normalizeActivity(
        [...rows, { ...rows[0], route: "https://outside.invalid/private" }],
        now.getTime(),
      ),
    ).toHaveLength(90);
    expect(
      normalizeActivity([{ ...rows[0], date: "2026-02-31" }], now.getTime()),
    ).toEqual([]);
  });
  it("não conta segundo plano, inatividade ou suspensão do sistema", () => {
    expect(activeSeconds(0, 30000, 0, true)).toBe(30);
    expect(activeSeconds(30000, 60000, 0, true)).toBe(30);
    expect(activeSeconds(60000, 90000, 0, true)).toBe(0);
    expect(activeSeconds(0, 30000, 0, false)).toBe(0);
    expect(activeSeconds(0, 3600000, 0, true)).toBe(0);
  });
});
