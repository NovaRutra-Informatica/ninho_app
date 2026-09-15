import { useEffect, useRef, useState } from "react";
import { Coffee, Play, Pause, RotateCcw, Check, Timer } from "lucide-react";
import type { AppState } from "../shared/types";
import { useApp } from "./store";
import { Modal, SubjectSelect, timeText, uid } from "./ui";

type FocusMode = "focus" | "break";
interface TimerState {
  duration: number;
  remaining: number;
  endAt: number | null;
  running: boolean;
  mode: FocusMode;
  subjectId: string;
  lessonId: string;
  sessionId: string;
}
const storageKey = "ninho-focus-v1";
const remainingAt = (timer: TimerState, now: number) =>
  timer.running && timer.endAt !== null
    ? Math.min(timer.duration, Math.max(0, (timer.endAt - now) / 1000))
    : timer.remaining;
function freshTimer(
  state: AppState,
  mode: FocusMode = "focus",
  subjectId = "",
  lessonId = "",
): TimerState {
  const duration =
    (mode === "focus"
      ? state.settings.focusMinutes
      : state.settings.breakMinutes) * 60;
  return {
    duration,
    remaining: duration,
    endAt: null,
    running: false,
    mode,
    subjectId,
    lessonId,
    sessionId: uid(),
  };
}
function restoreTimer(state: AppState): TimerState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      !saved ||
      typeof saved !== "object" ||
      !Number.isFinite(saved.duration) ||
      saved.duration < 60 ||
      saved.duration > 10800 ||
      !Number.isFinite(saved.remaining) ||
      saved.remaining < 0 ||
      saved.remaining > saved.duration ||
      !["focus", "break"].includes(saved.mode) ||
      typeof saved.running !== "boolean" ||
      !(saved.endAt === null || Number.isFinite(saved.endAt))
    )
      return freshTimer(state);
    const subjectId =
      typeof saved.subjectId === "string" &&
      state.subjects.some((subject) => subject.id === saved.subjectId)
        ? saved.subjectId
        : "";
    const lessonId = typeof saved.lessonId === "string" ? saved.lessonId : "";
    const sessionId =
      typeof saved.sessionId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        saved.sessionId,
      )
        ? saved.sessionId
        : uid();
    if (state.sessions.some((session) => session.id === sessionId))
      return freshTimer(
        state,
        saved.mode === "focus" ? "break" : "focus",
        subjectId,
        state.lessons.some(
          (lesson) => lesson.id === lessonId && lesson.subjectId === subjectId,
        )
          ? lessonId
          : "",
      );
    const timer: TimerState = {
      duration: saved.duration,
      remaining: saved.remaining,
      mode: saved.mode,
      subjectId,
      lessonId,
      sessionId,
      running: saved.running,
      endAt: saved.endAt,
    };
    return {
      ...timer,
      remaining: remainingAt(timer, Date.now()),
      running: false,
      endAt: null,
    };
  } catch {
    return freshTimer(state);
  }
}

export function useFocus() {
  const { state, act, notify, playSound } = useApp();
  const [timer, setTimer] = useState<TimerState>(() => restoreTimer(state));
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const finishing = useRef(false);
  const storageWarning = useRef(false);
  const remaining = remainingAt(timer, now);
  const hasProgress = timer.running || remaining < timer.duration;
  const contextName = () => {
    const subject = state.subjects.find((item) => item.id === timer.subjectId);
    const lesson = state.lessons.find((item) => item.id === timer.lessonId);
    return (
      [subject?.name, lesson?.title].filter(Boolean).join(" · ") || "foco geral"
    );
  };
  const warnContextLocked = () =>
    notify(
      `Conclua ou reinicie a sessão de ${contextName()} antes de trocar de aula, matéria ou modo. O tempo continua na sessão atual.`,
    );
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(timer));
    } catch {
      if (!storageWarning.current) {
        storageWarning.current = true;
        notify(
          "Não foi possível guardar o cronômetro. Mantenha o Ninho aberto até concluir.",
          true,
        );
      }
    }
  }, [timer]);
  useEffect(() => {
    if (finishing.current) return;
    const subjectId = state.subjects.some(
      (subject) => subject.id === timer.subjectId,
    )
      ? timer.subjectId
      : "";
    const lessonId = state.lessons.some(
      (lesson) =>
        lesson.id === timer.lessonId && lesson.subjectId === subjectId,
    )
      ? timer.lessonId
      : "";
    if (state.sessions.some((session) => session.id === timer.sessionId)) {
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
          lessonId,
        ),
      );
    } else if (timer.subjectId !== subjectId || timer.lessonId !== lessonId) {
      setTimer((current) => ({ ...current, subjectId, lessonId }));
      if (timer.lessonId)
        notify(
          "A aula anterior não está disponível nesta coleção. O tempo foi preservado como foco sem aula específica; nenhum minuto foi transferido para outra aula.",
        );
    }
  }, [
    state.subjects,
    state.lessons,
    state.sessions,
    timer.sessionId,
    timer.subjectId,
    timer.lessonId,
  ]);
  const reset = (mode: FocusMode = timer.mode) => {
    if (finishing.current) return;
    if (
      mode !== timer.mode &&
      (timer.running || remainingAt(timer, Date.now()) < timer.duration)
    ) {
      warnContextLocked();
      return;
    }
    setTimer(freshTimer(state, mode, timer.subjectId, timer.lessonId));
  };
  const requestContext = (
    subjectId: string,
    lessonId: string,
    mode = timer.mode,
  ): boolean => {
    if (finishing.current) {
      notify("Aguarde o salvamento da sessão atual antes de trocar de aula.");
      return false;
    }
    if (
      (subjectId && !state.subjects.some((item) => item.id === subjectId)) ||
      (lessonId &&
        !state.lessons.some(
          (item) => item.id === lessonId && item.subjectId === subjectId,
        ))
    ) {
      notify("Esta aula ou matéria não está disponível nesta coleção.", true);
      return false;
    }
    if (
      subjectId === timer.subjectId &&
      lessonId === timer.lessonId &&
      mode === timer.mode
    )
      return true;
    if (timer.running || remainingAt(timer, Date.now()) < timer.duration) {
      warnContextLocked();
      return false;
    }
    setTimer(freshTimer(state, mode, subjectId, lessonId));
    return true;
  };
  const finish = async () => {
    if (finishing.current) return;
    const subjectId = state.subjects.some(
      (subject) => subject.id === timer.subjectId,
    )
      ? timer.subjectId
      : "";
    const lessonId = state.lessons.some(
      (lesson) =>
        lesson.id === timer.lessonId && lesson.subjectId === subjectId,
    )
      ? timer.lessonId
      : "";
    if (state.sessions.some((session) => session.id === timer.sessionId)) {
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
          lessonId,
        ),
      );
      return;
    }
    finishing.current = true;
    setSaving(true);
    const remaining = remainingAt(timer, Date.now());
    const elapsed = Math.max(0, timer.duration - remaining);
    setTimer((current) => ({
      ...current,
      remaining,
      running: false,
      endAt: null,
    }));
    try {
      if (timer.mode === "focus" && elapsed >= 1) {
        await act({
          type: "session.add",
          session: {
            id: timer.sessionId,
            subjectId,
            lessonId,
            durationMinutes: elapsed / 60,
            completedAt: new Date().toISOString(),
            kind: "focus",
          },
        });
        notify("Sessão guardada. Cada minuto conta.");
      } else if (timer.mode === "break") {
        notify("Pausa concluída. Pronto para mais um passo?");
        playSound("complete");
      } else {
        notify("Inicie o foco antes de concluir uma sessão.");
        return;
      }
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
          lessonId,
        ),
      );
    } catch {
      /* Keep elapsed time for retry; AppProvider reports the error. */
    } finally {
      finishing.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (timer.running && remaining === 0) void finish();
  }, [remaining, timer.running]);
  const toggle = () => {
    if (finishing.current) return;
    const currentTime = Date.now();
    setNow(currentTime);
    setTimer((current) =>
      current.running
        ? {
            ...current,
            running: false,
            remaining: remainingAt(current, currentTime),
            endAt: null,
          }
        : {
            ...current,
            running: true,
            endAt: currentTime + current.remaining * 1000,
          },
    );
  };
  return {
    timer,
    remaining,
    saving,
    hasProgress,
    toggle,
    reset,
    finish,
    setSubject: (subjectId: string) =>
      requestContext(
        subjectId,
        subjectId === timer.subjectId ? timer.lessonId : "",
      ),
    setLesson: (lessonId: string) => requestContext(timer.subjectId, lessonId),
    selectLesson: (lessonId: string) => {
      const lesson = state.lessons.find((item) => item.id === lessonId);
      if (!lesson) {
        notify("Esta aula não está mais disponível.", true);
        return false;
      }
      return requestContext(lesson.subjectId, lesson.id, "focus");
    },
  };
}
export type FocusController = ReturnType<typeof useFocus>;
export function FocusModal({
  focus,
  close,
}: {
  focus: FocusController;
  close: () => void;
}) {
  const { state } = useApp();
  const {
    timer,
    remaining,
    saving,
    hasProgress,
    toggle,
    reset,
    finish,
    setSubject,
    setLesson,
  } = focus;
  const subject = state.subjects.find((item) => item.id === timer.subjectId);
  const lesson = state.lessons.find((item) => item.id === timer.lessonId);
  const lessons = state.lessons.filter(
    (item) => item.subjectId === timer.subjectId,
  );
  return (
    <Modal
      title="Um tempo só para estudar"
      subtitle="Escolha uma coisa. O resto pode esperar."
      close={close}
    >
      <div className="focus-tabs">
        <button
          className={timer.mode === "focus" ? "active" : ""}
          disabled={timer.running || saving}
          onClick={() => {
            if (timer.mode !== "focus") reset("focus");
          }}
        >
          <Timer size={16} />
          Foco
        </button>
        <button
          className={timer.mode === "break" ? "active" : ""}
          disabled={timer.running || saving}
          onClick={() => {
            if (timer.mode !== "break") reset("break");
          }}
        >
          <Coffee size={16} />
          Pausa
        </button>
      </div>
      <div
        className="timer-dial"
        style={
          {
            "--progress": `${100 * (1 - remaining / timer.duration)}%`,
          } as React.CSSProperties
        }
      >
        <span data-testid="focus-timer">{timeText(Math.ceil(remaining))}</span>
        <small>
          {timer.mode === "focus"
            ? "Presente, um minuto de cada vez."
            : "Respire. Alongue. Beba água."}
        </small>
      </div>
      <fieldset className="focus-context" disabled={saving || hasProgress}>
        <SubjectSelect value={timer.subjectId} onChange={setSubject} />
        <label className="field">
          Aula
          <select
            value={timer.lessonId}
            onChange={(event) => setLesson(event.target.value)}
          >
            <option value="">Sem aula específica</option>
            {lessons.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ·{" "}
                {state.courses.find((course) => course.id === item.courseId)
                  ?.title || ""}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p className="focus-context-note" data-testid="focus-lesson">
        {lesson
          ? `Tempo vinculado a ${subject?.name} · ${lesson.title}.`
          : subject
            ? `Foco em ${subject.name}, sem aula específica.`
            : "Foco geral, sem aula específica."}
        {hasProgress && " Conclua ou reinicie antes de trocar o vínculo."}
      </p>
      <p className="microcopy">
        Você pode fechar esta janela. O cronômetro continua aqui no Ninho. O
        tempo entra no histórico ao concluir; reiniciar descarta o tempo ainda
        não salvo.
      </p>
      <div className="focus-actions">
        <button
          className="icon-button"
          data-testid="focus-reset"
          aria-label="Reiniciar"
          title="Reiniciar e descartar o tempo ainda não salvo"
          disabled={saving}
          onClick={() => reset()}
        >
          <RotateCcw size={20} />
        </button>
        <button
          className="button primary"
          data-testid={timer.running ? "focus-pause" : "focus-start"}
          disabled={saving}
          onClick={toggle}
        >
          {timer.running ? <Pause size={18} /> : <Play size={18} />}{" "}
          {timer.running
            ? "Pausar"
            : remaining < timer.duration
              ? "Retomar"
              : timer.mode === "break"
                ? "Começar pausa"
                : "Começar foco"}
        </button>
        <button
          className="button secondary"
          data-testid="focus-finish"
          title="Concluir sessão"
          aria-label="Concluir sessão"
          disabled={saving}
          onClick={() => void finish()}
        >
          <Check size={20} />
          Concluir sessão
        </button>
      </div>
    </Modal>
  );
}
