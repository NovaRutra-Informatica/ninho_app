import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { answerMentor, getMentorOverview } from "../domain";
import { useApp } from "./store";
import { Empty, Owl, prettyDate, ProgressBar } from "./ui";

type NavigationPage = "reviews" | "studies" | "agenda" | "progress";
type MentorAction = ReturnType<
  typeof getMentorOverview
>["recommendations"][number];
type Message = {
  id: number;
  role: "iris" | "user";
  text: string;
  actions: MentorAction[];
  context?: string;
};
const suggestions = [
  "O que estudar hoje?",
  "Onde preciso melhorar?",
  "Esqueci algum assunto?",
  "O que pode estar desatualizado?",
];
const actionIcon = {
  reviews: Brain,
  studies: BookOpen,
  agenda: CalendarDays,
  focus: Timer,
  progress: TrendingUp,
};

export default function Mentor({
  onNavigate,
  openFocus,
}: {
  onNavigate: (
    page: NavigationPage,
    subjectId?: string,
    action?: MentorAction,
  ) => void;
  openFocus: (subjectId?: string) => void;
}) {
  const { state } = useApp();
  const [subjectId, setSubjectId] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [signalFilter, setSignalFilter] = useState("all");
  const nextMessageId = useRef(1);
  const conversation = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const overview = useMemo(
    () => getMentorOverview(state, now, subjectId || undefined),
    [state, now, subjectId],
  );
  const selectedSubject = state.subjects.find(
    (subject) => subject.id === subjectId,
  );
  const totals = overview.subjects.reduce(
    (total, insight) => ({
      reviewed: total.reviewed + insight.reviewedCards,
      due: total.due + insight.dueCards,
      relearn: total.relearn + insight.relearnCards,
      outdated: total.outdated + insight.outdatedCards,
    }),
    { reviewed: 0, due: 0, relearn: 0, outdated: 0 },
  );
  const visibleSubjects = overview.subjects.filter(
    (insight) =>
      signalFilter === "all" ||
      (signalFilter === "review" && insight.dueCards > 0) ||
      (signalFilter === "relearn" && insight.relearnCards > 0) ||
      (signalFilter === "outdated" && insight.outdatedCards > 0) ||
      (signalFilter === "unknown" && insight.reviewedCards === 0),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (conversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages]);

  function takeAction(action: MentorAction) {
    if (action.target === "focus") openFocus(action.subjectId);
    else onNavigate(action.target, action.subjectId, action);
  }

  function openInsight(id: string, dueCards: number, flaggedCards: number) {
    if (flaggedCards) {
      const card =
        state.cards.find(
          (card) => card.subjectId === id && card.flag === "outdated",
        ) ||
        state.cards.find(
          (card) => card.subjectId === id && card.flag === "relearn",
        );
      if (card) {
        takeAction({
          id: `${card.flag === "outdated" ? "source" : "relearn"}:${card.id}`,
          label: "Cuidar das marcações",
          reason: "Abrir os cartões marcados nesta matéria.",
          target: "reviews",
          subjectId: id,
          cardId: card.id,
          ...(card.lessonId ? { lessonId: card.lessonId } : {}),
        });
        return;
      }
    }
    onNavigate(dueCards ? "reviews" : "studies", id);
  }

  function ask(value: string) {
    const text = value.trim().slice(0, 1000);
    if (!text) return;
    const reply = answerMentor(state, text, new Date(), subjectId || undefined);
    const context = selectedSubject?.name || "Todas as matérias";
    setMessages((previous) => [
      ...previous.slice(-20),
      { id: nextMessageId.current++, role: "user", text, actions: [], context },
      {
        id: nextMessageId.current++,
        role: "iris",
        text: reply.text,
        actions: reply.actions,
        context,
      },
    ]);
    setQuestion("");
    input.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  return (
    <section className="page-enter mentor-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">UM OLHAR ATENTO PARA O SEU ESTUDO</span>
          <h1>Seu próximo passo, com a Íris.</h1>
          <p>Transforme seus registros em uma direção simples para hoje.</p>
        </div>
        <span className="badge">
          <ShieldCheck size={15} />
          ASSISTENTE LOCAL
        </span>
      </div>

      <div className="panel mentor-intro">
        <div>
          <span className="eyebrow">MENOS DÚVIDA SOBRE POR ONDE COMEÇAR</span>
          <h2>
            Eu observo seu percurso.
            <br />
            Você constrói o seu conhecimento.
          </h2>
          <p data-testid="mentor-summary">{overview.summary}</p>
          <small>
            Minhas sugestões usam suas revisões, marcações, aulas e provas. São
            indícios do que merece atenção, não uma nota sobre sua capacidade.
          </small>
        </div>
        <Owl happy />
      </div>

      <div className="toolbar mentor-toolbar">
        <label className="field compact">
          Olhar para
          <select
            data-testid="mentor-subject-filter"
            aria-label="Matéria para a Íris analisar"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setSignalFilter("all");
            }}
          >
            <option value="">Todas as matérias</option>
            {state.subjects.map((subject) => (
              <option value={subject.id} key={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <span className="mentor-context">
          <ShieldCheck size={15} />
          Suas informações ficam neste computador.
        </span>
      </div>

      <div className="mentor-summary-grid">
        <article className="panel mentor-stat">
          <Brain size={21} />
          <strong>{totals.reviewed}</strong>
          <span>cartões já praticados</span>
          <small>Base das observações</small>
        </article>
        <button
          className={`panel mentor-stat ${signalFilter === "review" ? "selected" : ""}`}
          aria-label={`${totals.due} revisões vencidas. Filtrar matérias.`}
          aria-pressed={signalFilter === "review"}
          onClick={() =>
            setSignalFilter(signalFilter === "review" ? "all" : "review")
          }
        >
          <Clock3 size={21} />
          <strong>{totals.due}</strong>
          <span>revisões vencidas</span>
          <small>Hora de reencontrar o assunto</small>
        </button>
        <button
          className={`panel mentor-stat ${signalFilter === "relearn" ? "selected" : ""}`}
          aria-label={`${totals.relearn} dúvidas marcadas. Filtrar matérias.`}
          aria-pressed={signalFilter === "relearn"}
          onClick={() =>
            setSignalFilter(signalFilter === "relearn" ? "all" : "relearn")
          }
        >
          <CircleHelp size={21} />
          <strong>{totals.relearn}</strong>
          <span>dúvidas marcadas</span>
          <small>Retomar a explicação</small>
        </button>
        <button
          className={`panel mentor-stat ${signalFilter === "outdated" ? "selected" : ""}`}
          aria-label={`${totals.outdated} fontes para conferir. Filtrar matérias.`}
          aria-pressed={signalFilter === "outdated"}
          onClick={() =>
            setSignalFilter(signalFilter === "outdated" ? "all" : "outdated")
          }
        >
          <ShieldCheck size={21} />
          <strong>{totals.outdated}</strong>
          <span>fontes para conferir</span>
          <small>Atualidade do conteúdo</small>
        </button>
      </div>

      <div className="mentor-layout">
        <div className="mentor-main">
          <article className="panel mentor-plan">
            <div className="section-title">
              <div>
                <span className="eyebrow">UMA COISA DE CADA VEZ</span>
                <h2>Seu plano de agora</h2>
              </div>
              <Target size={23} />
            </div>
            <p className="microcopy">
              Uma sugestão para começar. Você decide o ritmo.
            </p>
            <div className="mentor-action-list">
              {overview.recommendations.map((action, index) => {
                const Icon = actionIcon[action.target];
                return (
                  <button
                    key={action.id}
                    className="mentor-action"
                    data-testid={`mentor-plan-${action.id}`}
                    onClick={() => takeAction(action)}
                  >
                    <span className="mentor-action-index">{index + 1}</span>
                    <span className="mentor-action-copy">
                      <strong>{action.label}</strong>
                      <small>{action.reason}</small>
                    </span>
                    <Icon size={18} />
                    <ArrowRight size={16} />
                  </button>
                );
              })}
              {overview.recommendations.length === 0 && (
                <Empty
                  title="Espaço para um novo passo."
                  text="Registre uma aula ou uma revisão para a Íris acompanhar seu caminho."
                  label="Explorar meus estudos"
                  action={() => onNavigate("studies", subjectId || undefined)}
                />
              )}
            </div>
            <button
              className="button secondary"
              onClick={() => openFocus(subjectId || undefined)}
            >
              <Timer size={17} />
              Reservar {state.settings.focusMinutes} minutos de foco
            </button>
          </article>

          <article className="panel mentor-diagnosis">
            <div className="section-title">
              <div>
                <span className="eyebrow">O QUE OS SEUS REGISTROS MOSTRAM</span>
                <h2>Um olhar por matéria</h2>
              </div>
              <button
                className="link-button"
                onClick={() => onNavigate("progress", subjectId || undefined)}
              >
                Ver progresso
                <ArrowRight size={15} />
              </button>
            </div>
            <label className="field compact">
              Mostrar matérias
              <select
                aria-label="Filtrar sinais do estudo"
                value={signalFilter}
                onChange={(event) => setSignalFilter(event.target.value)}
              >
                <option value="all">Todos os sinais</option>
                <option value="review">Com revisão vencida</option>
                <option value="relearn">Com dúvidas marcadas</option>
                <option value="outdated">Com fontes para conferir</option>
                <option value="unknown">Ainda sem revisões</option>
              </select>
            </label>
            <div className="mentor-subject-list">
              {visibleSubjects.map((insight) => (
                <article
                  className="mentor-subject"
                  data-testid={`mentor-insight-${insight.subjectId}`}
                  key={insight.subjectId}
                >
                  <div className="mentor-subject-heading">
                    <h3>{insight.name}</h3>
                    <span className="mentor-status">{insight.status}</span>
                  </div>
                  <div className="mentor-evidence">
                    <span>
                      <CheckCircle2 size={14} />
                      Evidência: {insight.confidence}
                    </span>
                    <span>
                      {insight.lessonsDone}/{insight.totalLessons} aulas
                      concluídas
                    </span>
                    <span>
                      {Math.round(insight.studyMinutes)} min registrados
                    </span>
                  </div>
                  <div className="mentor-coverage">
                    <div className="row-between">
                      <span>Cartões já praticados</span>
                      <strong>
                        {insight.reviewedCards}/{insight.totalCards}
                      </strong>
                    </div>
                    {insight.coveragePercent !== null ? (
                      <>
                        <ProgressBar
                          value={insight.coveragePercent}
                          color={
                            state.subjects.find(
                              (subject) => subject.id === insight.subjectId,
                            )?.color
                          }
                        />
                        <small>
                          {Math.round(insight.coveragePercent)}% dos cartões já
                          praticados. Isso não mede domínio da matéria.
                        </small>
                      </>
                    ) : (
                      <small>
                        Ainda não há cartões suficientes para calcular a
                        cobertura.
                      </small>
                    )}
                  </div>
                  <ul className="mentor-signals">
                    {insight.signals.map((signal, index) => (
                      <li key={`${index}-${signal}`}>{signal}</li>
                    ))}
                  </ul>
                  {insight.nextExam && (
                    <p className="mentor-exam">
                      <CalendarDays size={15} />
                      {insight.nextExam.title} ·{" "}
                      {prettyDate(insight.nextExam.date)}
                    </p>
                  )}
                  <div className="mentor-subject-footer">
                    <details>
                      <summary>Por que merece essa atenção?</summary>
                      <ul>
                        {insight.priorityFactors.map((factor, index) => (
                          <li key={`${index}-${factor.label}`}>
                            {factor.label}
                          </li>
                        ))}
                        {insight.priorityFactors.length === 0 && (
                          <li>
                            Não há sinais suficientes para estabelecer uma
                            prioridade maior.
                          </li>
                        )}
                      </ul>
                    </details>
                    <button
                      className="link-button"
                      aria-label={`Abrir ${insight.dueCards || insight.flaggedCards ? "revisões" : "estudos"} de ${insight.name}`}
                      onClick={() =>
                        openInsight(
                          insight.subjectId,
                          insight.dueCards,
                          insight.flaggedCards,
                        )
                      }
                    >
                      {insight.dueCards || insight.flaggedCards
                        ? "Cuidar das revisões"
                        : "Continuar estudando"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {visibleSubjects.length === 0 && (
              <Empty
                title="Nenhuma matéria com esse sinal."
                text={
                  signalFilter === "all"
                    ? "Adicione uma matéria para começar seu acompanhamento."
                    : "Você pode escolher outro filtro para olhar seu percurso."
                }
                action={() =>
                  signalFilter === "all"
                    ? onNavigate("studies")
                    : setSignalFilter("all")
                }
                label={
                  signalFilter === "all"
                    ? "Adicionar matéria"
                    : "Ver todos os sinais"
                }
              />
            )}
          </article>

          <div className="mentor-limits">
            <ShieldCheck size={19} />
            <div>
              <strong>Um acompanhamento honesto.</strong>
              <ul>
                {overview.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <aside className="panel mentor-chat">
          <header className="mentor-chat-heading">
            <span className="round-icon">
              <MessageCircle size={22} />
            </span>
            <div>
              <h2>Converse com a Íris</h2>
              <small>Respostas a partir dos seus registros</small>
            </div>
            {messages.length > 0 && (
              <button
                className="icon-button"
                aria-label="Limpar conversa com a Íris"
                onClick={() => {
                  setMessages([]);
                  setQuestion("");
                  input.current?.focus();
                }}
              >
                <RotateCcw size={17} />
              </button>
            )}
          </header>
          <div className="mentor-suggestions" aria-label="Perguntas sugeridas">
            {suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => ask(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          <div
            ref={conversation}
            className="mentor-messages"
            role="log"
            aria-label="Conversa com a Íris"
            aria-live="polite"
            aria-relevant="additions"
          >
            <article className="mentor-message iris">
              <strong>
                <Sparkles size={14} />
                Íris
              </strong>
              <p>
                Posso ajudar você a escolher o que estudar, perceber dúvidas,
                retomar revisões e separar o que precisa de uma fonte
                atualizada. Sobre o que vamos olhar?
              </p>
            </article>
            {messages.map((message) => (
              <article
                className={`mentor-message ${message.role}`}
                key={message.id}
              >
                <strong>
                  {message.role === "iris" ? (
                    <>
                      <Sparkles size={14} />
                      Íris
                    </>
                  ) : (
                    "Você"
                  )}
                </strong>
                <p>{message.text}</p>
                {message.context && <small>{message.context}</small>}
                {message.actions.length > 0 && (
                  <div className="mentor-message-actions">
                    {message.actions.map((action) => (
                      <button
                        className="link-button"
                        key={action.id}
                        onClick={() => takeAction(action)}
                      >
                        {action.label}
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          <form className="mentor-compose" onSubmit={submit}>
            <label htmlFor="mentor-question">Pergunte à Íris</label>
            <div>
              <textarea
                ref={input}
                id="mentor-question"
                value={question}
                rows={2}
                maxLength={1000}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    ask(question);
                  }
                }}
                placeholder={
                  selectedSubject
                    ? `O que revisar em ${selectedSubject.name}?`
                    : "Por onde posso começar hoje?"
                }
              />
              <button
                className="button primary"
                type="submit"
                aria-label="Enviar pergunta à Íris"
                disabled={!question.trim()}
              >
                <Send size={18} />
              </button>
            </div>
            <small>
              Analisa seus registros localmente. Não lê PDFs, não consulta sites
              e não usa IA generativa.
            </small>
          </form>
        </aside>
      </div>
    </section>
  );
}
