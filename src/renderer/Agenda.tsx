import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { localDate } from "../domain";
import { useApp } from "./store";
import { ExamForm, TaskForm } from "./forms";
import { Confirm, Empty, prettyDate } from "./ui";
import type { Exam, StudyTask } from "../shared/types";
export default function Agenda() {
  const { state, act, notify } = useApp();
  const today = localDate();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(today);
  const [examForm, setExamForm] = useState<Exam | "new" | null>(null);
  const [taskForm, setTaskForm] = useState<StudyTask | "new" | null>(null);
  const [deleting, setDeleting] = useState<{
    type: "exam" | "task";
    id: string;
  } | null>(null);
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const slots = Math.ceil((offset + count) / 7) * 7;
  const exams = [...state.exams].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const tasks = state.tasks.filter((t) => t.date === selected);
  const selectedExams = exams.filter((e) => e.date === selected);
  const pendingExams = exams.filter((e) => !e.completed);
  const daysTo = (date: string) =>
    Math.round(
      (new Date(date + "T12:00:00").getTime() -
        new Date(today + "T12:00:00").getTime()) /
        86400000,
    );
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Um pouco de plano. Mais tranquilidade.</h1>
          <p>Provas, compromissos e pequenos passos para chegar preparado.</p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => setTaskForm("new")}
          >
            <Plus size={17} />
            Nova tarefa
          </button>
          <button className="button primary" onClick={() => setExamForm("new")}>
            <CalendarDays size={17} />
            Marcar prova
          </button>
        </div>
      </div>
      <div className="agenda-layout">
        <div className="panel calendar">
          <header>
            <div>
              <span className="eyebrow">SEU TEMPO, COM INTENÇÃO</span>
              <h2>
                {month.toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>
            <div className="button-row">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="link-button"
                onClick={() => {
                  setMonth(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  );
                  setSelected(today);
                }}
              >
                Hoje
              </button>
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </header>
          <div className="calendar-grid">
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: slots }, (_, index) => {
              const day = index - offset + 1;
              if (day < 1 || day > count)
                return <span key={index} className="blank-day" />;
              const date = localDate(
                new Date(month.getFullYear(), month.getMonth(), day),
              );
              const exam = state.exams.some(
                (e) => e.date === date && !e.completed,
              );
              const task = state.tasks.some(
                (t) => t.date === date && !t.completed,
              );
              return (
                <button
                  key={index}
                  aria-label={prettyDate(date, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  aria-pressed={selected === date}
                  className={`calendar-day ${selected === date ? "selected" : ""} ${today === date ? "today" : ""}`}
                  onClick={() => setSelected(date)}
                >
                  <span>{day}</span>
                  <div>
                    {exam && <i className="exam-dot" />}
                    {task && <i className="task-dot" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i className="exam-dot" />
              Prova
            </span>
            <span>
              <i className="task-dot" />
              Tarefa
            </span>
          </div>
        </div>
        <aside className="panel day-panel">
          <span className="eyebrow">
            {selected === today ? "HOJE" : "DIA SELECIONADO"}
          </span>
          <h2>{prettyDate(selected, { day: "numeric", month: "long" })}</h2>
          {!tasks.length && !selectedExams.length ? (
            <Empty
              title="Um espaço livre."
              text="Planeje uma pequena ação para este dia."
              action={() => setTaskForm("new")}
              label="Adicionar tarefa"
            />
          ) : (
            <>
              {selectedExams.map((exam) => (
                <div className="day-exam" key={exam.id}>
                  <CalendarDays size={20} />
                  <div>
                    <strong>{exam.title}</strong>
                    <small>
                      {exam.time || "Horário a definir"}
                      {exam.completed && " · Concluída"}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Editar prova"
                    onClick={() => setExamForm(exam)}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              ))}
              {tasks.map((task) => (
                <div
                  className={`task-row ${task.completed ? "completed" : ""}`}
                  key={task.id}
                >
                  <button
                    className="task-check"
                    aria-label={
                      task.completed
                        ? `Reabrir tarefa ${task.title}`
                        : `Concluir tarefa ${task.title}`
                    }
                    onClick={() =>
                      void act({
                        type: "task.save",
                        task: { ...task, completed: !task.completed },
                      }).catch(() => {})
                    }
                  >
                    {task.completed ? (
                      <Check size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                  <span>{task.title}</span>
                  <button
                    className="icon-button"
                    aria-label="Editar tarefa"
                    onClick={() => setTaskForm(task)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Excluir tarefa"
                    onClick={() => setDeleting({ type: "task", id: task.id })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
          <button
            className="link-button day-add"
            onClick={() => setTaskForm("new")}
          >
            <Plus size={15} />
            Planejar este dia
          </button>
        </aside>
      </div>
      <div className="section-title">
        <h2>Provas e compromissos</h2>
        <small>{pendingExams.length} pendentes</small>
      </div>
      {!exams.length ? (
        <div className="panel">
          <Empty
            title="Qual é a sua próxima prova?"
            text="Adicione as datas da Mauá e dos concursos. Elas aparecerão aqui e na sua tela inicial."
            action={() => setExamForm("new")}
            label="Marcar primeira prova"
            icon={<CalendarDays size={27} />}
          />
        </div>
      ) : (
        <div className="exam-list">
          {exams.map((exam) => {
            const days = daysTo(exam.date);
            return (
              <article
                className={`panel exam-card ${exam.completed ? "completed" : ""}`}
                key={exam.id}
              >
                <div className="exam-date">
                  <strong>{prettyDate(exam.date, { day: "2-digit" })}</strong>
                  <span>{prettyDate(exam.date, { month: "short" })}</span>
                </div>
                <div className="exam-content">
                  <div className="row-between">
                    <small>
                      {state.subjects.find((s) => s.id === exam.subjectId)
                        ?.name || "Geral"}
                    </small>
                    <span
                      className={`badge ${!exam.completed && days >= 0 && days <= 7 ? "coral" : ""}`}
                    >
                      {exam.completed
                        ? "Concluída"
                        : days === 0
                          ? "É hoje"
                          : days < 0
                            ? `Há ${-days} dias`
                            : `Em ${days} dias`}
                    </span>
                  </div>
                  <h3>{exam.title}</h3>
                  <p>
                    {exam.time && (
                      <span>
                        <Clock3 size={14} />
                        {exam.time}
                      </span>
                    )}
                    {exam.location && (
                      <span>
                        <MapPin size={14} />
                        {exam.location}
                      </span>
                    )}
                  </p>
                  {exam.notes && <p className="exam-notes">{exam.notes}</p>}
                </div>
                <div className="exam-actions">
                  <button
                    className="icon-button"
                    aria-label={
                      exam.completed ? "Reabrir prova" : "Concluir prova"
                    }
                    onClick={() =>
                      void act({
                        type: "exam.save",
                        exam: { ...exam, completed: !exam.completed },
                      }).catch(() => {})
                    }
                  >
                    <Check size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Editar prova"
                    onClick={() => setExamForm(exam)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Excluir prova"
                    onClick={() => setDeleting({ type: "exam", id: exam.id })}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {examForm && (
        <ExamForm
          exam={examForm === "new" ? undefined : examForm}
          selectedDate={selected}
          close={() => setExamForm(null)}
        />
      )}{" "}
      {taskForm && (
        <TaskForm
          task={taskForm === "new" ? undefined : taskForm}
          selectedDate={selected}
          close={() => setTaskForm(null)}
        />
      )}{" "}
      {deleting && (
        <Confirm
          title={
            deleting.type === "exam"
              ? "Excluir esta prova?"
              : "Excluir esta tarefa?"
          }
          text="Este compromisso será removido da sua agenda."
          close={() => setDeleting(null)}
          confirm={async () => {
            await act({
              type: deleting.type === "exam" ? "exam.delete" : "task.delete",
              id: deleting.id,
            });
            notify("Compromisso removido.");
          }}
        />
      )}
    </section>
  );
}
