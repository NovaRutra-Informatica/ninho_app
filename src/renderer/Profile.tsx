import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  emptyProfile,
  profileContext,
  type StudentProfile,
} from "../shared/profile";
import { useApp } from "./store";
import { Owl } from "./ui";

import {
  ProfileQuestions,
  profileSteps,
  resumedStep,
  rememberStep,
  validProfileTimes,
} from "./ProfileQuestions";
import { WelcomeGuide } from "./WelcomeGuide";
import { clearActivity } from "./activity";
const AiChat = lazy(() => import("./AiChat"));
export default function Profile({
  welcome = false,
  done,
}: {
  welcome?: boolean;
  done?: () => void;
}) {
  const { state, act, api } = useApp();
  const [draft, setDraft] = useState<StudentProfile>(
    () => state.profile ?? emptyProfile(state.settings.name),
  );
  const [step, setStep] = useState(() =>
    welcome ? resumedStep(state.profile) : 0,
  );
  const stepRef = useRef(step);
  const draftRef = useRef(draft);
  const pendingDraft = useRef<StudentProfile | null>(null);
  const savingDraft = useRef<Promise<void> | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [moving, setMoving] = useState(false);
  const [phase, setPhase] = useState<
    "editing" | "saving" | "generating" | "ready"
  >("editing");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(state.profile?.plan ?? "");
  const [planNote, setPlanNote] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [aiSubject, setAiSubject] = useState("");
  const preparing = useRef(false);
  const generationStopped = useRef(false);
  const pending = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const visibility = () => {
      if (document.hidden && preparing.current) {
        generationStopped.current = true;
        if (pending.current)
          void api.aiCancel?.(pending.current).catch(() => {});
      }
    };
    const blur = () => {
      if (preparing.current) {
        generationStopped.current = true;
        if (pending.current)
          void api.aiCancel?.(pending.current).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      alive.current = false;
      if (pending.current) void api.aiCancel?.(pending.current).catch(() => {});
    };
  }, [api]);
  // Coalesce rapid edits and serialize writes so a late draft never overwrites completion.
  async function persistDraft(profile: StudentProfile) {
    if (!validProfileTimes(profile)) return;
    pendingDraft.current = profile;
    if (savingDraft.current) return savingDraft.current;
    setDraftStatus("Guardando suas respostas…");
    const operation = (async () => {
      while (pendingDraft.current) {
        const next = pendingDraft.current;
        pendingDraft.current = null;
        await act({ type: "profile.save", profile: next });
        const stored = (await api.load()).profile!;
        rememberStep(stepRef.current, stored);
      }
      if (alive.current) setDraftStatus("Respostas salvas neste dispositivo.");
    })();
    savingDraft.current = operation;
    try {
      await operation;
    } finally {
      savingDraft.current = null;
    }
  }
  const change = <K extends keyof StudentProfile>(
    key: K,
    value: StudentProfile[K],
  ) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    if (welcome)
      void persistDraft(next).catch(() => {
        if (alive.current) {
          setDraftStatus("");
          setError(
            "Não foi possível guardar suas respostas. Tente continuar novamente.",
          );
        }
      });
  };
  async function moveStep(next: number) {
    if (moving) return;
    if (!draftRef.current.name.trim() && next > 0) {
      setError("Conte como quer ser chamado para continuar.");
      return;
    }
    if (!validProfileTimes(draftRef.current)) {
      setError(
        "Confira os minutos antes de continuar: de 1 a 1440 por dia e de 1 a 240 por sessão.",
      );
      return;
    }
    setMoving(true);
    try {
      await persistDraft(draftRef.current);
      stepRef.current = next;
      rememberStep(next, (await api.load()).profile!);
      setStep(next);
      setError("");
      requestAnimationFrame(() =>
        document.getElementById("welcome-question")?.focus(),
      );
    } catch {
      setError(
        "Não foi possível guardar suas respostas. Tente continuar novamente.",
      );
    } finally {
      setMoving(false);
    }
  }
  async function save(generate: boolean) {
    if (!draftRef.current.name.trim()) {
      setStep(0);
      stepRef.current = 0;
      setError("Conte como quer ser chamado para continuar.");
      return;
    }
    if (!validProfileTimes(draftRef.current)) {
      setError("Confira os minutos antes de continuar.");
      return;
    }
    if (phase !== "editing" || moving) return;
    setError("");
    setPhase("saving");
    preparing.current = generate;
    generationStopped.current = false;
    if (!generate) setPlan("");
    let savedRevision: number | null = null;
    let contextKey = "";
    try {
      await savingDraft.current;
      await act({
        type: "profile.save",
        profile: {
          ...draftRef.current,
          name: draftRef.current.name.trim(),
          completedAt: draftRef.current.completedAt ?? new Date().toISOString(),
        },
      });
      const saved = (await api.load()).profile!;
      if (!alive.current) return;
      savedRevision = saved.revision;
      contextKey = JSON.stringify(profileContext(saved));
      setDraft(saved);
      draftRef.current = saved;
      rememberStep(stepRef.current, saved);
      if (generate && api.aiStatus && api.aiChat) {
        if (document.hidden || generationStopped.current)
          throw new Error(
            "Geração interrompida ao sair do aplicativo. Seu perfil foi salvo.",
          );
        setPhase("generating");
        setPlanNote("Verificando os modelos locais…");
        const status = await api.aiStatus();
        if (!alive.current) return;
        if (document.hidden || generationStopped.current)
          throw new Error(
            "Geração interrompida ao sair do aplicativo. Seu perfil foi salvo.",
          );
        const model =
          status.models.find(
            (m) => m.id === status.activeModel && !m.blockedReason,
          ) ??
          status.models.find((m) => m.recommended && !m.blockedReason) ??
          status.models.find((m) => !m.blockedReason);
        if (!model)
          setPlanNote(
            "Seu perfil está salvo. Nenhum modelo local está disponível; configure um em Minha assistente e gere seu plano aqui depois.",
          );
        else {
          const requestId = crypto.randomUUID();
          pending.current = requestId;
          await act({
            type: "profile.plan",
            contextKey,
            revision: saved.revision,
            plan: "",
            status: "pending",
          });
          if (!alive.current) return;
          if (document.hidden || generationStopped.current)
            throw new Error(
              "Geração interrompida ao sair do aplicativo. Seu perfil foi salvo.",
            );
          setPlanNote(
            `Preparando seu plano com ${model.name}. A primeira resposta pode levar alguns minutos.`,
          );
          const result = await api.aiChat({
            requestId,
            modelId: model.id,
            messages: [
              {
                role: "user",
                content:
                  "Com base no meu perfil canônico, prepare um plano inicial de estudos para sete dias. Respeite meus dias, tempo disponível, objetivos, prazo e dificuldades. Diferencie minhas respostas de sugestões suas. Não invente cursos, compromissos ou desempenho. Inclua revisões e pausas, e indique o que ainda preciso definir. Não altere meus registros.",
              },
            ],
          });
          if (!alive.current || pending.current !== requestId) return;
          if (generationStopped.current)
            throw new Error(
              "Geração interrompida ao sair do aplicativo. Seu perfil foi salvo.",
            );
          await act({
            type: "profile.plan",
            contextKey,
            revision: saved.revision,
            plan: result.content.slice(0, 16000),
            status: "ready",
          });
          setPlan(result.content);
          setPlanNote(
            "Seu plano foi preparado pela IA local. Revise as sugestões e adapte o que precisar.",
          );
        }
      } else
        setPlanNote(
          "Seu perfil está salvo. O acompanhamento local já usa seus objetivos e registros para mostrar próximos passos em Hoje e Minha assistente. Não é necessário instalar um modelo.",
        );
      if (alive.current) setPhase("ready");
    } catch (failure) {
      if (alive.current) {
        setError(
          (failure as Error).message ||
            "Não foi possível concluir. Tente novamente.",
        );
        setPhase("editing");
      }
      if (savedRevision !== null)
        await act({
          type: "profile.plan",
          contextKey,
          revision: savedRevision,
          plan: "",
          status: "error",
        }).catch(() => {});
    } finally {
      preparing.current = false;
      pending.current = null;
    }
  }
  return (
    <section
      className={`profile-page ${welcome ? "welcome-page" : "page-enter"}`}
    >
      {welcome ? (
        <WelcomeGuide step={step} name={draft.name} phase={phase} />
      ) : (
        <div className="profile-intro">
          <Owl happy />
          <h1>{welcome ? "Seu próximo passo começa aqui." : "Meu perfil"}</h1>
          <p>
            {welcome
              ? "Vamos conhecer seus planos e encontrar um ritmo que caiba na sua vida."
              : "Seus objetivos mudam. Seu Ninho acompanha."}
          </p>
        </div>
      )}
      {phase === "generating" || phase === "saving" ? (
        <article
          className="panel profile-form profile-processing"
          aria-live="polite"
        >
          <div className="loading-orbit" />
          <h2>
            {phase === "saving"
              ? "Guardando seu perfil…"
              : "Preparando seu próximo passo…"}
          </h2>
          <p>{planNote}</p>
          {pending.current && (
            <button
              className="button secondary"
              onClick={() => {
                const id = pending.current;
                if (id) void api.aiCancel?.(id).catch(() => {});
              }}
            >
              Cancelar geração
            </button>
          )}
        </article>
      ) : phase === "ready" ? (
        <article className="panel profile-form">
          <span className="round-icon">
            <Check />
          </span>
          <h2>Seu Ninho está pronto.</h2>
          <p>{planNote}</p>
          {plan && <div className="profile-plan">{plan}</div>}
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => {
                if (welcome) done?.();
                else setPhase("editing");
              }}
            >
              {welcome ? "Conhecer meu Ninho" : "Voltar ao meu perfil"}
              <ArrowRight size={17} />
            </button>
          </div>
        </article>
      ) : (
        <form
          className="panel profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (welcome && step < profileSteps.length - 1)
              void moveStep(step + 1);
            else void save(false);
          }}
        >
          <div className="profile-fields" key={welcome ? step : "all"}>
            {welcome ? (
              <>
                <p className="welcome-hint">{profileSteps[step].hint}</p>
                <ProfileQuestions draft={draft} change={change} step={step} />
              </>
            ) : (
              profileSteps.map((item, index) => (
                <section className="profile-section" key={item.title}>
                  <h2>{item.title}</h2>
                  <ProfileQuestions
                    draft={draft}
                    change={change}
                    step={index}
                  />
                </section>
              ))
            )}
          </div>
          {welcome && step === profileSteps.length - 1 && (
            <p className="welcome-privacy">
              Seu perfil fica salvo localmente e orienta o acompanhamento desde
              o primeiro dia. O motor de análise já está incluído no Ninho, sem
              precisar baixar um modelo. Perguntas em branco ficam como
              informações ainda não definidas.
            </p>
          )}
          {error && (
            <p role="alert" className="profile-error">
              {error}
            </p>
          )}
          {!welcome && state.profile?.plan && (
            <details>
              <summary>
                Último plano{" "}
                {state.profile.planProfileRevision !== state.profile.revision
                  ? "(perfil alterado; gere novamente)"
                  : ""}
              </summary>
              <div className="profile-plan">{state.profile.plan}</div>
            </details>
          )}
          <div className="profile-actions">
            {welcome && step > 0 && (
              <button
                type="button"
                className="button secondary"
                disabled={moving}
                onClick={() => void moveStep(step - 1)}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            <button className="button primary" disabled={moving}>
              {welcome && step < profileSteps.length - 1
                ? "Continuar"
                : welcome
                  ? "Criar meu perfil"
                  : "Salvar meu perfil"}
            </button>
          </div>
          {welcome && (
            <p className="welcome-save-note" role="status">
              {!validProfileTimes(draft)
                ? "Confira os minutos para salvar esta alteração."
                : draftStatus ||
                  "Suas respostas são salvas enquanto você preenche."}
            </p>
          )}
          {!welcome && (
            <button
              className="link-button"
              type="button"
              onClick={async () => {
                for (const page of state.profile?.tutorialsSeen ?? [])
                  await act({ type: "profile.tutorial", page, seen: false });
                setPlanNote("Os tutoriais aparecerão ao entrar em cada tela.");
              }}
            >
              <RefreshCw size={15} />
              Rever tutoriais de todas as telas
            </button>
          )}
          {!welcome && planNote && <p role="status">{planNote}</p>}
        </form>
      )}
      {!welcome && phase === "editing" && (
        <section className="panel profile-advanced">
          <h2>Seu acompanhamento local</h2>
          <p>
            As sugestões de Hoje e Minha assistente funcionam com o motor
            incluído no aplicativo. Seus dados não precisam passar por um chat.
          </p>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearActivity();
              setPlanNote(
                "Totais de navegação apagados. Suas sessões de estudo foram mantidas.",
              );
            }}
          >
            Apagar totais de navegação
          </button>
          <button
            type="button"
            className="button secondary"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            Recursos opcionais de IA
          </button>
          {advanced && (
            <>
              <p>
                Avançado: um modelo local pode explicar conteúdos e redigir
                sugestões. É opcional e pode exigir mais memória. A geração é
                interrompida quando o aplicativo sai de primeiro plano ou fica
                oculto.
              </p>
              <button
                className="button secondary"
                type="button"
                onClick={() => void save(true)}
              >
                <Sparkles size={16} />
                Gerar plano com IA local
              </button>
              <label className="field">
                Matéria da conversa opcional
                <select
                  aria-label="Matéria da conversa opcional"
                  value={aiSubject}
                  onChange={(event) => setAiSubject(event.target.value)}
                >
                  <option value="">Todas as matérias</option>
                  {state.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <Suspense fallback={<p>Abrindo recursos opcionais…</p>}>
                <AiChat subjectId={aiSubject} />
              </Suspense>
            </>
          )}
        </section>
      )}
    </section>
  );
}
