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
      );
    const timer: TimerState = {
      duration: saved.duration,
      remaining: saved.remaining,
      mode: saved.mode,
      subjectId,
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
  const { state, act, notify } = useApp();
  const [timer, setTimer] = useState<TimerState>(() => restoreTimer(state));
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const finishing = useRef(false);
  const storageWarning = useRef(false);
  const remaining = remainingAt(timer, now);
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
    if (state.sessions.some((session) => session.id === timer.sessionId))
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
        ),
      );
    else if (timer.subjectId !== subjectId)
      setTimer((current) => ({ ...current, subjectId }));
  }, [state.subjects, state.sessions, timer.sessionId, timer.subjectId]);
  const reset = (mode: FocusMode = timer.mode) => {
    if (!finishing.current) setTimer(freshTimer(state, mode, timer.subjectId));
  };
  const finish = async () => {
    if (finishing.current) return;
    const subjectId = state.subjects.some(
      (subject) => subject.id === timer.subjectId,
    )
      ? timer.subjectId
      : "";
    if (state.sessions.some((session) => session.id === timer.sessionId)) {
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
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
            lessonId: "",
            durationMinutes: elapsed / 60,
            completedAt: new Date().toISOString(),
            kind: "focus",
          },
        });
        notify("Sessão guardada. Cada minuto conta.");
      } else if (timer.mode === "break")
        notify("Pausa concluída. Pronto para mais um passo?");
      else {
        notify("Inicie o foco antes de concluir uma sessão.");
        return;
      }
      if (state.settings.sound) {
        try {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          gain.gain.value = 0.04;
          oscillator.frequency.value = 660;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            context.currentTime + 0.6,
          );
          oscillator.stop(context.currentTime + 0.6);
          oscillator.onended = () => void context.close();
        } catch {
          /* Unsupported sound must not lose a saved session. */
        }
      }
      setTimer(
        freshTimer(
          state,
          timer.mode === "focus" ? "break" : "focus",
          subjectId,
        ),
      );
    } catch {
      /* AppProvider displays the persistence error; the elapsed time remains available for retry. */
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
    toggle,
    reset,
    finish,
    setSubject: (subjectId: string) => {
      if (!finishing.current)
        setTimer((current) => ({ ...current, subjectId }));
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
  const { timer, remaining, saving, toggle, reset, finish, setSubject } = focus;
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
          onClick={() => reset("focus")}
        >
          <Timer size={16} />
          Foco
        </button>
        <button
          className={timer.mode === "break" ? "active" : ""}
          disabled={timer.running || saving}
          onClick={() => reset("break")}
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
      <SubjectSelect value={timer.subjectId} onChange={setSubject} />
      <p className="microcopy">
        Você pode fechar esta janela. O cronômetro continua aqui no Ninho.
      </p>
      <div className="focus-actions">
        <button
          className="icon-button"
          data-testid="focus-reset"
          aria-label="Reiniciar"
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
          className="icon-button"
          data-testid="focus-finish"
          title="Concluir sessão"
          aria-label="Concluir sessão"
          disabled={saving}
          onClick={() => void finish()}
        >
          <Check size={20} />
        </button>
      </div>
    </Modal>
  );
}
