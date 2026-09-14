import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Flame,
  FolderOpen,
  GraduationCap,
  Home,
  Leaf,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { getDashboardStats, localDate, type MentorAction } from "../domain";
import { useApp } from "./store";
import { Empty, Owl, prettyDate, ProgressBar, timeText } from "./ui";
import { ExamForm, TaskForm } from "./forms";
import { FocusModal, useFocus } from "./Focus";
import { transitionPage, scrollBehavior } from "./motion";
import Studies from "./Studies";
import Reviews from "./Reviews";
import Materials from "./Materials";
import Agenda from "./Agenda";
import Settings from "./Settings";
import Mentor from "./Mentor";
import type { Lesson } from "../shared/types";

type Page =
  | "today"
  | "studies"
  | "reviews"
  | "materials"
  | "agenda"
  | "progress"
  | "settings"
  | "mentor";
type ReviewRoute = {
  mode: "home" | "library";
  filter: "all" | "outdated" | "relearn";
  card: string;
};
const defaultReviewRoute: ReviewRoute = {
  mode: "home",
  filter: "all",
  card: "",
};
const navigation = [
  ["today", "Hoje", Home],
  ["studies", "Meus estudos", BookOpen],
  ["reviews", "Revisões", Brain],
  ["materials", "Materiais", FolderOpen],
  ["agenda", "Agenda", CalendarDays],
  ["progress", "Progresso", TrendingUp],
  ["mentor", "Minha assistente", Sparkles],
] as const;
function Dashboard({
  go,
  openLesson,
  openFocus,
}: {
  go: (page: Page) => void;
  openLesson: (lesson: Lesson) => void;
  openFocus: () => void;
}) {
  const { state, act } = useApp();
  const stats = getDashboardStats(state);
  const [newExam, setNewExam] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const next =
    state.lessons.find((l) => l.status === "in-progress") ||
    state.lessons.find((l) => l.status === "not-started");
  const nextSubject = state.subjects.find((s) => s.id === next?.subjectId);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return (
    <section className="page-enter dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU ESPAÇO PARA CRESCER</span>
          <h1>
            {greeting}, {state.settings.name.split(" ")[0]}{" "}
            <span className="greeting-leaf">
              <Leaf size={24} />
            </span>
          </h1>
          <p>Que tal dar mais um passo por você hoje?</p>
        </div>
        <button
          className="date-pill"
          aria-label="Abrir calendário"
          data-testid="today-calendar"
          onClick={() => go("agenda")}
        >
          <CalendarDays size={16} />
          {prettyDate(localDate(), {
            weekday: "short",
            day: "numeric",
            month: "long",
          })}
        </button>
      </div>
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-label">
            <span />
            SEU PRÓXIMO CAPÍTULO
          </span>
          <h2>
            Um passo hoje.
            <br />
            Mais perto da aprovação.
          </h2>
          <p>
            Um lugar para organizar a mente, cuidar do que aprendeu e construir
            o que vem depois.
          </p>
          <button
            className="button lime"
            onClick={() => (next ? openLesson(next) : go("studies"))}
          >
            Vamos estudar
            <ArrowRight size={18} />
          </button>
          <small>Senado Federal · Análise e Suporte a Sistemas</small>
        </div>
        <div className="hero-mascot">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <Owl />
          <span className="mascot-note">
            Eu sou a Íris.
            <br />
            Vamos juntos?
          </span>
        </div>
      </div>
      <div className="stat-grid">
        <button className="stat-card" onClick={openFocus}>
          <span className="stat-icon mint">
            <Timer size={22} />
          </span>
          <div>
            <small>Seu tempo hoje</small>
            <strong>
              {Math.round(stats.todayMinutes)}
              <em> / {state.settings.dailyMinutes} min</em>
            </strong>
            <ProgressBar value={stats.dailyGoalProgress} />
          </div>
          <ChevronRight size={17} />
        </button>
        <button className="stat-card" onClick={() => go("reviews")}>
          <span className="stat-icon lavender">
            <Brain size={22} />
          </span>
          <div>
            <small>Para revisar</small>
            <strong>
              {stats.dueCards}
              <em> conhecimentos</em>
            </strong>
            <span className="stat-caption">
              Um reencontro com o que aprendeu
            </span>
          </div>
          <ChevronRight size={17} />
        </button>
        <button className="stat-card" onClick={() => go("progress")}>
          <span className="stat-icon peach">
            <Flame size={22} />
          </span>
          <div>
            <small>Seu ritmo</small>
            <strong>
              {stats.streak}
              <em> {stats.streak === 1 ? "dia seguido" : "dias seguidos"}</em>
            </strong>
            <span className="stat-caption">
              Constância se constrói aos poucos
            </span>
          </div>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="dashboard-columns">
        <div>
          <div className="section-title">
            <h2>Seu próximo passo</h2>
            <button className="link-button" onClick={() => go("studies")}>
              Ver estudos
              <ArrowRight size={15} />
            </button>
          </div>
          {next ? (
            <article className="panel next-lesson">
              <div className="row-between">
                <span className="badge">
                  {next.status === "in-progress"
                    ? "CONTINUE DE ONDE PAROU"
                    : "UM BOM COMEÇO"}
                </span>
                <BookOpen size={23} />
              </div>
              <small>{nextSubject?.name}</small>
              <h3>{next.title}</h3>
              <p>{next.description}</p>
              <button
                className="button secondary"
                onClick={() => openLesson(next)}
              >
                Abrir meu estudo
                <ArrowRight size={16} />
              </button>
            </article>
          ) : (
            <div className="panel">
              <Empty
                title="Mais um caminho pela frente."
                text="Você pode organizar um novo curso ou revisitar o que aprendeu."
                action={() => go("studies")}
                label="Explorar estudos"
              />
            </div>
          )}
          <div className="section-title">
            <h2>Pequenos passos de hoje</h2>
            <button
              className="icon-button"
              aria-label="Adicionar tarefa de hoje"
              onClick={() => setNewTask(true)}
            >
              <Plus size={19} />
            </button>
          </div>
          <div className="panel today-tasks">
            {stats.todayTasks.length ? (
              stats.todayTasks.map((task) => (
                <div
                  className={`task-row ${task.completed ? "completed" : ""}`}
                  key={task.id}
                >
                  <button
                    className="task-check"
                    aria-label={`${task.completed ? "Reabrir" : "Concluir"} tarefa ${task.title}`}
                    onClick={() =>
                      void act({
                        type: "task.save",
                        task: { ...task, completed: !task.completed },
                      }).catch(() => {})
                    }
                  >
                    {task.completed ? (
                      <Check size={19} />
                    ) : (
                      <Circle size={19} />
                    )}
                  </button>
                  <span>{task.title}</span>
                </div>
              ))
            ) : (
              <div className="quiet-empty">
                <span className="round-icon">
                  <Check size={20} />
                </span>
                <div>
                  <strong>Menos na cabeça. Mais no papel.</strong>
                  <p>Escolha uma pequena tarefa para hoje.</p>
                </div>
                <button
                  className="link-button"
                  onClick={() => setNewTask(true)}
                >
                  Adicionar
                  <Plus size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
        <aside>
          <div className="section-title">
            <h2>No horizonte</h2>
            <button className="link-button" onClick={() => go("agenda")}>
              Agenda
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="panel horizon">
            {stats.upcomingExams.length ? (
              stats.upcomingExams.slice(0, 3).map((exam) => (
                <button
                  className="horizon-exam"
                  key={exam.id}
                  onClick={() => go("agenda")}
                >
                  <span className="exam-date">
                    <strong>{prettyDate(exam.date, { day: "2-digit" })}</strong>
                    <span>{prettyDate(exam.date, { month: "short" })}</span>
                  </span>
                  <span>
                    <strong>{exam.title}</strong>
                    <small>
                      {state.subjects.find((s) => s.id === exam.subjectId)
                        ?.name || "Seu compromisso"}
                      {exam.time && ` · ${exam.time}`}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <>
                <div className="horizon-illustration">
                  <CalendarDays size={37} />
                  <Sparkles size={20} />
                </div>
                <h3>
                  Sua próxima conquista
                  <br />
                  merece uma data.
                </h3>
                <p>
                  Marque as provas da Mauá e dos concursos para se preparar com
                  calma.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setNewExam(true)}
                >
                  <Plus size={16} />
                  Marcar uma prova
                </button>
              </>
            )}
          </div>
          <button className="focus-prompt" onClick={openFocus}>
            <span className="round-icon">
              <Play size={22} />
            </span>
            <div>
              <strong>Um tempo só para estudar</strong>
              <p>{state.settings.focusMinutes} minutos. Uma coisa por vez.</p>
            </div>
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>
      <div className="dashboard-footer">
        <Leaf size={16} />
        <span>Você não precisa aprender tudo hoje. Só precisa continuar.</span>
      </div>
      {newExam && <ExamForm close={() => setNewExam(false)} />}{" "}
      {newTask && <TaskForm close={() => setNewTask(false)} />}
    </section>
  );
}

function Progress() {
  const { state } = useApp();
  const stats = getDashboardStats(state);
  const totalMinutes = state.sessions.reduce(
    (sum, s) => sum + s.durationMinutes,
    0,
  );
  const reviewed = state.cards.filter((c) => c.lastReviewedAt).length;
  const maxMinutes = Math.max(
    state.settings.dailyMinutes,
    ...stats.studiedDays.map((d) => d.minutes),
    1,
  );
  const milestones = [
    {
      name: "Primeiro passo",
      text: "Concluir sua primeira aula",
      done: stats.lessonsDone > 0,
      icon: BookOpen,
    },
    {
      name: "Uma hora para você",
      text: "Somar 60 minutos de foco",
      done: totalMinutes >= 60,
      icon: Timer,
    },
    {
      name: "Memória em movimento",
      text: "Revisitar 10 conhecimentos",
      done: reviewed >= 10,
      icon: Brain,
    },
    {
      name: "Criando raízes",
      text: "Estudar por 7 dias seguidos",
      done: stats.streak >= 7,
      icon: Leaf,
    },
  ];
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Olha o quanto você está construindo.</h1>
          <p>Cada aula, cada revisão, cada minuto. Tudo conta.</p>
        </div>
        <span className="badge">
          <TrendingUp size={15} />
          SEU PERCURSO
        </span>
      </div>
      <div className="progress-summary">
        <article className="panel">
          <Timer size={22} />
          <strong>
            {Math.round(totalMinutes)}
            <small> min</small>
          </strong>
          <span>dedicados a aprender</span>
        </article>
        <article className="panel">
          <BookOpen size={22} />
          <strong>
            {stats.lessonsDone}
            <small> / {stats.totalLessons}</small>
          </strong>
          <span>aulas concluídas</span>
        </article>
        <article className="panel">
          <Brain size={22} />
          <strong>
            {reviewed}
            <small> / {state.cards.length}</small>
          </strong>
          <span>conhecimentos revisitados</span>
        </article>
        <article className="panel">
          <Flame size={22} />
          <strong>
            {stats.streak}
            <small> dias</small>
          </strong>
          <span>na sua sequência atual</span>
        </article>
      </div>
      <div className="progress-columns">
        <article className="panel week-chart">
          <div className="row-between">
            <div>
              <span className="eyebrow">O HÁBITO SE FORMA AQUI</span>
              <h2>Seus últimos sete dias</h2>
            </div>
            <span className="badge">{Math.round(stats.weekMinutes)} min</span>
          </div>
          <div
            className="bars"
            role="img"
            aria-label={`Tempo de estudo nos últimos sete dias: ${stats.studiedDays.map((d) => `${prettyDate(d.date)}: ${Math.round(d.minutes)} minutos`).join("; ")}`}
          >
            {stats.studiedDays.map((day) => (
              <div className="bar-day" key={day.date}>
                <span>
                  {Math.round(day.minutes)}
                  <small>m</small>
                </span>
                <div className="bar-well">
                  <div
                    className={
                      day.date === localDate() ? "bar-fill current" : "bar-fill"
                    }
                    style={{
                      height: `${Math.max(day.minutes > 0 ? 3 : 0, (day.minutes / maxMinutes) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {prettyDate(day.date, { weekday: "short" }).replace(".", "")}
                </small>
              </div>
            ))}
          </div>
          <p className="microcopy">
            O tempo é registrado nas sessões de foco concluídas. Pausas não
            entram na conta.
          </p>
        </article>
        <article className="panel milestones">
          <span className="eyebrow">PEQUENAS CONQUISTAS</span>
          <h2>Motivos para continuar.</h2>
          {milestones.map(({ name, text, done, icon: Icon }) => (
            <div className={`milestone ${done ? "achieved" : ""}`} key={name}>
              <span className="round-icon">
                <Icon size={21} />
              </span>
              <div>
                <strong>{name}</strong>
                <small>{text}</small>
              </div>
              {done ? <Check size={19} /> : <span className="milestone-dot" />}
            </div>
          ))}
        </article>
      </div>
      <div className="section-title">
        <h2>Seu avanço por matéria</h2>
        <small>{stats.lessonsDone} passos dados</small>
      </div>
      <div className="panel subject-progress-list">
        {state.subjects.map((subject) => {
          const lessons = state.lessons.filter(
            (l) => l.subjectId === subject.id,
          );
          const done = lessons.filter((l) => l.status === "done").length;
          const cards = state.cards.filter((c) => c.subjectId === subject.id);
          return (
            <div className="subject-progress-row" key={subject.id}>
              <span
                className="subject-color"
                style={{ background: subject.color }}
              />
              <strong>{subject.name}</strong>
              <ProgressBar
                value={lessons.length ? (done / lessons.length) * 100 : 0}
                color={subject.color}
              />
              <small>
                {done}/{lessons.length} aulas
              </small>
              <small>
                {cards.filter((c) => c.lastReviewedAt).length}/{cards.length}{" "}
                cartões revistos
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const { state } = useApp();
  const [page, setPage] = useState<Page>("today");
  const [selected, setSelected] = useState("");
  const [selectedLesson, setSelectedLesson] = useState("");
  const [studiesVisit, setStudiesVisit] = useState(0);
  const [reviewRoute, setReviewRoute] =
    useState<ReviewRoute>(defaultReviewRoute);
  const [focusOpen, setFocusOpen] = useState(false);
  const focus = useFocus();
  const stats = getDashboardStats(state);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        state.settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : state.settings.theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [state.settings.theme]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      state.settings.reducedMotion,
    );
  }, [state.settings.reducedMotion]);
  const go = (target: Page) => {
    transitionPage(() => {
      if (target === "studies") setStudiesVisit((visit) => visit + 1);
      setSelected("");
      setSelectedLesson("");
      setReviewRoute(defaultReviewRoute);
      setPage(target);
      document.querySelector(".main-content")?.scrollTo(0, 0);
    }, state.settings.reducedMotion);
  };
  const openLesson = (lesson: Lesson) => {
    transitionPage(() => {
      setReviewRoute(defaultReviewRoute);
      setSelected(lesson.subjectId);
      setSelectedLesson(lesson.id);
      setPage("studies");
      document.querySelector(".main-content")?.scrollTo(0, 0);
    }, state.settings.reducedMotion);
  };
  const openMentorFocus = (subjectId?: string) => {
    if (subjectId !== undefined) focus.setSubject(subjectId);
    setFocusOpen(true);
  };
  const navigateMentor = (
    target: "reviews" | "studies" | "agenda" | "progress",
    subjectId?: string,
    action?: MentorAction,
  ) => {
    transitionPage(() => {
      setSelected(subjectId || "");
      setSelectedLesson(target === "studies" ? action?.lessonId || "" : "");
      const source = Boolean(action?.id.startsWith("source:")),
        relearn = Boolean(action?.id.startsWith("relearn:")),
        sources = action?.id === "sources";
      setReviewRoute(
        target === "reviews"
          ? {
              mode: source || relearn || sources ? "library" : "home",
              filter: source ? "outdated" : relearn ? "relearn" : "all",
              card: action?.cardId || "",
            }
          : defaultReviewRoute,
      );
      setPage(target);
      document.querySelector(".main-content")?.scrollTo(0, 0);
    }, state.settings.reducedMotion);
  };
  useEffect(() => {
    if (page !== "studies" || !selectedLesson) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(
          `[data-testid="lesson-row-${CSS.escape(selectedLesson)}"]`,
        )
        ?.scrollIntoView({
          block: "center",
          behavior: scrollBehavior(state.settings.reducedMotion),
        }),
    );
    return () => cancelAnimationFrame(frame);
  }, [page, selectedLesson, state.settings.reducedMotion]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("today")}
          aria-label="Ninho, início"
        >
          <span className="brand-mark">
            <Owl small />
          </span>
          <span>
            ninho<span>seu próximo passo</span>
          </span>
        </button>
        <div className="workspace-label">MEU ESPAÇO</div>
        <nav aria-label="Navegação principal">
          {navigation.map(([id, label, Icon]) => (
            <button
              data-testid={`nav-${id}`}
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "reviews" && stats.dueCards > 0 && (
                <b>{stats.dueCards}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`sidebar-focus ${focus.timer.running ? "running" : ""}`}
            data-testid="open-focus"
            onClick={() => setFocusOpen(true)}
          >
            <span className="focus-mini-icon">
              <Timer size={22} />
            </span>
            <span>
              <strong>
                {focus.timer.running
                  ? timeText(Math.ceil(focus.remaining))
                  : "Hora de focar"}
              </strong>
              <small>
                {focus.timer.running
                  ? "Seu tempo está correndo"
                  : "Um minuto de cada vez"}
              </small>
            </span>
            <Play size={14} />
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            data-testid="nav-settings"
            aria-current={page === "settings" ? "page" : undefined}
            onClick={() => go("settings")}
          >
            <Settings2 size={20} />
            Ajustes
          </button>
          <div className="profile">
            <div className="avatar">
              {state.settings.name[0]?.toUpperCase() || "A"}
            </div>
            <div>
              <strong>{state.settings.name}</strong>
              <small>
                <GraduationCap size={12} />
                Um futuro em construção
              </small>
            </div>
            <span className="online-dot" title="Dados locais" />
          </div>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <div className="content-inner">
          {page === "today" ? (
            <Dashboard
              go={go}
              openLesson={openLesson}
              openFocus={() => setFocusOpen(true)}
            />
          ) : page === "studies" ? (
            <Studies
              key={`${studiesVisit}:${selectedLesson}`}
              selected={selected}
              setSelected={setSelected}
              selectedLesson={selectedLesson}
              openLessonFocus={(lesson) => {
                focus.selectLesson(lesson.id);
                setFocusOpen(true);
              }}
              activeFocus={
                focus.timer.mode === "focus" && focus.hasProgress
                  ? {
                      lessonId: focus.timer.lessonId,
                      running: focus.timer.running,
                    }
                  : undefined
              }
              renderMaterials={(subjectId) => (
                <Materials key={subjectId} subjectId={subjectId} embedded />
              )}
            />
          ) : page === "reviews" ? (
            <Reviews
              initialSubject={selected}
              initialMode={reviewRoute.mode}
              initialFilter={reviewRoute.filter}
              initialCard={reviewRoute.card}
            />
          ) : page === "materials" ? (
            <Materials />
          ) : page === "agenda" ? (
            <Agenda />
          ) : page === "progress" ? (
            <Progress />
          ) : page === "mentor" ? (
            <Mentor onNavigate={navigateMentor} openFocus={openMentorFocus} />
          ) : (
            <Settings />
          )}
        </div>
      </main>
      {focusOpen && (
        <FocusModal focus={focus} close={() => setFocusOpen(false)} />
      )}
    </div>
  );
}
