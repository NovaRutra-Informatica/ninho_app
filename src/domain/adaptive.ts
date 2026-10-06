import type { AppState } from "../shared/types";
import { localDate } from "./index";
import { profileDaysLabel } from "../shared/profile";
import type { ActivityDay } from "./activity";
export interface AdaptiveSignal {
  id: string;
  title: string;
  summary: string;
  evidence: string[];
  limit: string;
  target: "focus" | "studies" | "reviews" | "profile" | "progress";
  action: string;
  subjectId?: string;
}
const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export function adaptiveOverview(
  state: AppState,
  activity: ActivityDay[],
  now = new Date(),
  subjectId?: string,
) {
  const today = localDate(now),
    cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 27);
  cutoff.setHours(0, 0, 0, 0);
  const sessions = state.sessions.filter(
    (s) =>
      (!subjectId || s.subjectId === subjectId) &&
      s.durationMinutes > 0 &&
      Date.parse(s.completedAt) >= cutoff.getTime() &&
      Date.parse(s.completedAt) <= now.getTime(),
  );
  const days = new Set(sessions.map((s) => localDate(new Date(s.completedAt))));
  const todayMinutes = state.sessions
    .filter(
      (s) =>
        s.durationMinutes > 0 &&
        Date.parse(s.completedAt) <= now.getTime() &&
        localDate(new Date(s.completedAt)) === today,
    )
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  const profile = state.profile,
    goal = profile?.dailyMinutes ?? state.settings.dailyMinutes,
    session = profile?.sessionMinutes ?? state.settings.focusMinutes;
  const remaining = Math.max(0, goal - todayMinutes),
    suggested = Math.max(1, Math.min(session, Math.ceil(remaining || session)));
  const signals: AdaptiveSignal[] = [];
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    now.getDay()
  ];
  const scheduled = profile?.availableDays.length
    ? profile.availableDays.includes(weekday)
    : null;
  signals.push({
    id: "rhythm",
    title:
      remaining === 0
        ? "Sua meta registrada de hoje foi alcançada"
        : scheduled === false
          ? "Hoje está fora dos dias que você escolheu"
          : `Um bloco de ${suggested} minutos cabe na sua meta`,
    summary:
      remaining === 0
        ? "Você pode encerrar por hoje ou escolher uma revisão, conforme sua disposição."
        : scheduled === false
          ? "Descansar ou fazer um bloco extra é uma escolha sua. Seu planejamento não foi alterado."
          : `Você registrou ${Math.round(todayMinutes)} de ${goal} minutos hoje. ${scheduled === null ? "Seus dias de estudo ainda não foram definidos." : "Hoje é um dos seus dias de estudo."}`,
    evidence: [
      `Meta informada: ${goal} min por dia; bloco informado: ${session} min.`,
      ...(profile?.availableDays.length
        ? [`Dias escolhidos: ${profileDaysLabel(profile.availableDays)}.`]
        : []),
      ...(profile?.preferredTime
        ? [`Horário que você informou: ${profile.preferredTime}.`]
        : []),
    ],
    limit:
      "A meta usa sessões concluídas e registradas. Navegar pelo aplicativo não acrescenta minutos de estudo.",
    target: "focus",
    action: remaining === 0 ? "Abrir temporizador" : "Escolher meu bloco",
  });
  if (!profile?.completedAt || !profile.goal.trim())
    signals.push({
      id: "profile",
      title: "Seu objetivo pode orientar este acompanhamento",
      summary:
        "Conte seu objetivo, rotina e tempo disponível em Meu perfil. Não é necessário instalar um modelo.",
      evidence: ["O perfil ainda não tem um objetivo concluído."],
      limit:
        "O Ninho usa as respostas que você informar; não deduz seus planos pela navegação.",
      target: "profile",
      action: "Completar meu perfil",
    });
  else
    signals.push({
      id: "goal",
      title: "O que você quer construir",
      summary: profile.goal,
      evidence: [
        ...(profile.routine ? [`Rotina informada: ${profile.routine}`] : []),
        ...(profile.targetDate
          ? [`Prazo informado: ${profile.targetDate}`]
          : []),
        ...(profile.preferences
          ? [`O que ajuda você: ${profile.preferences}`]
          : []),
        ...(profile.challenges
          ? [`Dificuldades informadas: ${profile.challenges}`]
          : []),
      ],
      limit:
        "Objetivo e preferências são suas respostas diretas. O motor não interpreta prazos em texto nem cria compromissos sozinho.",
      target: "profile",
      action: "Ajustar meus objetivos",
    });
  const focus = sessions.filter((s) => s.kind === "focus"),
    focusDays = new Set(focus.map((s) => localDate(new Date(s.completedAt))));
  if (focus.length >= 5 && focusDays.size >= 3) {
    const lengths = focus.map((s) => s.durationMinutes).sort((a, b) => a - b),
      middle = Math.floor(lengths.length / 2),
      median =
        lengths.length % 2
          ? lengths[middle]
          : (lengths[middle - 1] + lengths[middle]) / 2;
    if (median < session * 0.7)
      signals.push({
        id: "blocks",
        title: "Seus blocos registrados foram menores",
        summary: `A mediana recente é ${Math.round(median)} min, e seu bloco configurado é ${session} min. Você pode experimentar um bloco mais curto.`,
        evidence: [
          `${focus.length} sessões de foco, em ${focusDays.size} dias, nos últimos 28 dias.`,
          `Regra: ao menos 5 sessões em 3 dias; mediana abaixo de 70% do bloco informado.`,
        ],
        limit:
          "Sessões curtas não revelam distração, dificuldade ou sua causa. A duração não muda automaticamente.",
        target: "focus",
        action: "Ajustar meu próximo bloco",
      });
  }
  if (sessions.length >= 6 && days.size >= 3) {
    const buckets = [0, 0, 0, 0];
    for (const s of sessions)
      buckets[Math.floor(new Date(s.completedAt).getHours() / 6)]++;
    const largest = Math.max(...buckets),
      index = buckets.indexOf(largest);
    if (largest / sessions.length >= 0.6)
      signals.push({
        id: "schedule",
        title: `Mais conclusões ${["de madrugada", "pela manhã", "à tarde", "à noite"][index]}`,
        summary: `${largest} de ${sessions.length} sessões registradas terminaram nesse período. Esse horário pode ser uma referência ao planejar sua rotina.`,
        evidence: [
          `Últimos 28 dias; ${days.size} dias com sessões.`,
          `Regra: ao menos 6 sessões em 3 dias e 60% das conclusões no mesmo período.`,
        ],
        limit:
          "São horários de conclusão, não de início. Isso não demonstra maior produtividade nem aprendizado nesse horário.",
        target: "profile",
        action: "Conferir minha rotina",
      });
  }
  const gaps = state.subjects
    .filter((s) => !subjectId || s.id === subjectId)
    .map((subject) => {
      const dates = [
        ...state.sessions
          .filter(
            (s) =>
              s.subjectId === subject.id &&
              (s.durationMinutes > 0 || s.kind === "review"),
          )
          .map((s) => s.completedAt),
        ...state.cards
          .filter((c) => c.subjectId === subject.id && c.lastReviewedAt)
          .map((c) => c.lastReviewedAt!),
      ]
        .filter((at) => Date.parse(at) <= now.getTime())
        .sort((a, b) => Date.parse(b) - Date.parse(a));
      return {
        subject,
        last: dates[0],
        gap: dates[0]
          ? dayNumber(today) - dayNumber(localDate(new Date(dates[0])))
          : 0,
      };
    })
    .filter((item) => item.gap >= 7)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);
  for (const { subject, last, gap } of gaps)
    signals.push({
      id: `gap:${subject.id}`,
      title: `Reencontrar ${subject.name}`,
      summary: `Faz ${gap} dias desde o último registro desta matéria no Ninho. Confira se faz sentido retomá-la.`,
      evidence: [
        `Última sessão ou revisão registrada: ${localDate(new Date(last))}.`,
        `Regra: intervalo de pelo menos 7 dias desde um registro existente.`,
      ],
      limit:
        "Ausência de registro não significa que você não estudou fora do aplicativo, nem comprova esquecimento.",
      target: "studies",
      subjectId: subject.id,
      action: "Abrir esta matéria",
    });
  const recentActivity = activity.filter(
      (a) => a.date >= localDate(cutoff) && a.date <= today,
    ),
    active = recentActivity.reduce((sum, a) => sum + a.activeSeconds, 0),
    visits = recentActivity.reduce((sum, a) => sum + a.visits, 0),
    pauses = recentActivity.reduce((sum, a) => sum + a.focusPauses, 0),
    pauseDays = new Set(
      recentActivity.filter((a) => a.focusPauses > 0).map((a) => a.date),
    );
  if (pauses >= 3 && pauseDays.size >= 2)
    signals.push({
      id: "pauses",
      title: "Você usou a pausa no cronômetro",
      summary: `Foram ${pauses} pausas manuais em ${pauseDays.size} dias. Se os blocos estiverem longos, você pode ajustar a próxima sessão.`,
      evidence: [
        "Contagem dos cliques em Pausar durante foco, nos últimos 28 dias.",
        "Regra: pelo menos 3 pausas em 2 dias.",
      ],
      limit:
        "Pausar não indica desatenção. Trocar de janela não é registrado como pausa do cronômetro.",
      target: "focus",
      action: "Conferir meu bloco",
    });
  return {
    signals,
    samples: {
      sessions: sessions.length,
      days: days.size,
      minutes: Math.round(
        sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
      ),
      activeMinutes: Math.floor(active / 60),
      visits,
    },
    gaps: [
      "Esta versão registra cartões de revisão, mas não tentativas de um banco de questões; não calcula taxa de acerto em questões.",
      ...(sessions.length < 6 || days.size < 3
        ? [
            `Ainda há poucos registros para observar horários: ${sessions.length} sessões em ${days.size} dias; são necessários ao menos 6 em 3 dias.`,
          ]
        : []),
    ],
  };
}
