import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import { adaptiveOverview, type AdaptiveSignal } from "../domain/adaptive";
import { getMentorOverview, type MentorAction } from "../domain";
import { useApp } from "./store";
import { useActivity, activityStored } from "./activity";
export function useForegroundMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer) clearInterval(timer);
      if (!document.hidden) {
        setNow(new Date());
        timer = setInterval(() => setNow(new Date()), 60000);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return now;
}
export default function ProactiveCards({
  compact = false,
  subjectId,
  onAction,
}: {
  compact?: boolean;
  subjectId?: string;
  onAction: (
    target: AdaptiveSignal["target"] | "agenda",
    subjectId?: string,
    action?: MentorAction,
  ) => void;
}) {
  const { state } = useApp(),
    activity = useActivity(),
    now = useForegroundMinute();
  const overview = useMemo(
    () => adaptiveOverview(state, activity, now, subjectId),
    [state, activity, now, subjectId],
  );
  const recommendations = useMemo(
    () =>
      compact
        ? getMentorOverview(state, now)
            .recommendations.filter(
              (item) =>
                item.target !== "focus" &&
                (!/^(lesson|new):/.test(item.id) ||
                  state.sessions.some(
                    (session) =>
                      session.subjectId === item.subjectId &&
                      session.durationMinutes > 0 &&
                      Date.parse(session.completedAt) <= now.getTime(),
                  ) ||
                  state.lessons.some(
                    (lesson) =>
                      lesson.id === item.lessonId &&
                      lesson.status === "in-progress",
                  )),
            )
            .slice(0, 2)
        : [],
    [state, now, compact],
  );
  const signals = compact
    ? overview.signals.slice(0, Math.max(1, 3 - recommendations.length))
    : overview.signals;
  return (
    <section
      className={`proactive-section ${compact ? "proactive-compact" : ""}`}
      aria-label="Acompanhamento proativo"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">A PARTIR DOS SEUS REGISTROS</span>
          <h2>
            {compact ? "Uma direção para hoje" : "Seu ritmo, com contexto"}
          </h2>
        </div>
        <Leaf size={22} />
      </div>
      <div className="proactive-grid">
        {recommendations.map((item) => (
          <article className="panel proactive-card" key={item.id}>
            <h3>{item.label}</h3>
            <p>{item.reason}</p>
            <button
              className="link-button"
              onClick={() => onAction(item.target, item.subjectId, item)}
            >
              Abrir próximo passo
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
        {signals.map((signal) => (
          <article className="panel proactive-card" key={signal.id}>
            <h3>{signal.title}</h3>
            <p>{signal.summary}</p>
            <details>
              <summary>Por que apareceu?</summary>
              <ul>
                {signal.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <p>{signal.limit}</p>
            </details>
            <button
              className="link-button"
              onClick={() => onAction(signal.target, signal.subjectId)}
            >
              {signal.action}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {!compact && (
        <details className="panel proactive-evidence">
          <summary>
            <ShieldCheck size={16} />O que consigo observar — e o que falta
          </summary>
          <p>
            Nos últimos 28 dias: {overview.samples.sessions} sessões
            registradas, em {overview.samples.days} dias, somando{" "}
            {overview.samples.minutes} min de estudo.
          </p>
          <p>
            Separadamente: {overview.samples.visits} visitas a telas e{" "}
            {overview.samples.activeMinutes} min de uso ativo do Ninho. Esses
            minutos nunca entram na meta de estudo.
          </p>
          <ul>
            {overview.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <p>
            A navegação guarda apenas totais por dia e tela por até 90 dias.
            Conta enquanto o Ninho está visível, em primeiro plano e houve
            interação nos últimos 60 segundos. Não observa outros aplicativos,
            URLs, textos ou teclas digitadas. Ler sem interagir por mais tempo
            pode ficar fora dessa contagem.
          </p>
          {!activityStored() && (
            <p role="status">
              O navegador não conseguiu guardar os totais de navegação. Eles
              estão apenas na memória desta janela.
            </p>
          )}
          <p>
            O acompanhamento funciona com regras e estatísticas locais incluídas
            no aplicativo. Não precisa de um modelo de linguagem, não mede
            domínio ou desatenção e não muda seu plano sozinho.
          </p>
        </details>
      )}
    </section>
  );
}
