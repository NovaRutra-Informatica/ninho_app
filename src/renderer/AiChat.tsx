import { useEffect, useRef, useState, type FormEvent } from "react";
import { Cpu, RefreshCw, Send, Sparkles, Square, Trash2 } from "lucide-react";
import type { AiChatRequest, AiStatus } from "../shared/types";
import { useApp } from "./store";
import { scrollBehavior } from "./motion";
import { errorMessage } from "./errors";

type Message = AiChatRequest["messages"][number];
const suggestions = [
  "Por onde eu começo hoje?",
  "Me ajude a entender um assunto",
  "Crie um exercício para eu praticar",
];

function ResponseText({ text }: { text: string }) {
  // Render only emphasis/code as React text; model output never becomes HTML or links.
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {text
        .split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g)
        .map((part, index) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={index}>{part.slice(2, -2)}</strong>
          ) : part.startsWith("`") && part.endsWith("`") ? (
            <code key={index}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </div>
  );
}

export default function AiChat({ subjectId = "" }: { subjectId?: string }) {
  const { api, state } = useApp();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [modelId, setModelId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef<string | null>(null);
  const refreshRequest = useRef(0);
  const alive = useRef(true);
  const lastMessage = useRef<HTMLDivElement>(null);
  const available = Boolean(api.aiChat && api.aiStatus);

  const refresh = async () => {
    if (!api.aiStatus) return;
    const request = ++refreshRequest.current;
    setRefreshing(true);
    try {
      const value = await api.aiStatus();
      if (!alive.current || request !== refreshRequest.current) return;
      setConnectionError("");
      setStatus(value);
      setModelId((selected) =>
        value.models.some(
          (model) => model.id === selected && !model.blockedReason,
        )
          ? selected
          : value.models.find((model) => !model.blockedReason)?.id || "",
      );
    } catch (failure) {
      if (alive.current && request === refreshRequest.current)
        setConnectionError(
          errorMessage(
            failure,
            "Não foi possível verificar a conexão com o LM Studio.",
          ),
        );
    } finally {
      if (alive.current && request === refreshRequest.current)
        setRefreshing(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      refreshRequest.current++;
      if (pending.current)
        void api.aiCancel?.(pending.current).catch(() => undefined);
    };
  }, [api]);
  useEffect(() => {
    lastMessage.current?.scrollIntoView?.({
      block: "nearest",
      behavior: scrollBehavior(state.settings.reducedMotion),
    });
  }, [messages, working]);

  const send = async (question: string) => {
    const text = question.trim();
    if (
      !text ||
      !modelId ||
      !api.aiChat ||
      pending.current ||
      text.length > 8000
    )
      return;
    const id = crypto.randomUUID();
    pending.current = id;
    setWorking(true);
    setError("");
    setInput("");
    let history = [...messages, { role: "user" as const, content: text }].slice(
      -12,
    );
    while (
      history.length > 1 &&
      history.reduce((size, message) => size + message.content.length, 0) >
        20_000
    )
      history = history.slice(1);
    setMessages((previous) => [...previous, { role: "user", content: text }]);
    try {
      const reply = await api.aiChat({
        requestId: id,
        modelId,
        messages: history,
        ...(subjectId ? { subjectId } : {}),
      });
      if (alive.current)
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: reply.content },
        ]);
    } catch (failure) {
      if (alive.current) {
        setError(errorMessage(failure, "Não foi possível responder agora."));
        setInput(text);
        setMessages((previous) => previous.slice(0, -1));
      }
    } finally {
      pending.current = null;
      if (alive.current) {
        setWorking(false);
        void refresh();
      }
    }
  };
  const stop = async () => {
    if (!pending.current) return;
    try {
      await api.aiCancel?.(pending.current);
    } catch (failure) {
      if (alive.current)
        setError(
          errorMessage(failure, "Não foi possível interromper a resposta."),
        );
    }
  };
  const unload = async () => {
    setError("");
    try {
      await api.aiUnload?.();
      await refresh();
    } catch (failure) {
      if (alive.current)
        setError(
          errorMessage(
            failure,
            "Não foi possível liberar a memória do modelo.",
          ),
        );
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };
  const subjectName =
    state.subjects.find((subject) => subject.id === subjectId)?.name ||
    "Todos os meus estudos";

  return (
    <section
      className="panel ai-chat"
      aria-labelledby="ai-chat-title"
      data-testid="ai-chat"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">CONVERSA COM IA LOCAL</span>
          <h2 id="ai-chat-title">
            <Sparkles size={22} /> Pode falar comigo
          </h2>
          <p>
            Eu uso seus registros para ajudar a planejar, explicar e praticar.
          </p>
        </div>
        <span className="pill">
          <Cpu size={14} /> No seu computador
        </span>
      </div>
      {!available ? (
        <p className="ai-status">
          A conversa com IA está disponível no aplicativo Ninho para Windows,
          conectado ao LM Studio.
        </p>
      ) : (
        <>
          <div className="ai-toolbar">
            <label>
              Modelo leve
              <select
                aria-label="Modelo de IA"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={working || refreshing}
              >
                {!modelId && <option value="">Selecione um modelo</option>}
                {status?.models.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                    disabled={Boolean(model.blockedReason)}
                  >
                    {model.name}
                    {model.sizeBytes
                      ? ` · ${(model.sizeBytes / 1_000_000_000).toFixed(1)} GB`
                      : ""}
                    {model.blockedReason
                      ? " · muito grande ou incompatível"
                      : model.recommended
                        ? " · recomendado"
                        : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              onClick={() => void refresh()}
              disabled={working || refreshing}
              aria-label="Atualizar conexão da IA"
            >
              <RefreshCw size={16} />
              {refreshing ? "Conectando…" : "Atualizar"}
            </button>
            {status?.ownedModel && (
              <button
                className="button secondary"
                onClick={() => void unload()}
                disabled={working}
              >
                <Cpu size={16} /> Liberar memória
              </button>
            )}
          </div>
          <p className="ai-status" role="status">
            {(status?.error ? errorMessage(status.error) : "") ||
              (status?.available
                ? "LM Studio conectado."
                : refreshing
                  ? "Verificando o LM Studio…"
                  : "LM Studio ainda não conectado.")}{" "}
            O modelo é carregado ao enviar e sai da memória após 5 minutos sem
            uso quando aberto pelo Ninho.
          </p>
          <div className="ai-context">
            <span className="pill">{subjectName}</span>
            <small>
              A conversa recebe um resumo dos seus estudos. Arquivos e vídeos
              não são lidos automaticamente.
            </small>
          </div>
          <div
            className="ai-messages"
            role="log"
            aria-label="Conversa com Íris"
          >
            {!messages.length && (
              <div className="ai-welcome">
                <p>
                  Oi, {state.settings.name.split(" ")[0]}! Vamos destravar seus
                  estudos?
                </p>
                <p>
                  Posso explicar uma ideia passo a passo, criar exercícios e
                  ajustar um plano junto com você.
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <div className={`ai-message ${message.role}`} key={index}>
                <strong>{message.role === "user" ? "Você" : "Íris"}</strong>
                <ResponseText text={message.content} />
              </div>
            ))}
            {working && (
              <div className="ai-message assistant ai-thinking" role="status">
                <Sparkles size={17} /> Preparando sua resposta… O primeiro
                pedido pode levar um pouco mais.
              </div>
            )}
            <div ref={lastMessage} />
          </div>
          {!messages.length && (
            <div className="ai-suggestions">
              {suggestions.map((question) => (
                <button
                  key={question}
                  className="button secondary"
                  disabled={working || !modelId}
                  onClick={() => void send(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          {(error || connectionError) && (
            <p className="ai-error" role="alert">
              {error || connectionError}
            </p>
          )}
          <form className="ai-composer" onSubmit={submit}>
            <textarea
              aria-label="Converse com Íris"
              placeholder="Pergunte, conte uma dificuldade ou cole um trecho da aula…"
              rows={3}
              maxLength={8000}
              value={input}
              disabled={working}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void send(input);
                }
              }}
            />
            <div>
              <small>
                Ctrl + Enter para enviar · Pode haver erros: confira informações
                importantes.
              </small>
              {working ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void stop()}
                >
                  <Square size={16} /> Interromper
                </button>
              ) : (
                <button
                  className="button primary"
                  type="submit"
                  disabled={!input.trim() || !modelId || refreshing}
                >
                  <Send size={16} /> Enviar à Íris
                </button>
              )}
            </div>
          </form>
          {messages.length > 0 && (
            <button
              className="button secondary"
              disabled={working}
              onClick={() => {
                setMessages([]);
                setError("");
              }}
            >
              <Trash2 size={15} /> Nova conversa
            </button>
          )}
        </>
      )}
    </section>
  );
}
