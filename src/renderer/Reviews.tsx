import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  CirclePause,
  Flag,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getDueCards } from "../domain";
import { useApp } from "./store";
import { CardForm } from "./forms";
import {
  Confirm,
  Empty,
  Owl,
  SearchBox,
  SourceLink,
  SubjectSelect,
  normalizeSearch,
  prettyDate,
} from "./ui";
import type { Rating, ReviewCard } from "../shared/types";

export default function Reviews({
  initialSubject = "",
  initialMode = "home",
  initialFilter = "all",
  initialCard = "",
}: {
  initialSubject?: string;
  initialMode?: "home" | "library";
  initialFilter?: "all" | "outdated" | "relearn";
  initialCard?: string;
} = {}) {
  const { state, act, busy, notify } = useApp();
  const [mode, setMode] = useState<"home" | "study" | "library">(initialMode);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [revealedCard, setRevealedCard] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReviewCard | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReviewCard | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const ratingPending = useRef(false);
  const focusedCard = useRef("");
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setSubject(initialSubject);
    setMode(initialMode);
    setFilter(initialFilter);
    setQuery("");
    setRevealedCard(null);
    focusedCard.current = "";
  }, [initialSubject, initialMode, initialFilter, initialCard]);
  const due = getDueCards(
    state,
    new Date(Math.max(clock, Date.now())),
    subject,
  );
  const current = due[0];
  const reveal = !!current && revealedCard === current.id;
  const setReveal = (value: boolean) =>
    setRevealedCard(value ? (current?.id ?? null) : null);
  const rate = async (rating: Rating) => {
    if (!current || busy || !reveal || ratingPending.current) return;
    ratingPending.current = true;
    try {
      await act({ type: "card.review", id: current.id, rating });
      setReveal(false);
      setReviewed((n) => n + 1);
    } catch {
    } finally {
      ratingPending.current = false;
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        mode !== "study" ||
        editing ||
        deleting ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if (e.code === "Space" && current && !reveal) {
        e.preventDefault();
        setReveal(true);
      }
      const ratings = ["again", "hard", "good", "easy"] as Rating[];
      if (reveal && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        void rate(ratings[Number(e.key) - 1]);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [mode, reveal, current?.id, busy, editing, deleting]);
  const library = state.cards.filter(
    (c) =>
      (!subject || c.subjectId === subject) &&
      normalizeSearch(c.question + " " + c.answer).includes(
        normalizeSearch(query),
      ) &&
      (filter === "all" ||
        (filter === "outdated" && c.flag === "outdated") ||
        (filter === "relearn" && (c.flag === "relearn" || c.lapses >= 3)) ||
        (filter === "suspended" && c.suspended)),
  );
  useEffect(() => {
    if (
      mode !== "library" ||
      !initialCard ||
      focusedCard.current === initialCard
    )
      return;
    const element = document.getElementById(`card-library-${initialCard}`);
    if (element) {
      focusedCard.current = initialCard;
      element.scrollIntoView?.({
        behavior: state.settings.reducedMotion ? "auto" : "smooth",
        block: "center",
      });
      element.focus({ preventScroll: true });
    }
  }, [
    mode,
    initialCard,
    library.length,
    subject,
    filter,
    state.settings.reducedMotion,
  ]);
  const flag = async (card: ReviewCard, value: ReviewCard["flag"]) => {
    try {
      await act({
        type: "card.flag",
        id: card.id,
        flag: value === card.flag ? "none" : value,
      });
      notify("Sinalização atualizada.");
    } catch {}
  };
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <h1>O que fica com você.</h1>
          <p>
            {state.subjects.length
              ? "Revisões curtas para transformar estudo em memória."
              : "Crie uma matéria em Meus estudos para começar a guardar seus cartões."}
          </p>
        </div>
        <button
          className="button primary"
          disabled={!state.subjects.length}
          title={
            !state.subjects.length
              ? "Crie uma matéria em Meus estudos primeiro."
              : undefined
          }
          onClick={() => setEditing("new")}
        >
          <Plus size={17} />
          Novo cartão
        </button>
      </div>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={mode !== "library" ? "active" : ""}
            onClick={() => setMode("home")}
          >
            Revisar
          </button>
          <button
            className={mode === "library" ? "active" : ""}
            onClick={() => setMode("library")}
          >
            Meu acervo <span>{state.cards.length}</span>
          </button>
        </div>
        <SubjectSelect
          value={subject}
          onChange={(value) => {
            setSubject(value);
            setReveal(false);
          }}
          allowAll
          label="Filtrar matéria"
        />
      </div>
      {mode === "home" && (
        <div className="review-welcome panel">
          <div>
            <span className="eyebrow">UM POUCO, TODOS OS DIAS</span>
            <h2>
              {due.length
                ? `${due.length} conhecimentos esperam por você.`
                : "Sua memória pode respirar."}
            </h2>
            <p>
              {due.length
                ? "Tente responder antes de revelar. A sua resposta ajusta quando o cartão volta."
                : "Você está em dia com as revisões disponíveis. Volte depois ou guarde um novo conhecimento."}
            </p>
            <button
              className="button primary"
              disabled={!due.length}
              onClick={() => {
                setMode("study");
                setReveal(false);
                setReviewed(0);
              }}
            >
              <Play size={17} />
              Começar revisão
            </button>
            <div className="review-facts">
              <span>
                <Brain size={17} />
                {due.filter((c) => c.lastReviewedAt).length} revisões
              </span>
              <span>
                <Sparkles size={17} />
                {due.filter((c) => !c.lastReviewedAt).length} novos hoje
              </span>
            </div>
          </div>
          <Owl happy />
        </div>
      )}
      {mode === "home" && (
        <div className="info-grid">
          <article className="panel tip-panel">
            <Flag size={21} />
            <h3>Um conteúdo mudou?</h3>
            <p>
              Use “Conferir conteúdo” para verificar leis, versões ou
              informações. O Ninho agenda revisões; a atualização da fonte é
              feita por você.
            </p>
            <button
              className="link-button"
              onClick={() => {
                setFilter("outdated");
                setMode("library");
              }}
            >
              Ver conteúdos sinalizados
              <ArrowRight size={15} />
            </button>
          </article>
          <article className="panel tip-panel">
            <RotateCcw size={21} />
            <h3>Esquecer faz parte.</h3>
            <p>
              Se não conseguiu lembrar, escolha “Não lembrei”. “Com esforço”
              significa que você lembrou sem olhar.
            </p>
            <small>Atalhos: espaço revela · 1, 2, 3 e 4 respondem</small>
          </article>
        </div>
      )}
      {mode === "study" &&
        (current ? (
          <div className="review-session">
            <div className="row-between">
              <span>
                {state.subjects.find((s) => s.id === current.subjectId)?.name}
              </span>
              <small>
                {reviewed} revisados nesta sessão · {due.length} disponíveis
              </small>
            </div>
            <article
              className={`review-card panel ${reveal ? "revealed" : ""}`}
              key={current.id}
            >
              <span className="eyebrow">LEMBRE COM SUAS PALAVRAS</span>
              <h2 data-testid="card-review-question">{current.question}</h2>
              {!reveal ? (
                <button
                  className="button primary reveal-button"
                  onClick={() => setReveal(true)}
                >
                  Revelar resposta <span>espaço</span>
                </button>
              ) : (
                <div className="answer-reveal">
                  <div data-testid="card-review-answer" className="card-answer">
                    {current.answer}
                  </div>
                  <div className="card-source">
                    <small>
                      {current.source || "Conhecimento criado por você"} ·
                      guardado em {prettyDate(current.createdAt)}
                    </small>
                    {current.sourceUrl && (
                      <SourceLink url={current.sourceUrl}>
                        Conferir fonte
                      </SourceLink>
                    )}
                  </div>
                </div>
              )}
              <div className="card-flags">
                <button
                  className={current.flag === "outdated" ? "selected" : ""}
                  onClick={() => void flag(current, "outdated")}
                >
                  <Flag size={15} />
                  Conferir conteúdo
                </button>
                <button
                  className={current.flag === "relearn" ? "selected" : ""}
                  onClick={() => void flag(current, "relearn")}
                >
                  <BookIcon />
                  Rever aula
                </button>
                <button
                  onClick={() => setEditing(current)}
                  aria-label="Editar cartão"
                >
                  <Pencil size={15} />
                </button>
              </div>
            </article>
            {reveal && (
              <div className="rating-grid">
                {(
                  [
                    ["again", "Não lembrei", "Mais cedo"],
                    ["hard", "Com esforço", "Um passo menor"],
                    ["good", "Lembrei", "Seguir no ritmo"],
                    ["easy", "Muito fácil", "Mais adiante"],
                  ] as const
                ).map(([rating, label, hint], index) => (
                  <button
                    key={rating}
                    className={`rating ${rating}`}
                    disabled={busy}
                    onClick={() => void rate(rating)}
                  >
                    <kbd>{index + 1}</kbd>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
            )}
            <button
              className="link-button end-review"
              onClick={() => setMode("home")}
            >
              Pausar a revisão
            </button>
          </div>
        ) : (
          <div className="panel review-done">
            <Owl happy />
            <span className="eyebrow">PASSO DADO</span>
            <h2>
              {reviewed
                ? `${reviewed} conhecimentos revisitados.`
                : "Tudo em dia por enquanto."}
            </h2>
            <p>O que você relembra hoje fica mais forte amanhã.</p>
            <button className="button primary" onClick={() => setMode("home")}>
              <Check size={17} />
              Concluir revisão
            </button>
          </div>
        ))}
      {mode === "library" && (
        <>
          <div className="toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Buscar nos cartões…"
            />
            <select
              aria-label="Filtrar cartões"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos os cartões</option>
              <option value="outdated">Conferir conteúdo</option>
              <option value="relearn">Rever aula</option>
              <option value="suspended">Pausados</option>
            </select>
          </div>
          <p className="microcopy">
            Os 71 cartões iniciais vieram de dois PDFs consultados: Banco de
            dados (aula 00) e Literatura (aula 00). As demais aulas estão no
            catálogo para você acrescentar seus conhecimentos.
          </p>
          <div className="card-library">
            {library.map((card) => (
              <article
                className={`panel library-card ${initialCard === card.id ? "mentor-target" : ""}`}
                key={card.id}
                id={`card-library-${card.id}`}
                data-testid={`card-library-${card.id}`}
                tabIndex={-1}
              >
                <div>
                  <small>
                    {state.subjects.find((s) => s.id === card.subjectId)?.name}
                    {card.suspended && " · Pausado"}
                    {card.flag !== "none" &&
                      ` · ${card.flag === "outdated" ? "Conferir conteúdo" : "Rever aula"}`}
                  </small>
                  <h3>{card.question}</h3>
                  <details>
                    <summary>Ver resposta</summary>
                    <p className="preserve-lines">{card.answer}</p>
                    <small>{card.source}</small>
                    {card.sourceUrl && (
                      <SourceLink url={card.sourceUrl}>Fonte</SourceLink>
                    )}
                  </details>
                  <span className="microcopy">
                    {card.lastReviewedAt
                      ? `Próxima revisão: ${prettyDate(card.dueAt)}`
                      : "Novo conhecimento"}{" "}
                    · {card.lapses} esquecimentos
                  </span>
                </div>
                <div className="library-actions">
                  <button
                    className="icon-button"
                    aria-label="Editar cartão"
                    onClick={() => setEditing(card)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Conferir conteúdo"
                    onClick={() => void flag(card, "outdated")}
                  >
                    <Flag size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={
                      card.suspended ? "Retomar cartão" : "Pausar cartão"
                    }
                    onClick={() =>
                      void act({
                        type: "card.suspend",
                        id: card.id,
                        suspended: !card.suspended,
                      }).catch(() => {})
                    }
                  >
                    {card.suspended ? (
                      <Play size={17} />
                    ) : (
                      <CirclePause size={17} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Excluir cartão"
                    onClick={() => setDeleting(card)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
            {!library.length && (
              <Empty
                title="Nenhum cartão por aqui."
                text={
                  state.subjects.length
                    ? "Experimente outro filtro ou guarde um conhecimento novo."
                    : "Crie uma matéria em Meus estudos antes de adicionar cartões."
                }
                action={
                  state.subjects.length ? () => setEditing("new") : undefined
                }
                label="Novo cartão"
              />
            )}
          </div>
        </>
      )}
      {editing && (
        <CardForm
          card={editing === "new" ? undefined : editing}
          subjectId={subject}
          close={() => setEditing(null)}
        />
      )}{" "}
      {deleting && (
        <Confirm
          title="Excluir este cartão?"
          text="O cartão e seu agendamento serão removidos. As aulas e os materiais continuam guardados."
          close={() => setDeleting(null)}
          confirm={async () => {
            await act({ type: "card.delete", id: deleting.id });
            notify("Cartão excluído.");
          }}
        />
      )}
    </section>
  );
}
function BookIcon() {
  return <Brain size={15} />;
}
