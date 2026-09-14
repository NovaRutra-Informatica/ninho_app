import { useState, type FormEvent } from "react";
import { useApp } from "./store";
import { Modal, SubjectSelect, uid } from "./ui";
import type {
  Course,
  Exam,
  Lesson,
  ReviewCard,
  Subject,
  StudyTask,
  Track,
} from "../shared/types";
import { localDate } from "../domain";

function Actions({
  busy,
  close,
  label = "Salvar",
  disabled = false,
}: {
  busy: boolean;
  close: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <footer className="form-actions">
      <button type="button" className="button secondary" onClick={close}>
        Cancelar
      </button>
      <button className="button primary" disabled={busy || disabled}>
        {busy ? "Salvando…" : label}
      </button>
    </footer>
  );
}
export function CardForm({
  card,
  subjectId = "",
  lessonId,
  close,
}: {
  card?: ReviewCard;
  subjectId?: string;
  lessonId?: string;
  close: () => void;
}) {
  const { state, act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({
    id: card?.id || uid(),
    subjectId: card?.subjectId || subjectId || state.subjects[0]?.id || "",
    question: card?.question || "",
    answer: card?.answer || "",
    source: card?.source || "",
    sourceUrl: card?.sourceUrl || "",
    lessonId: card?.lessonId || lessonId,
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await act({ type: "card.save", card: data });
      notify(card ? "Cartão atualizado." : "Novo conhecimento guardado.");
      close();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={card ? "Editar cartão" : "Guardar um conhecimento"}
      subtitle="Uma pergunta clara. Uma resposta que você consegue lembrar."
      close={close}
    >
      <form onSubmit={submit}>
        <SubjectSelect
          value={data.subjectId}
          onChange={(value) =>
            setData({ ...data, subjectId: value, lessonId: undefined })
          }
        />
        {!state.subjects.length && (
          <p className="microcopy">
            Crie uma matéria em Meus estudos antes de adicionar um cartão.
          </p>
        )}
        <label className="field">
          Pergunta
          <textarea
            required
            maxLength={2000}
            rows={2}
            value={data.question}
            onChange={(e) => setData({ ...data, question: e.target.value })}
            placeholder="O que eu preciso conseguir explicar?"
          />
        </label>
        <label className="field">
          Resposta
          <textarea
            required
            maxLength={10000}
            rows={4}
            value={data.answer}
            onChange={(e) => setData({ ...data, answer: e.target.value })}
            placeholder="Use suas palavras. Um exemplo ajuda."
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Fonte
            <input
              value={data.source}
              maxLength={2000}
              onChange={(e) => setData({ ...data, source: e.target.value })}
              placeholder="Aula, livro ou página do PDF"
            />
          </label>
          <label className="field">
            Link da fonte
            <input
              type="url"
              value={data.sourceUrl}
              onChange={(e) => setData({ ...data, sourceUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
        </div>
        <Actions busy={busy} close={close} disabled={!data.subjectId} />
      </form>
    </Modal>
  );
}
export function ExamForm({
  exam,
  selectedDate,
  close,
}: {
  exam?: Exam;
  selectedDate?: string;
  close: () => void;
}) {
  const { state, act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Exam>(
    exam || {
      id: uid(),
      title: "",
      subjectId: state.subjects.find((s) => s.track === "faculdade")?.id || "",
      date: selectedDate || localDate(),
      time: "",
      location: "",
      notes: "",
      completed: false,
    },
  );
  return (
    <Modal
      title={exam ? "Editar prova" : "Uma prova no horizonte"}
      subtitle="Tenha tempo para se preparar, sem depender da memória."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await act({ type: "exam.save", exam: data });
            notify("Prova salva na agenda.");
            close();
          } catch {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Nome da prova
          <input
            required
            value={data.title}
            maxLength={200}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            placeholder="Ex.: Prova de Sistemas Distribuídos"
          />
        </label>
        <SubjectSelect
          value={data.subjectId}
          onChange={(subjectId) => setData({ ...data, subjectId })}
        />
        <div className="form-grid">
          <label className="field">
            Data
            <input
              type="date"
              required
              value={data.date}
              onChange={(e) => setData({ ...data, date: e.target.value })}
            />
          </label>
          <label className="field">
            Horário
            <input
              type="time"
              value={data.time}
              onChange={(e) => setData({ ...data, time: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          Local
          <input
            value={data.location}
            maxLength={500}
            onChange={(e) => setData({ ...data, location: e.target.value })}
            placeholder="Campus, sala ou endereço"
          />
        </label>
        <label className="field">
          Observações
          <textarea
            rows={3}
            value={data.notes}
            maxLength={10000}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
            placeholder="Conteúdo da prova, o que levar, lembretes…"
          />
        </label>
        <Actions busy={busy} close={close} label="Salvar prova" />
      </form>
    </Modal>
  );
}
export function TaskForm({
  task,
  selectedDate,
  close,
}: {
  task?: StudyTask;
  selectedDate?: string;
  close: () => void;
}) {
  const { act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<StudyTask>(
    task || {
      id: uid(),
      title: "",
      date: selectedDate || localDate(),
      subjectId: "",
      completed: false,
    },
  );
  return (
    <Modal
      title={task ? "Editar tarefa" : "Um passo de cada vez"}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await act({ type: "task.save", task: data });
            notify("Tarefa salva.");
            close();
          } catch {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Tarefa
          <input
            required
            value={data.title}
            maxLength={200}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            placeholder="Ex.: Resolver 10 questões de Redes"
          />
        </label>
        <label className="field">
          Data
          <input
            type="date"
            required
            value={data.date}
            onChange={(e) => setData({ ...data, date: e.target.value })}
          />
        </label>
        <SubjectSelect
          value={data.subjectId}
          onChange={(subjectId) => setData({ ...data, subjectId })}
        />
        <Actions busy={busy} close={close} label="Salvar tarefa" />
      </form>
    </Modal>
  );
}
export function SubjectForm({
  subject,
  close,
}: {
  subject?: Subject;
  close: () => void;
}) {
  const { act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Subject>(
    subject || { id: uid(), name: "", track: "faculdade", color: "#729a84" },
  );
  return (
    <Modal
      title={subject ? "Editar matéria" : "Um novo caminho"}
      subtitle="Adicione uma matéria da faculdade ou de qualquer concurso."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await act({ type: "subject.save", subject: data });
            notify(subject ? "Matéria atualizada." : "Matéria criada.");
            close();
          } catch {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Nome da matéria
          <input
            required
            maxLength={120}
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Objetivo
            <select
              value={data.track}
              onChange={(e) =>
                setData({ ...data, track: e.target.value as Track })
              }
            >
              <option value="concurso">Concurso</option>
              <option value="faculdade">Faculdade</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </label>
          <label className="field">
            Cor
            <input
              type="color"
              value={data.color}
              onChange={(e) => setData({ ...data, color: e.target.value })}
            />
          </label>
        </div>
        <Actions
          busy={busy}
          close={close}
          label={subject ? "Salvar matéria" : "Criar matéria"}
        />
      </form>
    </Modal>
  );
}
export function CourseForm({
  subjectId,
  course,
  close,
}: {
  subjectId: string;
  course?: Course;
  close: () => void;
}) {
  const { act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Course>(
    course || { id: uid(), subjectId, title: "", provider: "Pessoal", url: "" },
  );
  return (
    <Modal title={course ? "Editar curso" : "Adicionar curso"} close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await act({ type: "course.save", course: data });
            notify(course ? "Curso atualizado." : "Curso adicionado.");
            close();
          } catch {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Nome do curso
          <input
            required
            maxLength={300}
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </label>
        <label className="field">
          Instituição ou plataforma
          <input
            required
            maxLength={120}
            value={data.provider}
            onChange={(e) => setData({ ...data, provider: e.target.value })}
          />
        </label>
        <label className="field">
          Link do curso
          <input
            type="url"
            value={data.url}
            onChange={(e) => setData({ ...data, url: e.target.value })}
            placeholder="Opcional"
          />
        </label>
        <Actions
          busy={busy}
          close={close}
          label={course ? "Salvar curso" : "Adicionar curso"}
        />
      </form>
    </Modal>
  );
}
export function LessonForm({
  course,
  lesson,
  close,
}: {
  course: Course;
  lesson?: Lesson;
  close: () => void;
}) {
  const { state, act, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<
    Pick<
      Lesson,
      | "id"
      | "courseId"
      | "subjectId"
      | "title"
      | "description"
      | "url"
      | "order"
    >
  >(
    lesson
      ? {
          id: lesson.id,
          courseId: lesson.courseId,
          subjectId: lesson.subjectId,
          title: lesson.title,
          description: lesson.description,
          url: lesson.url,
          order: lesson.order,
        }
      : {
          id: uid(),
          courseId: course.id,
          subjectId: course.subjectId,
          title: "",
          description: "",
          url: "",
          order: state.lessons.filter((l) => l.courseId === course.id).length,
        },
  );
  return (
    <Modal
      title={lesson ? "Editar aula" : "Adicionar aula"}
      subtitle={course.title}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await act({ type: "lesson.save", lesson: data });
            notify(lesson ? "Aula atualizada." : "Aula adicionada.");
            close();
          } catch {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Nome da aula
          <input
            required
            value={data.title}
            maxLength={200}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </label>
        <label className="field">
          Conteúdo
          <textarea
            rows={3}
            value={data.description}
            maxLength={5000}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </label>
        <label className="field">
          Link da aula
          <input
            type="url"
            value={data.url}
            onChange={(e) => setData({ ...data, url: e.target.value })}
          />
        </label>
        <Actions
          busy={busy}
          close={close}
          label={lesson ? "Salvar aula" : "Adicionar aula"}
        />
      </form>
    </Modal>
  );
}
