import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Circle,
  FilePlus2,
  GraduationCap,
  Layers3,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trophy,
} from "lucide-react";
import { useApp } from "./store";
import { CardForm, CourseForm, LessonForm, SubjectForm } from "./forms";
import {
  Empty,
  ProgressBar,
  SearchBox,
  SourceLink,
  normalizeSearch,
} from "./ui";
import type { Course, Lesson } from "../shared/types";

function LessonRow({
  lesson,
  expanded,
  onExpand,
}: {
  lesson: Lesson;
  expanded: boolean;
  onExpand: () => void;
}) {
  const { state, act, api, replace, notify } = useApp();
  const [notes, setNotes] = useState(lesson.notes);
  const [card, setCard] = useState(false);
  const [editing, setEditing] = useState(false);
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
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  const next = await api.importMaterials({
                    subjectId: lesson.subjectId,
                    lessonId: lesson.id,
                  });
                  if (next) {
                    replace(next);
                    notify("Material guardado nesta aula.");
                  }
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              <FilePlus2 size={15} />
              Anexar arquivo
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
              {state.materials.filter((m) => m.lessonId === lesson.id).length}{" "}
              anexos ·{" "}
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
}: {
  selected: string;
  setSelected: (id: string) => void;
  selectedLesson: string;
}) {
  const { state } = useApp();
  const [track, setTrack] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [newSubject, setNewSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [newCourse, setNewCourse] = useState(false);
  const [newLesson, setNewLesson] = useState<Course | null>(null);
  const [expanded, setExpanded] = useState(selectedLesson);
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const subject = state.subjects.find((s) => s.id === selected);
  const courses = state.courses.filter((c) => c.subjectId === selected);
  const q = normalizeSearch(query);
  const matches = (l: Lesson) =>
    normalizeSearch(l.title + " " + l.description).includes(q) &&
    (status === "all" || l.status === status);
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          {subject && (
            <button
              className="back-link"
              onClick={() => {
                setSelected("");
                setQuery("");
              }}
            >
              <ArrowLeft size={15} />
              Todas as matérias
            </button>
          )}
          <h1>{subject?.name || "Seus caminhos de aprendizado"}</h1>
          <p>
            {subject
              ? `${subject.track === "faculdade" ? "Mauá · Ciência da Computação" : subject.track === "concurso" ? "Preparação para concursos" : "Seu aprendizado pessoal"} · tudo no seu ritmo`
              : "Concurso, faculdade e o que mais desperta sua curiosidade."}
          </p>
        </div>
        <div className="row-between">
          {subject && (
            <button
              className="icon-button"
              aria-label="Editar matéria"
              title="Editar matéria"
              onClick={() => setEditingSubject(true)}
            >
              <Pencil size={19} />
            </button>
          )}
          <button
            className="button primary"
            onClick={() => (subject ? setNewCourse(true) : setNewSubject(true))}
          >
            <Plus size={17} />
            {subject ? "Adicionar curso" : "Nova matéria"}
          </button>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={
            subject ? "Buscar aula ou conteúdo…" : "Buscar matéria ou conteúdo…"
          }
        />
        {subject ? (
          <select
            aria-label="Filtrar situação"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todas as aulas</option>
            <option value="not-started">A estudar</option>
            <option value="in-progress">Em estudo</option>
            <option value="done">Concluídas</option>
          </select>
        ) : (
          <div className="segmented">
            {[
              ["all", "Tudo"],
              ["concurso", "Concurso"],
              ["faculdade", "Mauá"],
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
        )}
      </div>
      {!subject ? (
        <>
          <div className="integration-strip">
            <span className="round-icon">
              <Layers3 size={21} />
            </span>
            <div>
              <strong>Seu Estratégia já tem um lugar aqui.</strong>
              <p>
                20 cursos · 271 aulas e materiais extras · catálogo conferido em
                14/09/2026
              </p>
            </div>
            <SourceLink url="https://www.estrategiaconcursos.com.br/app/dashboard/cursos">
              Área do aluno
            </SourceLink>
          </div>
          <div className="subject-grid">
            {state.subjects
              .filter(
                (s) =>
                  (track === "all" || s.track === track) &&
                  (normalizeSearch(s.name).includes(q) ||
                    state.lessons.some(
                      (l) => l.subjectId === s.id && matches(l),
                    )),
              )
              .map((s) => {
                const lessons = state.lessons.filter(
                  (l) => l.subjectId === s.id,
                );
                const done = lessons.filter((l) => l.status === "done").length;
                const count = state.cards.filter(
                  (c) => c.subjectId === s.id,
                ).length;
                return (
                  <button
                    className="subject-card"
                    key={s.id}
                    data-testid={`subject-${s.id}`}
                    onClick={() => {
                      setSelected(s.id);
                      setQuery("");
                    }}
                  >
                    <div className="row-between">
                      <span
                        className="subject-icon"
                        style={{ color: s.color, background: `${s.color}18` }}
                      >
                        {s.track === "faculdade" ? (
                          <GraduationCap size={25} />
                        ) : s.track === "concurso" ? (
                          <BookOpen size={23} />
                        ) : (
                          <Trophy size={23} />
                        )}
                      </span>
                      <ArrowUpRight size={19} />
                    </div>
                    <small>
                      {s.track === "faculdade"
                        ? "MAUÁ"
                        : s.track === "concurso"
                          ? "SENADO FEDERAL"
                          : "PESSOAL"}
                    </small>
                    <h3>{s.name}</h3>
                    <p>
                      {lessons.length} aulas · {count} cartões
                    </p>
                    <ProgressBar
                      value={lessons.length ? (done / lessons.length) * 100 : 0}
                      color={s.color}
                    />
                    <footer>
                      {done
                        ? `${done} de ${lessons.length} aulas concluídas`
                        : "Tudo começa com o primeiro passo."}
                    </footer>
                  </button>
                );
              })}
          </div>
        </>
      ) : (
        <div className="course-list">
          {!courses.length && (
            <Empty
              title="Este caminho é seu."
              text="Adicione um curso e organize suas aulas. Seus arquivos e cartões também podem ficar vinculados a esta matéria."
              action={() => setNewCourse(true)}
              label="Adicionar primeiro curso"
            />
          )}
          {courses.map((course) => {
            const all = state.lessons
              .filter((l) => l.courseId === course.id)
              .sort((a, b) => a.order - b.order);
            const filtered = all.filter(matches);
            const done = all.filter((l) => l.status === "done").length;
            const isOpen = openCourses[course.id] !== false;
            return (
              <article className="course-panel" key={course.id}>
                <header>
                  <button
                    className="course-heading"
                    onClick={() =>
                      setOpenCourses({ ...openCourses, [course.id]: !isOpen })
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
                    aria-label={`Editar curso ${course.title}`}
                    title="Editar curso"
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
                        <SourceLink url={course.url}>Abrir curso</SourceLink>
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
                        expanded={expanded === lesson.id}
                        onExpand={() =>
                          setExpanded(expanded === lesson.id ? "" : lesson.id)
                        }
                      />
                    ))}
                    {!filtered.length && (
                      <p className="inline-empty">
                        {all.length
                          ? "Nenhuma aula corresponde ao filtro."
                          : "Adicione sua primeira aula neste curso."}
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
      {newSubject && <SubjectForm close={() => setNewSubject(false)} />}{" "}
      {editingSubject && subject && (
        <SubjectForm subject={subject} close={() => setEditingSubject(false)} />
      )}{" "}
      {editingCourse && (
        <CourseForm
          course={editingCourse}
          subjectId={editingCourse.subjectId}
          close={() => setEditingCourse(null)}
        />
      )}{" "}
      {newCourse && subject && (
        <CourseForm subjectId={subject.id} close={() => setNewCourse(false)} />
      )}{" "}
      {newLesson && (
        <LessonForm course={newLesson} close={() => setNewLesson(null)} />
      )}
    </section>
  );
}
