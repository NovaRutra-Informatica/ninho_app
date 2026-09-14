import { describe, expect, it } from "vitest";
import { applyCommand, createInitialState, localDate } from "./index";
import { answerMentor, getMentorOverview } from "./mentor";
import type { AppState, Exam } from "../shared/types";

const now = new Date(2026, 8, 14, 12, 0);
const initial = () => createInitialState(now);
const subject = "banco-de-dados";
const insight = (state = initial(), date = now, id = subject) =>
  getMentorOverview(state, date, id).subjects[0];
function practiced(
  count: number,
  patch: Partial<AppState["cards"][number]> = {},
): AppState {
  const state = initial();
  state.cards = state.cards
    .filter((card) => card.subjectId === subject)
    .slice(0, count)
    .map((card) => ({
      ...card,
      lastReviewedAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
      repetitions: 1,
      intervalDays: 1,
      ...patch,
    }));
  return state;
}
const exam = (patch: Partial<Exam> = {}): Exam => ({
  id: "exam-test",
  title: "Prova real cadastrada",
  subjectId: subject,
  date: localDate(now),
  time: "19:00",
  notes: "",
  location: "",
  completed: false,
  ...patch,
});

describe("mentor evidence and classification", () => {
  it("starts without invented knowledge or history and explains coverage limits", () => {
    const overview = getMentorOverview(initial(), now);
    expect(overview.subjects).toHaveLength(15);
    expect(
      overview.subjects.every(
        (subject) =>
          subject.status === "Ainda sem evidência" &&
          subject.reviewedCards === 0 &&
          subject.confidence === "sem evidência",
      ),
    ).toBe(true);
    expect(insight().coveragePercent).toBe(0);
    expect(
      insight(initial(), now, "ciencia-da-computacao").coveragePercent,
    ).toBeNull();
    expect(overview.summary).toContain("Ainda não há respostas suas");
    expect(overview.limits.join(" ")).toContain("não mede seu domínio real");
    expect(overview.limits.join(" ")).toContain(
      "não é detectado automaticamente",
    );
  });
  it("distinguishes studying a lesson from evidence of memory", () => {
    const state = applyCommand(
      initial(),
      {
        type: "lesson.update",
        id: "240830:aula:00",
        patch: { status: "done" },
      },
      now,
    );
    expect(insight(state)).toMatchObject({
      status: "Construindo base",
      confidence: "sem evidência",
      reviewedCards: 0,
      lessonsDone: 1,
    });
    expect(insight(state).confidenceReason).toContain("Ainda não há respostas");
  });
  it("reports low confidence for a tiny sample even when every existing card was practiced", () => {
    expect(insight(practiced(1))).toMatchObject({
      status: "Construindo base",
      confidence: "baixa",
      coveragePercent: 100,
    });
    expect(insight(practiced(1)).confidenceReason).toContain(
      "não toda a matéria",
    );
  });
  it("uses a transparent staged classification from actual attempts and intervals", () => {
    expect(insight(practiced(5))).toMatchObject({
      status: "Em consolidação",
      confidence: "moderada",
      stableCards: 0,
    });
    expect(
      insight(practiced(5, { repetitions: 3, intervalDays: 7 })),
    ).toMatchObject({ status: "Em dia", stableCards: 5 });
    expect(insight(practiced(20))).toMatchObject({
      confidence: "ampla",
      reviewAttempts: 20,
    });
  });
  it("does not label a low-coverage bank of cards as consolidated", () => {
    const state = initial();
    state.cards.slice(0, 5).forEach((card) => {
      card.lastReviewedAt = now.toISOString();
      card.repetitions = 5;
      card.intervalDays = 14;
      card.dueAt = new Date(now.getTime() + 86_400_000).toISOString();
    });
    expect(insight(state)).toMatchObject({
      status: "Construindo base",
      coveragePercent: 20,
    });
  });
  it("marks due reviews as practice needs without declaring factual outdatedness", () => {
    const state = practiced(5, { dueAt: now.toISOString(), lapses: 1 });
    const result = insight(state);
    expect(result).toMatchObject({
      status: "Revisão necessária",
      dueCards: 5,
      cardsWithLapses: 5,
      outdatedCards: 0,
    });
    expect(result.signals.join(" ")).toContain("não prova esquecimento atual");
    expect(result.signals.join(" ")).not.toContain("conteúdo desatualizado");
  });
  it("preserves historical errors as signals without claiming current forgetting", () => {
    const state = practiced(5, {
      lapses: 3,
      repetitions: 10,
      intervalDays: 14,
    });
    expect(insight(state)).toMatchObject({
      status: "Em dia",
      dueCards: 0,
      cardsWithLapses: 5,
    });
  });
  it("treats outdated marks and relearn marks as separate user signals", () => {
    const state = initial();
    state.cards[0].flag = "outdated";
    state.cards[1].flag = "relearn";
    expect(insight(state)).toMatchObject({
      status: "Conferir fonte",
      outdatedCards: 1,
      relearnCards: 1,
      flaggedCards: 2,
    });
    state.cards[0].flag = "none";
    expect(insight(state)).toMatchObject({
      status: "Revisão necessária",
      outdatedCards: 0,
      relearnCards: 1,
    });
  });
  it("excludes suspended due cards from obligations without erasing their evidence or source marks", () => {
    const state = practiced(5, { dueAt: now.toISOString(), suspended: true });
    expect(insight(state)).toMatchObject({ reviewedCards: 5, dueCards: 0 });
    state.cards[0].flag = "outdated";
    expect(insight(state).outdatedCards).toBe(1);
  });
  it("observes aging only through existing scheduled dates", () => {
    const state = practiced(1, {
      dueAt: now.toISOString(),
      repetitions: 4,
      intervalDays: 7,
    });
    const later = new Date(now);
    later.setDate(later.getDate() + 10);
    expect(insight(state, later)).toMatchObject({
      status: "Revisão necessária",
      oldestOverdueDays: 10,
      dueCards: 1,
      outdatedCards: 0,
    });
    expect(insight(state, later).priorityFactors).toContainEqual({
      label: "Maior atraso: 1 ponto por dia, até 10",
      points: 10,
    });
  });
});

describe("mentor priorities and real links", () => {
  it("explains every priority point and caps priority at 100", () => {
    const state = practiced(25, { dueAt: now.toISOString() });
    state.cards.slice(0, 15).forEach((card) => {
      card.flag = "outdated";
    });
    state.cards.slice(15).forEach((card) => {
      card.flag = "relearn";
    });
    state.exams = [exam()];
    const result = insight(state);
    expect(result.priority).toBe(100);
    expect(result.priority).toBe(
      Math.min(
        100,
        result.priorityFactors.reduce((sum, factor) => sum + factor.points, 0),
      ),
    );
    expect(result.priorityFactors.map((factor) => factor.points)).toEqual([
      36, 25, 16, 40, 8,
    ]);
  });
  it.each([
    [0, 40],
    [2, 40],
    [3, 30],
    [7, 30],
    [8, 20],
    [14, 20],
    [15, 10],
    [30, 10],
    [31, 0],
  ])("weights a real exam in %i days with %i points", (days, points) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    const state = initial();
    state.exams = [exam({ date: localDate(date) })];
    expect(insight(state).daysToExam).toBe(days);
    expect(
      insight(state).priorityFactors.find((factor) =>
        factor.label.startsWith("Prova próxima"),
      )?.points ?? 0,
    ).toBe(points);
  });
  it("selects nearest unfinished exam and ignores completed and past dates", () => {
    const state = initial();
    state.exams = [
      exam({ id: "past", date: "2026-09-13" }),
      exam({ id: "done", completed: true }),
      exam({ id: "nearest", date: "2026-09-15" }),
      exam({ id: "later", date: "2026-09-22" }),
    ];
    expect(insight(state).nextExam?.id).toBe("nearest");
    expect(insight(state).daysToExam).toBe(1);
  });
  it("includes an approaching general exam without inventing a subject association", () => {
    const state = initial();
    state.exams = [exam({ subjectId: "" })];
    const action = getMentorOverview(state, now).recommendations[0];
    expect(action).toMatchObject({ target: "agenda", examId: "exam-test" });
    expect(action.subjectId).toBeUndefined();
    expect(action.reason).toContain("sem matéria vinculada");
  });
  it("calculates exam urgency by local calendar days, including year boundaries", () => {
    const date = new Date(2026, 11, 31, 23, 55),
      state = createInitialState(date);
    state.exams = [exam({ date: "2027-01-01" })];
    expect(insight(state, date).daysToExam).toBe(1);
  });
  it("uses actual subject, card, lesson and exam IDs in every plan action", () => {
    const state = practiced(3, { dueAt: now.toISOString() });
    state.cards[0].flag = "outdated";
    state.cards[1].flag = "relearn";
    state.exams = [exam()];
    const overview = getMentorOverview(state, now, subject);
    expect(
      overview.recommendations.some((action) =>
        action.id.startsWith("source:"),
      ),
    ).toBe(true);
    for (const action of overview.recommendations) {
      if (action.subjectId)
        expect(
          state.subjects.some((subject) => subject.id === action.subjectId),
        ).toBe(true);
      if (action.cardId)
        expect(state.cards.some((card) => card.id === action.cardId)).toBe(
          true,
        );
      if (action.lessonId)
        expect(
          state.lessons.some((lesson) => lesson.id === action.lessonId),
        ).toBe(true);
      if (action.examId)
        expect(state.exams.some((exam) => exam.id === action.examId)).toBe(
          true,
        );
    }
  });
  it("continues an in-progress lesson before another new lesson and never chooses completed lessons", () => {
    const state = initial();
    state.cards = [];
    state.lessons.find((lesson) => lesson.id === "240830:aula:00")!.status =
      "done";
    state.lessons.find((lesson) => lesson.id === "240830:aula:05")!.status =
      "in-progress";
    expect(
      getMentorOverview(state, now, subject).recommendations[0].lessonId,
    ).toBe("240830:aula:05");
  });
  it("honors filtering and offers no nonexistent subject links for invalid filters", () => {
    const state = initial(),
      overview = getMentorOverview(state, now, "literatura");
    expect(overview.subjects).toHaveLength(1);
    expect(overview.subjects[0].name).toBe("Literatura");
    expect(
      overview.recommendations.every(
        (action) => !action.subjectId || action.subjectId === "literatura",
      ),
    ).toBe(true);
    expect(getMentorOverview(state, now, "missing")).toMatchObject({
      subjects: [],
      recommendations: [],
    });
  });
  it("counts study minutes actually recorded without future entries or made-up lessons", () => {
    const state = initial();
    state.sessions = [
      {
        id: "focus",
        subjectId: subject,
        lessonId: "",
        durationMinutes: 20.5,
        kind: "focus",
        completedAt: now.toISOString(),
      },
      {
        id: "future",
        subjectId: subject,
        lessonId: "",
        durationMinutes: 30,
        kind: "focus",
        completedAt: "2099-01-01T00:00:00Z",
      },
    ];
    expect(insight(state)).toMatchObject({
      studyMinutes: 20.5,
      lessonsDone: 0,
      reviewedCards: 0,
      status: "Construindo base",
    });
  });
  it("is deterministic and never mutates user data", () => {
    const state = initial(),
      before = JSON.stringify(state);
    expect(getMentorOverview(state, now)).toEqual(
      getMentorOverview(state, now),
    );
    answerMentor(state, "O que estudar hoje?", now);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("local Portuguese mentor responses", () => {
  it.each([
    "O que estudar hoje?",
    "Monte meu plano",
    "Por onde começo?",
    "Qual a prioridade agora?",
  ])("offers a transparent plan for %s", (message) => {
    const result = answerMentor(initial(), message, now);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.text).toContain("não mede domínio");
  });
  it("reports unknown level without inventing a mastery score", () => {
    const result = answerMentor(
      initial(),
      "Qual meu nível em Literatura?",
      now,
    );
    expect(result.subjectId).toBe("literatura");
    expect(result.text).toContain("Retenção ainda desconhecida");
    expect(result.text).not.toContain("0%");
    expect(result.text).toContain("não uma nota de domínio");
  });
  it("matches accent-insensitive subject names and common course aliases", () => {
    expect(
      answerMentor(initial(), "Meu nivel em Portugues", now).subjectId,
    ).toBe("lingua-portuguesa-e-redacao");
    expect(answerMentor(initial(), "Como estou na Mauá?", now).subjectId).toBe(
      "ciencia-da-computacao",
    );
    expect(answerMentor(initial(), "Literatura", now, subject).subjectId).toBe(
      "literatura",
    );
  });
  it("does not read TI letters inside unrelated words as a subject alias", () => {
    expect(
      answerMentor(initial(), "preciso de motivação", now).subjectId,
    ).toBeUndefined();
  });
  it("describes recorded lapses rather than claiming current memory loss", () => {
    const state = practiced(5, { lapses: 1, dueAt: now.toISOString() });
    const result = answerMentor(state, "Estou esquecendo banco de dados?", now);
    expect(result.text).toContain("5 cartões");
    expect(result.text).toContain(
      "Um erro antigo não prova esquecimento agora",
    );
    expect(result.text).toContain("não indica que a fonte ficou desatualizada");
    expect(result.actions[0].target).toBe("reviews");
  });
  it.each(["Onde preciso melhorar?", "Tenho dúvidas no assunto"])(
    "handles difficulty prompts without falling back: %s",
    (message) => {
      expect(answerMentor(initial(), message, now).text).toContain(
        "Ainda não há respostas suas",
      );
    },
  );
  it("treats no source flags as unknown freshness rather than confirmed freshness", () => {
    const result = answerMentor(
      initial(),
      "Meu material está desatualizado?",
      now,
    );
    expect(result.text).toContain(
      "Isso não garante que o conteúdo esteja atualizado",
    );
    expect(result.text).toContain("não detecto mudanças");
  });
  it("explains outdated flags as requests to check source, never automatic detections", () => {
    const state = initial();
    state.cards[0].flag = "outdated";
    const result = answerMentor(state, "Tenho fonte defasada?", now);
    expect(result.text).toContain("1 cartão marcado");
    expect(result.text).toContain("não confirma que o conteúdo mudou");
    expect(result.actions[0].cardId).toBe(state.cards[0].id);
  });
  it("shows actual exam dates and supports general exams in a subject filter", () => {
    const state = initial();
    state.exams = [exam({ subjectId: "", date: "2026-09-20" })];
    const result = answerMentor(
      state,
      "Quais são minhas provas?",
      now,
      subject,
    );
    expect(result.text).toContain("20/09/2026, 19:00");
    expect(result.actions[0].examId).toBe("exam-test");
    expect(answerMentor(initial(), "Tenho provas?", now).text).toContain(
      "Ainda não há provas futuras",
    );
  });
  it("uses logged time and real configured goals, including a completed daily goal", () => {
    const state = initial();
    state.sessions = [
      {
        id: "study",
        subjectId: subject,
        lessonId: "",
        durationMinutes: 35,
        completedAt: now.toISOString(),
        kind: "focus",
      },
    ];
    expect(answerMentor(state, "Quanto tempo tenho hoje?", now).text).toContain(
      "35 minutos de estudo registrados",
    );
    expect(answerMentor(state, "Quanto tempo tenho hoje?", now).text).toContain(
      "já foi atingida",
    );
    expect(answerMentor(initial(), "Tempo de foco", now).text).toContain(
      "faltam cerca de 30 minutos",
    );
  });
  it("states its local capabilities for unsupported questions", () => {
    const result = answerMentor(initial(), "Qual é a cotação do dólar?", now);
    expect(result.text).toContain("orientadora local");
    expect(result.text).toContain("Não converso com um serviço de IA");
  });
  it("never claims knowledge of subject content from the number of logged sessions", () => {
    const state = initial();
    state.sessions = [
      {
        id: "many",
        subjectId: subject,
        lessonId: "",
        durationMinutes: 1000,
        kind: "focus",
        completedAt: now.toISOString(),
      },
    ];
    expect(
      answerMentor(state, "Meu nível em banco de dados", now).text,
    ).toContain("Retenção ainda desconhecida");
  });
});
