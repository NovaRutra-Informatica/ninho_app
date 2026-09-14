import type { AppState, Exam, ReviewCard, Subject } from "../shared/types";
import { getDueCards, localDate } from "./index";

export type MentorStatus =
  | "Ainda sem evidência"
  | "Construindo base"
  | "Em consolidação"
  | "Em dia"
  | "Revisão necessária"
  | "Conferir fonte";
export interface MentorAction {
  id: string;
  label: string;
  reason: string;
  target: "reviews" | "studies" | "agenda" | "focus" | "progress";
  subjectId?: string;
  cardId?: string;
  lessonId?: string;
  examId?: string;
}
export interface SubjectInsight {
  subjectId: string;
  name: string;
  status: MentorStatus;
  signals: string[];
  priority: number;
  priorityFactors: { label: string; points: number }[];
  confidence: "sem evidência" | "baixa" | "moderada" | "ampla";
  confidenceReason: string;
  reviewedCards: number;
  totalCards: number;
  dueCards: number;
  flaggedCards: number;
  outdatedCards: number;
  relearnCards: number;
  lessonsDone: number;
  totalLessons: number;
  studyMinutes: number;
  coveragePercent: number | null;
  reviewAttempts: number;
  cardsWithLapses: number;
  stableCards: number;
  oldestOverdueDays: number;
  nextExam?: Exam;
  daysToExam?: number;
}
export interface MentorOverview {
  subjects: SubjectInsight[];
  recommendations: MentorAction[];
  summary: string;
  limits: string[];
}
export interface MentorReply {
  text: string;
  actions: MentorAction[];
  subjectId?: string;
}

const limits = [
  "O diagnóstico resume registros do Ninho; não mede seu domínio real da matéria nem prevê nota em prova.",
  "Cobertura significa cartões que você já praticou, não percentual de conhecimento. Aulas concluídas são marcações suas.",
  "Atraso de revisão sugere uma oportunidade de praticar. Conteúdo desatualizado precisa ser conferido na fonte; não é detectado automaticamente.",
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const plural = (count: number, singular: string, multiple: string) =>
  `${count} ${count === 1 ? singular : multiple}`;
const dayNumber = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};
const daysBetween = (from: string, to: string) =>
  Math.round(dayNumber(to) - dayNumber(from));
const reviewed = (card: ReviewCard) => card.lastReviewedAt !== null;

function subjectInsight(
  state: AppState,
  subject: Subject,
  now: Date,
): SubjectInsight {
  const today = localDate(now),
    cards = state.cards.filter((card) => card.subjectId === subject.id);
  const practiced = cards.filter(reviewed);
  const due = practiced.filter(
    (card) => !card.suspended && Date.parse(card.dueAt) <= now.getTime(),
  );
  const outdated = cards.filter((card) => card.flag === "outdated"),
    relearn = cards.filter((card) => card.flag === "relearn");
  const lessons = state.lessons.filter(
    (lesson) => lesson.subjectId === subject.id,
  );
  const lessonsDone = lessons.filter(
    (lesson) => lesson.status === "done",
  ).length;
  const studyMinutes = state.sessions
    .filter(
      (session) =>
        session.subjectId === subject.id &&
        Date.parse(session.completedAt) <= now.getTime(),
    )
    .reduce((sum, session) => sum + session.durationMinutes, 0);
  const reviewAttempts = practiced.reduce(
    (sum, card) => sum + card.repetitions,
    0,
  );
  const cardsWithLapses = practiced.filter((card) => card.lapses > 0).length;
  const stableCards = practiced.filter(
    (card) => card.repetitions >= 3 && card.intervalDays >= 7,
  ).length;
  const coveragePercent = cards.length
    ? Math.round((practiced.length / cards.length) * 100)
    : null;
  const nextExam = state.exams
    .filter(
      (exam) =>
        exam.subjectId === subject.id && !exam.completed && exam.date >= today,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.time.localeCompare(b.time) ||
        a.id.localeCompare(b.id),
    )[0];
  const daysToExam = nextExam ? daysBetween(today, nextExam.date) : undefined;
  const oldestOverdueDays = Math.max(
    0,
    ...due.map((card) => daysBetween(localDate(new Date(card.dueAt)), today)),
  );
  let status: MentorStatus;
  if (outdated.length) status = "Conferir fonte";
  else if (due.length || relearn.length) status = "Revisão necessária";
  else if (!practiced.length && !lessonsDone && !studyMinutes)
    status = "Ainda sem evidência";
  else if (practiced.length < 5 || (coveragePercent ?? 0) < 25)
    status = "Construindo base";
  else if (
    practiced.length >= 5 &&
    stableCards >= practiced.length / 2 &&
    (coveragePercent ?? 0) >= 50
  )
    status = "Em dia";
  else status = "Em consolidação";
  const confidence =
    practiced.length === 0
      ? "sem evidência"
      : practiced.length < 5
        ? "baixa"
        : practiced.length < 20
          ? "moderada"
          : "ampla";
  const confidenceReason = `${plural(practiced.length, "cartão praticado", "cartões praticados")} e ${plural(reviewAttempts, "resposta registrada", "respostas registradas")}. ${practiced.length === 0 ? "Ainda não há respostas para observar a retenção." : "A amostra descreve somente esses cartões, não toda a matéria."}`;
  const signals: string[] = [];
  if (!cards.length)
    signals.push(
      "Nenhum cartão cadastrado nesta matéria; retenção ainda desconhecida.",
    );
  else if (!practiced.length)
    signals.push(
      `${plural(cards.length, "cartão disponível", "cartões disponíveis")}, ainda sem respostas suas.`,
    );
  else
    signals.push(
      `${practiced.length} de ${cards.length} cartões já praticados (${coveragePercent}% de cobertura dos cartões).`,
    );
  if (due.length)
    signals.push(
      `${plural(due.length, "revisão prevista", "revisões previstas")} para agora${oldestOverdueDays > 0 ? `; o maior atraso é de ${plural(oldestOverdueDays, "dia", "dias")}` : ""}.`,
    );
  if (cardsWithLapses)
    signals.push(
      `${plural(cardsWithLapses, "cartão teve", "cartões tiveram")} ao menos um “Não lembrei” no histórico; isso não prova esquecimento atual.`,
    );
  if (outdated.length)
    signals.push(
      `${plural(outdated.length, "cartão marcado", "cartões marcados")} para conferir atualização da fonte.`,
    );
  if (relearn.length)
    signals.push(
      `${plural(relearn.length, "cartão marcado", "cartões marcados")} para reaprender.`,
    );
  if (lessons.length)
    signals.push(
      `${lessonsDone} de ${lessons.length} aulas marcadas como concluídas.`,
    );
  if (nextExam)
    signals.push(
      `Prova cadastrada: ${nextExam.title}, ${daysToExam === 0 ? "hoje" : `em ${plural(daysToExam!, "dia", "dias")}`}.`,
    );
  const priorityFactors: SubjectInsight["priorityFactors"] = [];
  if (due.length)
    priorityFactors.push({
      label: "Revisões previstas: 4 pontos cada, até 36",
      points: Math.min(36, due.length * 4),
    });
  if (oldestOverdueDays > 0)
    priorityFactors.push({
      label: "Maior atraso: 1 ponto por dia, até 10",
      points: Math.min(10, oldestOverdueDays),
    });
  if (outdated.length)
    priorityFactors.push({
      label: "Fonte marcada para conferir: 5 pontos por cartão, até 25",
      points: Math.min(25, outdated.length * 5),
    });
  if (relearn.length)
    priorityFactors.push({
      label: "Reaprender: 4 pontos por cartão, até 16",
      points: Math.min(16, relearn.length * 4),
    });
  if (daysToExam !== undefined && daysToExam <= 30)
    priorityFactors.push({
      label:
        "Prova próxima: até 2 dias = 40; até 7 = 30; até 14 = 20; até 30 = 10",
      points:
        daysToExam <= 2
          ? 40
          : daysToExam <= 7
            ? 30
            : daysToExam <= 14
              ? 20
              : 10,
    });
  if (lessons.some((lesson) => lesson.status !== "done"))
    priorityFactors.push({
      label: "Há uma próxima aula disponível",
      points: 8,
    });
  return {
    subjectId: subject.id,
    name: subject.name,
    status,
    signals,
    priority: Math.min(
      100,
      priorityFactors.reduce((sum, factor) => sum + factor.points, 0),
    ),
    priorityFactors,
    confidence,
    confidenceReason,
    reviewedCards: practiced.length,
    totalCards: cards.length,
    dueCards: due.length,
    flaggedCards: outdated.length + relearn.length,
    outdatedCards: outdated.length,
    relearnCards: relearn.length,
    lessonsDone,
    totalLessons: lessons.length,
    studyMinutes,
    coveragePercent,
    reviewAttempts,
    cardsWithLapses,
    stableCards,
    oldestOverdueDays,
    ...(nextExam ? { nextExam, daysToExam } : {}),
  };
}

function actionsForSubject(
  state: AppState,
  insight: SubjectInsight,
  now: Date,
): MentorAction[] {
  const subjectId = insight.subjectId,
    actions: MentorAction[] = [];
  const cards = state.cards.filter((card) => card.subjectId === subjectId);
  const flagged = cards.find((card) => card.flag === "outdated");
  if (flagged)
    actions.push({
      id: `source:${flagged.id}`,
      label: `Conferir fonte · ${insight.name}`,
      reason: `${plural(insight.outdatedCards, "cartão marcado", "cartões marcados")} para atualização. Abra a referência original; o Ninho não verificou mudanças.`,
      target: "reviews",
      subjectId,
      cardId: flagged.id,
      ...(flagged.lessonId ? { lessonId: flagged.lessonId } : {}),
    });
  const due = cards
    .filter(
      (card) =>
        reviewed(card) &&
        !card.suspended &&
        Date.parse(card.dueAt) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id),
    );
  if (due.length)
    actions.push({
      id: `review:${subjectId}`,
      label: `Revisar · ${insight.name}`,
      reason: `${plural(due.length, "cartão chegou", "cartões chegaram")} à data prevista pelo agendador.`,
      target: "reviews",
      subjectId,
      cardId: due[0].id,
      ...(due[0].lessonId ? { lessonId: due[0].lessonId } : {}),
    });
  const relearn = cards.find((card) => card.flag === "relearn");
  if (relearn)
    actions.push({
      id: `relearn:${relearn.id}`,
      label: `Retomar uma dificuldade · ${insight.name}`,
      reason:
        "Você marcou este cartão para reaprender. Volte à explicação e tente responder de novo.",
      target: relearn.lessonId ? "studies" : "reviews",
      subjectId,
      cardId: relearn.id,
      ...(relearn.lessonId ? { lessonId: relearn.lessonId } : {}),
    });
  if (insight.nextExam && insight.daysToExam! <= 30)
    actions.push({
      id: `exam:${insight.nextExam.id}`,
      label: `Planejar prova · ${insight.nextExam.title}`,
      reason:
        insight.daysToExam === 0
          ? "A prova está cadastrada para hoje. Confira horário e local."
          : `Faltam ${plural(insight.daysToExam!, "dia", "dias")} para a data cadastrada.`,
      target: "agenda",
      subjectId,
      examId: insight.nextExam.id,
    });
  const lesson = state.lessons
    .filter(
      (lesson) => lesson.subjectId === subjectId && lesson.status !== "done",
    )
    .sort(
      (a, b) =>
        (a.status === "in-progress" ? -1 : 0) -
          (b.status === "in-progress" ? -1 : 0) ||
        a.courseId.localeCompare(b.courseId) ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    )[0];
  if (lesson)
    actions.push({
      id: `lesson:${lesson.id}`,
      label: `${lesson.status === "in-progress" ? "Continuar" : "Abrir próxima aula"} · ${insight.name}`,
      reason: `${lesson.title}${lesson.description ? ` — ${lesson.description}` : ""}`,
      target: "studies",
      subjectId,
      lessonId: lesson.id,
    });
  if (!due.length && !flagged && !relearn) {
    const fresh = getDueCards(state, now, subjectId).filter(
      (card) => !reviewed(card),
    );
    if (fresh.length)
      actions.push({
        id: `new:${subjectId}`,
        label: `Praticar cartões · ${insight.name}`,
        reason: `${plural(fresh.length, "cartão novo disponível", "cartões novos disponíveis")} dentro do limite diário global. Comece pelos assuntos que você já estudou.`,
        target: "reviews",
        subjectId,
        cardId: fresh[0].id,
        ...(fresh[0].lessonId ? { lessonId: fresh[0].lessonId } : {}),
      });
  }
  return actions;
}

export function getMentorOverview(
  state: AppState,
  now: Date = new Date(),
  subjectId?: string,
): MentorOverview {
  localDate(now);
  const subjects = state.subjects
    .filter((subject) => !subjectId || subject.id === subjectId)
    .map((subject) => subjectInsight(state, subject, now))
    .sort(
      (a, b) =>
        b.priority - a.priority || a.name.localeCompare(b.name, "pt-BR"),
    );
  const allActions = subjects.map((insight) =>
    actionsForSubject(state, insight, now),
  );
  // Give the highest-priority subjects one next step each before filling remaining slots.
  const recommendations = allActions
    .map((actions) => actions[0])
    .filter((action): action is MentorAction => Boolean(action));
  for (const actions of allActions)
    for (const action of actions.slice(1))
      if (recommendations.length < 5) recommendations.push(action);
  const generalExam = !subjectId
    ? state.exams
        .filter(
          (exam) =>
            !exam.subjectId &&
            !exam.completed &&
            exam.date >= localDate(now) &&
            daysBetween(localDate(now), exam.date) <= 30,
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        )[0]
    : undefined;
  if (generalExam)
    recommendations.unshift({
      id: `exam:${generalExam.id}`,
      label: `Planejar prova · ${generalExam.title}`,
      reason: `Prova cadastrada para ${generalExam.date.split("-").reverse().join("/")}, ainda sem matéria vinculada. Confira a agenda e associe uma matéria para orientar o plano.`,
      target: "agenda",
      examId: generalExam.id,
    });
  const selected = recommendations.slice(0, 5);
  if (subjects.length && selected.length < 5)
    selected.push({
      id: "focus",
      label: `Reservar ${state.settings.focusMinutes} minutos de foco`,
      reason: `Sua meta diária está configurada em ${state.settings.dailyMinutes} minutos. O cronômetro registra somente o tempo concluído.`,
      target: "focus",
      ...(subjectId ? { subjectId } : {}),
    });
  const practiced = subjects.reduce(
      (sum, insight) => sum + insight.reviewedCards,
      0,
    ),
    due = subjects.reduce((sum, insight) => sum + insight.dueCards, 0);
  const summary = !subjects.length
    ? "Nenhuma matéria encontrada para este filtro."
    : practiced === 0
      ? `Ainda não há respostas suas ${subjectId ? "nesta matéria" : "nos cartões"}. Podemos começar com uma aula e construir um histórico aos poucos.`
      : `${plural(practiced, "cartão já praticado", "cartões já praticados")} ${subjectId ? "nesta matéria" : "nas matérias"}. ${plural(due, "revisão prevista", "revisões previstas")} para agora. Esse retrato se limita ao que foi registrado no Ninho.`;
  return { subjects, recommendations: selected, summary, limits: [...limits] };
}

function matchSubject(
  state: AppState,
  message: string,
  selected?: string,
): string | undefined {
  const normalized = normalize(message);
  const explicit = [...state.subjects]
    .sort((a, b) => b.name.length - a.name.length)
    .find((subject) => normalized.includes(normalize(subject.name)));
  if (explicit) return explicit.id;
  const aliases: Record<string, string[]> = {
    "banco-de-dados": ["banco de dados", "bancos de dados", "sql"],
    "lingua-portuguesa-e-redacao": ["portugues", "redacao"],
    "raciocinio-logico-matematico": ["raciocinio logico", "matematica", "rlm"],
    "ciencia-da-computacao": ["faculdade", "maua", "computacao"],
    "gestao-e-governanca-de-ti": ["governanca"],
    "seguranca-da-informacao": ["seguranca"],
  };
  const alias = state.subjects.find((subject) =>
    (aliases[subject.id] ?? []).some((term) =>
      new RegExp(`(?:^|[^a-z0-9])${term}(?:$|[^a-z0-9])`).test(normalized),
    ),
  );
  return (
    alias?.id ??
    (state.subjects.some((subject) => subject.id === selected)
      ? selected
      : undefined)
  );
}

export function answerMentor(
  state: AppState,
  message: string,
  now: Date = new Date(),
  selectedSubjectId?: string,
): MentorReply {
  const subjectId = matchSubject(state, message, selectedSubjectId),
    query = normalize(message.trim());
  const overview = getMentorOverview(state, now, subjectId);
  const insights = overview.subjects;
  const scope = subjectId
    ? `em ${insights[0]?.name ?? "esta matéria"}`
    : "nas suas matérias";
  let text: string,
    actions: MentorAction[] = [];
  if (/desatualiz|atualiz|defasad|fonte|mudou/.test(query)) {
    const outdated = insights.reduce(
      (sum, insight) => sum + insight.outdatedCards,
      0,
    );
    text = outdated
      ? `Há ${plural(outdated, "cartão marcado", "cartões marcados")} para conferir fonte ${scope}. Essa marcação pede uma checagem no material original; não confirma que o conteúdo mudou. Eu não consulto atualizações da internet automaticamente.`
      : `Não há cartões marcados para conferir fonte ${scope}. Isso não garante que o conteúdo esteja atualizado. Eu não detecto mudanças em leis, editais ou tecnologias; marque “Conferir fonte” quando quiser checar a referência original.`;
    actions = insights
      .flatMap((insight) => actionsForSubject(state, insight, now))
      .filter((action) => action.id.startsWith("source:"));
    if (!actions.length)
      actions = [
        {
          id: "sources",
          label: "Ver meus cartões e fontes",
          reason: "Marque os conteúdos que precisam de conferência.",
          target: "reviews",
          ...(subjectId ? { subjectId } : {}),
        },
      ];
  } else if (/prova|exame|avaliacao/.test(query)) {
    const exams = state.exams
      .filter(
        (exam) =>
          !exam.completed &&
          exam.date >= localDate(now) &&
          (!subjectId || exam.subjectId === subjectId || !exam.subjectId),
      )
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      );
    text = exams.length
      ? `Suas próximas provas cadastradas: ${exams
          .slice(0, 3)
          .map(
            (exam) =>
              `${exam.title} (${exam.date.split("-").reverse().join("/")}${exam.time ? `, ${exam.time}` : ""})`,
          )
          .join(
            "; ",
          )}. Posso priorizar os registros dessas matérias, mas não prever seu resultado.`
      : "Ainda não há provas futuras cadastradas neste recorte. Cadastre data, matéria e horário na agenda para que eu considere a proximidade no plano.";
    actions = [
      {
        id: "agenda",
        label: exams.length ? "Abrir agenda de provas" : "Cadastrar uma prova",
        reason: "As datas vêm exclusivamente dos seus registros.",
        target: "agenda",
        ...(subjectId ? { subjectId } : {}),
        ...(exams[0] ? { examId: exams[0].id } : {}),
      },
    ];
  } else if (/esquec|lembr|retenc|dificuld|erro|melhor|duvid/.test(query)) {
    const due = insights.reduce((sum, insight) => sum + insight.dueCards, 0),
      lapses = insights.reduce(
        (sum, insight) => sum + insight.cardsWithLapses,
        0,
      ),
      practiced = insights.reduce(
        (sum, insight) => sum + insight.reviewedCards,
        0,
      );
    text = !practiced
      ? `Ainda não há respostas suas ${scope} para observar dificuldades. Depois de estudar um assunto, pratique alguns cartões e use “Não lembrei” quando realmente não recuperar a resposta.`
      : `${plural(due, "cartão chegou", "cartões chegaram")} à data de revisão ${scope}. ${plural(lapses, "cartão tem", "cartões têm")} “Não lembrei” no histórico. Um erro antigo não prova esquecimento agora; uma revisão permite conferir. Isso também não indica que a fonte ficou desatualizada.`;
    actions = insights
      .flatMap((insight) => actionsForSubject(state, insight, now))
      .filter((action) => /^(review|relearn|new):/.test(action.id));
  } else if (
    /nivel|dominio|evolu|como estou|desempenho|situacao/.test(query) ||
    (subjectId && !/estud|plano|hoje|agora|tempo|minuto|foco/.test(query))
  ) {
    text =
      insights
        .map(
          (insight) =>
            `${insight.name}: ${insight.status}. ${insight.reviewedCards ? `${insight.reviewedCards}/${insight.totalCards} cartões praticados; evidência ${insight.confidence}.` : "Retenção ainda desconhecida, sem respostas registradas."}`,
        )
        .slice(0, subjectId ? 1 : 5)
        .join("\n") +
      "\nIsso descreve seus registros de estudo, não uma nota de domínio ou uma previsão de prova.";
    actions = [
      {
        id: "progress",
        label: "Ver meu progresso registrado",
        reason: "Compare as sessões e aulas que você registrou.",
        target: "progress",
        ...(subjectId ? { subjectId } : {}),
      },
    ];
  } else if (/tempo|minuto|foco|rotina|min\b/.test(query)) {
    const today = localDate(now),
      minutes = state.sessions
        .filter(
          (session) =>
            localDate(new Date(session.completedAt)) === today &&
            Date.parse(session.completedAt) <= now.getTime(),
        )
        .reduce((sum, session) => sum + session.durationMinutes, 0);
    const remaining = Math.max(0, state.settings.dailyMinutes - minutes);
    text = `Hoje há ${Math.floor(minutes)} minutos de estudo registrados. Sua meta é ${state.settings.dailyMinutes} minutos${remaining > 0 ? `; faltam cerca de ${Math.ceil(remaining)} minutos para ela` : " e ela já foi atingida"}. O foco está configurado em ${state.settings.focusMinutes} minutos, com pausa de ${state.settings.breakMinutes}. Você pode pausar ou encerrar antes; o registro considera o tempo concluído.`;
    actions = [
      {
        id: "focus",
        label: "Abrir cronômetro de foco",
        reason: "Escolha um assunto e registre uma sessão no seu ritmo.",
        target: "focus",
        ...(subjectId ? { subjectId } : {}),
      },
    ];
  } else if (/estud|plano|hoje|agora|comec|priorid|proxim/.test(query)) {
    text = `${overview.summary}\nMinha sugestão é seguir os próximos passos abaixo. A ordem usa revisões previstas, suas marcações, aulas pendentes e proximidade das provas cadastradas; ela não mede domínio.`;
    actions = overview.recommendations;
  } else {
    text =
      "Sou a Íris, uma orientadora local baseada nos seus registros. Posso sugerir o que estudar, mostrar evidências por matéria, apontar revisões previstas, lembrar provas cadastradas e ajudar a organizar seu tempo. Experimente “o que estudar hoje?”, “meu nível em Literatura” ou “há fontes para conferir?”. Não converso com um serviço de IA nem verifico conteúdos novos na internet.";
    actions = overview.recommendations.slice(0, 2);
  }
  return {
    text,
    actions: actions.slice(0, 5),
    ...(subjectId ? { subjectId } : {}),
  };
}
