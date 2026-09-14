import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, Search, BookOpen, ExternalLink } from "lucide-react";
import { useApp } from "./store";

export function Owl({
  small = false,
  happy = false,
}: {
  small?: boolean;
  happy?: boolean;
}) {
  return (
    <svg
      className={`owl ${small ? "owl-small" : ""} ${happy ? "owl-happy" : ""}`}
      viewBox="0 0 280 260"
      role="img"
      aria-label="Íris, a coruja do Ninho"
    >
      <g className="owl-float">
        <ellipse cx="143" cy="236" rx="70" ry="8" fill="none" />
        <path
          d="M59 204 Q93 190 139 205 Q185 187 224 201 L215 224 Q180 215 141 231 Q97 216 60 223Z"
          fill="#f4dda5"
        />
        <path
          d="M139 205 L141 231 M70 210 Q108 207 130 216 M151 216 Q180 207 212 212"
          fill="none"
          stroke="#b39e70"
          strokeWidth="3"
        />
        <path
          d="M66 80 L69 28 L109 56 Q139 42 169 55 L211 29 L213 88 Q229 126 209 174 Q190 214 139 217 Q80 215 65 172 Q49 126 66 80"
          fill="#80b9a0"
        />
        <path
          d="M68 88 Q71 58 105 57 Q139 55 140 84 Q155 51 186 59 Q215 63 211 101 Q204 147 142 174 Q79 148 68 88"
          fill="#f7f1db"
        />
        <path
          d="M66 111 Q36 151 69 189 Q80 169 88 154"
          fill="#579781"
          className="owl-wing"
        />
        <path d="M211 111 Q241 151 209 189 Q195 164 191 154" fill="#579781" />
        <g className="owl-eyes">
          <ellipse cx="108" cy="99" rx="13" ry="19" fill="#213f37" />
          <ellipse cx="172" cy="99" rx="13" ry="19" fill="#213f37" />
          <circle cx="111" cy="93" r="4" fill="white" />
          <circle cx="175" cy="93" r="4" fill="white" />
        </g>
        <path d="M129 119 Q140 115 151 119 L141 135Z" fill="#dd9659" />
        <path
          d="M116 165 L123 174 L130 165 M137 176 L144 185 L151 176 M158 165 L165 174 L172 165"
          fill="none"
          stroke="#4d8a74"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M116 214 L110 225 M126 215 L124 226 M156 215 L156 226 M166 214 L172 224"
          stroke="#d29c57"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
      {!small && (
        <g fill="#d1e6a6" className="owl-stars">
          <path d="M36 47 l3 9 9 3 -9 3 -3 9 -3-9 -9-3 9-3Z" />
          <path d="M235 94 l2 7 7 2 -7 2 -2 7 -2-7 -7-2 7-2Z" />
          <circle cx="232" cy="190" r="3" />
          <circle cx="41" cy="169" r="3" />
          <path d="M145 15 l2 5 5 2 -5 2 -2 5 -2-5 -5-2 5-2Z" />
        </g>
      )}
    </svg>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href],[tabindex]",
        ) || [],
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(':disabled,input[type="hidden"]') &&
          !element.closest('[hidden],[aria-hidden="true"]') &&
          getComputedStyle(element).display !== "none" &&
          getComputedStyle(element).visibility !== "hidden",
      );
    const frame = requestAnimationFrame(() =>
      (elements()[0] || ref.current)?.focus(),
    );
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const focusable = elements(),
          first = focusable[0],
          last = focusable.at(-1);
        if (!first) {
          event.preventDefault();
          ref.current?.focus();
        } else if (!ref.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", listener);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Fechar janela"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function Empty({
  title,
  text,
  action,
  label,
  icon,
}: {
  title: string;
  text: string;
  action?: () => void;
  label?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <BookOpen size={28} />}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button secondary" onClick={action}>
          {label}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
        >
          <X size={15} />
        </button>
      )}
    </label>
  );
}
export function SubjectSelect({
  value,
  onChange,
  allowAll = false,
  label = "Matéria",
}: {
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
  label?: string;
}) {
  const { state } = useApp();
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allowAll ? "Todas as matérias" : "Geral"}</option>
        {state.subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {` · ${state.programs.find((program) => program.id === s.programId)?.name || "Outros estudos"}`}
          </option>
        ))}
      </select>
    </label>
  );
}
export function SourceLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const { api, notify } = useApp();
  return (
    <button
      type="button"
      className="link-button"
      onClick={() =>
        api.openExternal(url).catch((e) => notify(e.message, true))
      }
    >
      {children}
      <ExternalLink size={14} />
    </button>
  );
}
export function Confirm({
  title,
  text,
  label = "Excluir",
  close,
  confirm,
}: {
  title: string;
  text: string;
  label?: string;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} close={close}>
      <p className="confirm-text">{text}</p>
      <footer className="form-actions">
        <button className="button secondary" onClick={close}>
          Cancelar
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm();
              close();
            } catch {
              setBusy(false);
            }
          }}
        >
          {busy ? "Aguarde…" : label}
        </button>
      </footer>
    </Modal>
  );
}
export function ProgressBar({
  value,
  color,
}: {
  value: number;
  color?: string;
}) {
  const percent = Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="Progresso"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
export const prettyDate = (
  value: string,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(
    value.length === 10 ? value + "T12:00:00" : value,
  ).toLocaleDateString("pt-BR", options || { day: "numeric", month: "short" });
export const uid = () => crypto.randomUUID();
export function timeText(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
}
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
