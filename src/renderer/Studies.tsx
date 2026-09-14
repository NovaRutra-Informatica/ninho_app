import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Circle,
  FolderOpen,
  GraduationCap,
  Layers3,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trophy,
  Timer,
} from "lucide-react";
import { getLessonStudyStats, type LessonStudyStats } from "../domain";
import { useApp } from "./store";
import Materials from "./Materials";
import { scrollBehavior } from "./motion";
import {
  CardForm,
  CourseForm,
  LessonForm,
  ProgramForm,
  SubjectForm,
} from "./forms";
import {
  Empty,
  ProgressBar,
  SearchBox,
  SourceLink,
  normalizeSearch,
} from "./ui";
import type { Course, Lesson, StudyProgram } from "../shared/types";

type ActiveLessonFocus = { lessonId: string; running: boolean };
function studyTimeText(minutes: number) {
  const seconds = Math.floor(minutes * 60 + 0.000001);
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;
  return `${Math.floor(seconds / 3600)} h${Math.floor((seconds % 3600) / 60) ? ` ${Math.floor((seconds % 3600) / 60)} min` : ""}`;
}

function LessonRow({
  lesson,
  expanded,
  onExpand,
  openFocus,
  focus,
  studyStats,
}: {
  lesson: Lesson;
  expanded: boolean;
  onExpand: () => void;
  openFocus?: (lesson: Lesson) => void;
  focus?: ActiveLessonFocus;
  studyStats: LessonStudyStats;
}) {
  const { state, act, notify } = useApp();
  const [notes, setNotes] = useState(lesson.notes);
  const [card, setCard] = useState(false);
  const [editing, setEditing] = useState(false);
  const materialsAnchor = useRef<HTMLDivElement>(null);
  const [materialsRequest, setMaterialsRequest] = useState(0);
  const materialCount = state.materials.filter(
    (material) =>
      material.subjectId === lesson.subjectId &&
      material.lessonId === lesson.id,
  ).length;
  useEffect(() => {
    if (!expanded) {
      if (materialsRequest) setMaterialsRequest(0);
      return;
    }
    if (!materialsRequest) return;
    const frame = requestAnimationFrame(() => {
      materialsAnchor.current?.scrollIntoView?.({
        block: "start",
        behavior: scrollBehavior(state.settings.reducedMotion),
      });
      materialsAnchor.current?.focus({ preventScroll: true });
      setMaterialsRequest(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, materialsRequest, state.settings.reducedMotion]);
  const course = state.courses.find((course) => course.id === lesson.courseId);
  const changeStatus = async (status: Lesson["status"]) => {
    try {
      await act({ type: "lesson.update", id: lesson.id, patch: { status } });
      notify(
        status === "done"
          ? "Mais uma aula concluída. Bom trabalho!"
          : "Progresso atualizado.",
      );
    } catch {}
  };
  return (
    <div
      className={`lesson-row ${expanded ? "expanded" : ""}`}
      data-testid={`lesson-row-${lesson.id}`}
    >
      <div className="lesson-top">
        <button
          className={`lesson-check ${lesson.status === "done" ? "done" : ""}`}
          data-testid={`lesson-status-${lesson.id}`}
          aria-label={
            lesson.status === "done"
              ? `Reabrir ${lesson.title}`
              : `Concluir ${lesson.title}`
          }
          onClick={() =>
            void changeStatus(lesson.status === "done" ? "not-started" : "done")
          }
        >
          {lesson.status === "done" ? (
            <Check size={17} />
          ) : (
            <Circle size={17} />
          )}
        </button>
        <button
          className="lesson-title"
          onClick={onExpand}
          aria-expanded={expanded}
        >
          <span>
            {lesson.title}
            {lesson.status === "in-progress" && <i>Em estudo</i>}
          </span>
          <p>{lesson.description}</p>
        </button>
        <div
          className="lesson-time-summary"
          data-testid={`lesson-time-${lesson.id}`}
        >
          <span>
            {studyTimeText(studyStats.durationMinutes)} ·{" "}
            {studyStats.sessionCount}{" "}
            {studyStats.sessionCount === 1 ? "sessão" : "sessões"}
          </span>
          {focus?.lessonId === lesson.id && (
            <small
              className="lesson-focus-active"
              data-testid={`lesson-focus-active-${lesson.id}`}
            >
              {focus.running ? "Cronômetro rodando" : "Cronômetro pausado"}
            </small>
          )}
        </div>
        {openFocus && (
          <button
            className="button secondary small lesson-focus-button"
            data-testid={`lesson-focus-${lesson.id}`}
            aria-label={`Cronometrar ${lesson.title}`}
            onClick={() => openFocus(lesson)}
          >
            <Timer size={16} />
            {focus?.lessonId === lesson.id ? "Ver cronômetro" : "Cronometrar"}
          </button>
        )}
        <button
          className="button secondary small lesson-materials-button"
          data-testid={`lesson-open-materials-${lesson.id}`}
          aria-label={`Materiais de ${lesson.title}: ${materialCount} ${materialCount === 1 ? "arquivo" : "arquivos"}`}
          aria-controls={`lesson-materials-anchor-${lesson.id}`}
          onClick={() => {
            if (!expanded) onExpand();
            setMaterialsRequest((request) => request + 1);
          }}
        >
          <FolderOpen size={16} />
          Materiais ({materialCount})
        </button>
        <button
          className="icon-button"
          aria-label={`Detalhes de ${lesson.title}`}
          onClick={onExpand}
        >
          <ChevronDown size={18} className={expanded ? "rotate" : ""} />
        </button>
      </div>
      {expanded && (
        <div className="lesson-body">
          <div className="lesson-controls">
            <label className="field compact">
              Situação
              <select
                value={lesson.status}
                onChange={(e) =>
                  void changeStatus(e.target.value as Lesson["status"])
                }
              >
                <option value="not-started">A estudar</option>
                <option value="in-progress">Em estudo</option>
                <option value="done">Concluída</option>
              </select>
            </label>
            {lesson.url && <SourceLink url={lesson.url}>Abrir aula</SourceLink>}
            {course && (
              <button
                className="button secondary small"
                aria-label={`Editar aula ${lesson.title}`}
                onClick={() => setEditing(true)}
              >
                <Pencil size={15} />
                Editar aula
              </button>
            )}
            <button
              className="button secondary small"
              onClick={() => setCard(true)}
            >
              <Plus size={15} />
              Criar cartão
            </button>
          </div>
          <label className="field">
            <span>
              <StickyNote size={15} />
              Minhas anotações
            </span>
            <textarea
              data-testid={`lesson-notes-${lesson.id}`}
              aria-label={`Anotações de ${lesson.title}`}
              rows={4}
              value={notes}
              maxLength={20000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="O que ficou claro? O que preciso rever?"
            />
          </label>
          <div className="row-between">
            <small>
              {materialCount} anexos ·{" "}
              {state.cards.filter((c) => c.lessonId === lesson.id).length}{" "}
              cartões nesta aula
            </small>
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  await act({
                    type: "lesson.update",
                    id: lesson.id,
                    patch: { notes },
                  });
                  notify("Anotações salvas.");
                } catch {}
              }}
            >
              <Save size={15} />
              Salvar anotações
            </button>
          </div>
          <div
            ref={materialsAnchor}
            id={`lesson-materials-anchor-${lesson.id}`}
            className="lesson-materials-anchor"
            tabIndex={-1}
          >
            <Materials
              subjectId={lesson.subjectId}
              lessonId={lesson.id}
              embedded
            />
          </div>
        </div>
      )}
      {card && (
        <CardForm
          subjectId={lesson.subjectId}
          lessonId={lesson.id}
          close={() => setCard(false)}
        />
      )}{" "}
      {editing && course && (
        <LessonForm
          course={course}
          lesson={lesson}
          close={() => setEditing(false)}
        />
      )}
    </div>
  );
}
export default function Studies({
  selected,
  setSelected,
  selectedLesson,
  renderMaterials,
  openLessonFocus,
  activeFocus,
}: {
  selected: string;
  setSelected: (id: string) => void;
  selectedLesson: string;
  renderMaterials?: (subjectId: string) => ReactNode;
  openLessonFocus?: (lesson: Lesson) => void;
  activeFocus?: ActiveLessonFocus;
}) {
  const { state } = useApp();
  const lessonStats = useMemo(
    () => getLessonStudyStats(state),
    [state.lessons, state.sessions],
  );
  const [programId, setProgramId] = useState(
    () =>
      state.subjects.find((subject) => subject.id === selected)?.programId ||
      "",
  );
  const [tab, setTab] = useState<"lessons" | "materials">("lessons");
  const [track, setTrack] = useState("all"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [newProgram, setNewProgram] = useState(false),
    [editingProgram, setEditingProgram] = useState<StudyProgram | null>(null);
  const [newSubject, setNewSubject] = useState(false),
    [editingSubject, setEditingSubject] = useState(false),
    [newCourse, setNewCourse] = useState(false),
    [editingCourse, setEditingCourse] = useState<Course | null>(null),
    [newLesson, setNewLesson] = useState<Course | null>(null);
  const [expanded, setExpanded] = useState(selectedLesson),
    [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const subject = state.subjects.find((subject) => subject.id === selected);
  const program = state.programs.find(
    (program) => program.id === (subject?.programId || programId),
  );
  const courses = state.courses.filter(
      (course) => course.subjectId === selected,
    ),
    q = normalizeSearch(query);
  useEffect(() => {
    if (subject) {
      setProgramId(subject.programId);
      setTab("lessons");
    }
  }, [selected, subject?.programId]);
  useEffect(() => {
    if (selectedLesson) {
      setExpanded(selectedLesson);
      setTab("lessons");
    }
  }, [selectedLesson]);
  const matches = (lesson: Lesson) =>
    normalizeSearch(lesson.title + " " + lesson.description).includes(q) &&
    (status === "all" || lesson.status === status);
  const enterProgram = (id: string) => {
    setSelected("");
    setProgramId(id);
    setQuery("");
    setStatus("all");
  };
  const enterSubject = (id: string) => {
    setSelected(id);
    setQuery("");
    setStatus("all");
    setTab("lessons");
  };
  const back = () => {
    if (subject) {
      setSelected("");
      setQuery("");
      setTab("lessons");
    } else {
      setSelected("");
      setProgramId("");
      setQuery("");
    }
  };
  const heading =
    subject?.name || program?.name || "Seus cursos. Seu próximo passo.";
  const description = subject
    ? "Aulas, anotações e materiais da sua matéria."
    : program?.description ||
      "Escolha um curso, encontre suas matérias e estude uma coisa por vez.";
  return (
    <section className="page-enter studies-page">
      <div className="page-heading">
        <div>
          {program && (
            <button className="back-link" onClick={back}>
              <ArrowLeft size={15} />
              {subject ? `Voltar para ${program.name}` : "Todos os cursos"}
            </button>
          )}
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
        <div className="row-between">
          {subject ? (
            <button
              className="icon-button"
              aria-label="Editar matéria"
              title="Editar matéria"
              onClick={() => setEditingSubject(true)}
            >
              <Pencil size={19} />
            </button>
          ) : program ? (
            <button
              className="icon-button"
              aria-label="Editar curso"
              title="Editar curso"
              onClick={() => setEditingProgram(program)}
            >
              <Pencil size={19} />
            </button>
          ) : null}
          <button
            className="button primary"
            onClick={() =>
              subject
                ? setNewCourse(true)
                : program
                  ? setNewSubject(true)
                  : setNewProgram(true)
            }
          >
            <Plus size={17} />
            {subject
              ? "Adicionar módulo"
              : program
                ? "Nova matéria"
                : "Novo curso"}
          </button>
        </div>
      </div>
      {subject && (
        <div
          className="segmented subject-tabs"
          role="tablist"
          aria-label="Conteúdo da matéria"
        >
          <button
            role="tab"
            aria-selected={tab === "lessons"}
            className={tab === "lessons" ? "active" : ""}
            onClick={() => setTab("lessons")}
          >
            <BookOpen size={16} />
            Aulas
          </button>
          <button
            role="tab"
            aria-selected={tab === "materials"}
            className={tab === "materials" ? "active" : ""}
            onClick={() => setTab("materials")}
          >
            <FolderOpen size={16} />
            Materiais{" "}
            <span>
              {
                state.materials.filter(
                  (material) => material.subjectId === subject.id,
                ).length
              }
            </span>
          </button>
        </div>
      )}
      {subject && tab === "materials" ? (
        <div
          className="subject-materials"
          role="tabpanel"
          aria-label="Materiais da matéria"
        >
          {renderMaterials ? (
            renderMaterials(subject.id)
          ) : (
            <Empty
              title="Seus materiais, nesta matéria."
              text="Abra a área Materiais para anexar e organizar seus arquivos."
            />
          )}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder={
                subject
                  ? "Buscar aula ou conteúdo…"
                  : program
                    ? "Buscar matéria ou conteúdo…"
                    : "Buscar curso ou conteúdo…"
              }
            />
            {subject ? (
              <select
                aria-label="Filtrar situação"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Todas as aulas</option>
                <option value="not-started">A estudar</option>
                <option value="in-progress">Em estudo</option>
                <option value="done">Concluídas</option>
              </select>
            ) : !program ? (
              <div className="segmented">
                {[
                  ["all", "Tudo"],
                  ["concurso", "Concurso"],
                  ["faculdade", "Faculdade"],
                  ["pessoal", "Pessoal"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={track === id ? "active" : ""}
                    onClick={() => setTrack(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {!program ? (
            <div className="subject-grid program-grid">
              {state.programs
                .filter(
                  (program) =>
                    (track === "all" || program.track === track) &&
                    (normalizeSearch(
                      program.name + " " + program.description,
                    ).includes(q) ||
                      state.subjects.some(
                        (subject) =>
                          subject.programId === program.id &&
                          (normalizeSearch(subject.name).includes(q) ||
                            state.lessons.some(
                              (lesson) =>
                                lesson.subjectId === subject.id &&
                                matches(lesson),
                            )),
                      )),
                )
                .map((program) => {
                  const subjects = state.subjects.filter(
                      (subject) => subject.programId === program.id,
                    ),
                    ids = new Set(subjects.map((subject) => subject.id)),
                    lessons = state.lessons.filter((lesson) =>
                      ids.has(lesson.subjectId),
                    ),
                    done = lessons.filter(
                      (lesson) => lesson.status === "done",
                    ).length;
                  return (
                    <button
                      className="subject-card program-card"
                      key={program.id}
                      data-testid={`program-${program.id}`}
                      onClick={() => enterProgram(program.id)}
                    >
                      <div className="row-between">
                        <span
                          className="subject-icon"
                          style={{
                            color: program.color,
                            background: `${program.color}18`,
                          }}
                        >
                          {program.track === "faculdade" ? (
                            <GraduationCap size={28} />
                          ) : program.track === "concurso" ? (
                            <BookOpen size={28} />
                          ) : (
                            <Trophy size={28} />
                          )}
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <small>
                        {program.track === "faculdade"
                          ? "FACULDADE"
                          : program.track === "concurso"
                            ? "CONCURSO"
                            : "PESSOAL"}
                      </small>
                      <h3>{program.name}</h3>
                      <p>
                        {program.description ||
                          "Um novo caminho para organizar e aprender."}
                      </p>
                      <div className="program-counts">
                        {subjects.length}{" "}
                        {subjects.length === 1 ? "matéria" : "matérias"} ·{" "}
                        {lessons.length}{" "}
                        {lessons.length === 1 ? "aula" : "aulas"}
                      </div>
                      <ProgressBar
                        value={
                          lessons.length ? (done / lessons.length) * 100 : 0
                        }
                        color={program.color}
                      />
                      <footer>
                        {done
                          ? `${done} aulas concluídas`
                          : "Entre no curso para organizar suas matérias."}
                      </footer>
                    </button>
                  );
                })}
              {!state.programs.length && (
                <Empty
                  title="Seu primeiro curso começa aqui."
                  text="Adicione um concurso, uma faculdade ou um assunto que queira aprender."
                  action={() => setNewProgram(true)}
                  label="Criar primeiro curso"
                />
              )}
            </div>
          ) : !subject ? (
            <>
              {program.id === "senado-federal" && (
                <div className="integration-strip">
                  <span className="round-icon">
                    <Layers3 size={21} />
                  </span>
                  <div>
                    <strong>Seu Estratégia já tem um lugar aqui.</strong>
                    <p>
                      20 módulos · 271 aulas e materiais extras · catálogo
                      conferido em 14/09/2026
                    </p>
                  </div>
                  <SourceLink url="https://www.estrategiaconcursos.com.br/app/dashboard/cursos">
                    Área do aluno
                  </SourceLink>
                </div>
              )}
              <div className="subject-grid">
                {state.subjects
                  .filter(
                    (subject) =>
                      subject.programId === program.id &&
                      (normalizeSearch(subject.name).includes(q) ||
                        state.lessons.some(
                          (lesson) =>
                            lesson.subjectId === subject.id && matches(lesson),
                        )),
                  )
                  .map((subject) => {
                    const lessons = state.lessons.filter(
                        (lesson) => lesson.subjectId === subject.id,
                      ),
                      done = lessons.filter(
                        (lesson) => lesson.status === "done",
                      ).length,
                      cards = state.cards.filter(
                        (card) => card.subjectId === subject.id,
                      );
                    return (
                      <button
                        className="subject-card"
                        key={subject.id}
                        data-testid={`subject-${subject.id}`}
                        onClick={() => enterSubject(subject.id)}
                      >
                        <div className="row-between">
                          <span
                            className="subject-icon"
                            style={{
                              color: subject.color,
                              background: `${subject.color}18`,
                            }}
                          >
                            <BookOpen size={25} />
                          </span>
                          <ArrowUpRight size={19} />
                        </div>
                        <small>{program.name}</small>
                        <h3>{subject.name}</h3>
                        <p>
                          {lessons.length} aulas · {cards.length} cartões
                        </p>
                        <ProgressBar
                          value={
                            lessons.length ? (done / lessons.length) * 100 : 0
                          }
                          color={subject.color}
                        />
                        <footer>
                          {done
                            ? `${done} de ${lessons.length} aulas concluídas`
                            : "Tudo começa com o primeiro passo."}
                        </footer>
                      </button>
                    );
                  })}
                {!state.subjects.some(
                  (subject) => subject.programId === program.id,
                ) && (
                  <Empty
                    title="Quais matérias fazem parte deste curso?"
                    text="Crie sua primeira matéria e depois adicione as aulas e os materiais."
                    action={() => setNewSubject(true)}
                    label="Criar primeira matéria"
                  />
                )}
              </div>
            </>
          ) : (
            <div
              className="course-list"
              role="tabpanel"
              aria-label="Aulas da matéria"
            >
              {!courses.length && (
                <Empty
                  title="Um lugar para suas aulas."
                  text="Crie um módulo para agrupar aulas, semestres ou fontes desta matéria."
                  action={() => setNewCourse(true)}
                  label="Adicionar primeiro módulo"
                />
              )}
              {courses.map((course) => {
                const all = state.lessons
                    .filter((lesson) => lesson.courseId === course.id)
                    .sort((a, b) => a.order - b.order),
                  filtered = all.filter(matches),
                  done = all.filter(
                    (lesson) => lesson.status === "done",
                  ).length,
                  isOpen = openCourses[course.id] !== false;
                return (
                  <article className="course-panel" key={course.id}>
                    <header>
                      <button
                        className="course-heading"
                        onClick={() =>
                          setOpenCourses({
                            ...openCourses,
                            [course.id]: !isOpen,
                          })
                        }
                        aria-expanded={isOpen}
                      >
                        <span className="eyebrow">
                          {course.provider} · {done}/{all.length} concluídas
                        </span>
                        <h3>{course.title}</h3>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Editar módulo ${course.title}`}
                        title="Editar módulo"
                        onClick={() => setEditingCourse(course)}
                      >
                        <Pencil size={17} />
                      </button>
                      <ChevronDown
                        className={!isOpen ? "rotate-left" : ""}
                        size={20}
                      />
                    </header>
                    {isOpen && (
                      <>
                        <div className="course-tools">
                          {course.url && (
                            <SourceLink url={course.url}>
                              Abrir módulo
                            </SourceLink>
                          )}
                          <button
                            className="link-button"
                            onClick={() => setNewLesson(course)}
                          >
                            <Plus size={15} />
                            Adicionar aula
                          </button>
                        </div>
                        {filtered.map((lesson) => (
                          <LessonRow
                            key={lesson.id}
                            lesson={lesson}
                            studyStats={lessonStats[lesson.id]}
                            openFocus={openLessonFocus}
                            focus={activeFocus}
                            expanded={expanded === lesson.id}
                            onExpand={() =>
                              setExpanded(
                                expanded === lesson.id ? "" : lesson.id,
                              )
                            }
                          />
                        ))}
                        {!filtered.length && (
                          <p className="inline-empty">
                            {all.length
                              ? "Nenhuma aula corresponde ao filtro."
                              : "Adicione sua primeira aula neste módulo."}
                          </p>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
              <p className="microcopy">
                O progresso registrado no Ninho é local. Ao abrir uma aula, seu
                navegador mantém o acesso à plataforma.
              </p>
            </div>
          )}
        </>
      )}
      {newProgram && <ProgramForm close={() => setNewProgram(false)} />}{" "}
      {editingProgram && (
        <ProgramForm
          program={editingProgram}
          close={() => setEditingProgram(null)}
        />
      )}{" "}
      {newSubject && program && (
        <SubjectForm
          programId={program.id}
          close={() => setNewSubject(false)}
        />
      )}{" "}
      {editingSubject && subject && (
        <SubjectForm subject={subject} close={() => setEditingSubject(false)} />
      )}{" "}
      {newCourse && subject && (
        <CourseForm subjectId={subject.id} close={() => setNewCourse(false)} />
      )}{" "}
      {editingCourse && (
        <CourseForm
          course={editingCourse}
          subjectId={editingCourse.subjectId}
          close={() => setEditingCourse(null)}
        />
      )}{" "}
      {newLesson && (
        <LessonForm course={newLesson} close={() => setNewLesson(null)} />
      )}
    </section>
  );
}
