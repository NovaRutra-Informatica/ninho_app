import React, { createContext, useContext, useEffect, useState } from "react";
import type { AppState, Command, NativeApi } from "../shared/types";
import { applyCommand, createInitialState, validateState } from "../domain";
import { errorMessage } from "./errors";

const unavailable = async (): Promise<never> => {
  throw new Error(
    "Esta função está disponível no aplicativo Ninho para Windows.",
  );
};
export function browserApi(): NativeApi {
  const key = "ninho-web-preview-v1";
  let state: AppState;
  const get = () =>
    (state ??= validateState(
      JSON.parse(localStorage.getItem(key) || "null") || createInitialState(),
    ));
  return {
    load: async () => get(),
    dispatch: async (command) => {
      state = applyCommand(get(), command);
      localStorage.setItem(key, JSON.stringify(state));
      return state;
    },
    importMaterials: unavailable,
    previewMaterial: unavailable,
    openMaterial: unavailable,
    openExternal: unavailable,
    exportBackup: unavailable,
    restoreBackup: unavailable,
    getPaths: async () => ({
      data: "Prévia no navegador",
      backup: "Use a versão Windows",
    }),
  };
}
interface AppContextValue {
  state: AppState;
  api: NativeApi;
  act: (command: Command) => Promise<void>;
  replace: (state: AppState) => void;
  notify: (message: string, error?: boolean) => void;
  busy: boolean;
}
const Context = createContext<AppContextValue | null>(null);
export const useApp = () => {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider ausente");
  return value;
};
export function AppProvider({
  children,
  nativeApi,
}: {
  children: React.ReactNode;
  nativeApi?: NativeApi;
}) {
  const [api] = useState(() => nativeApi || window.ninho || browserApi());
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<{
    text: string;
    error: boolean;
    id: number;
  } | null>(null);
  const notify = (text: string, error = false) =>
    setToast({
      text: error ? errorMessage(text) : text,
      error,
      id: Date.now(),
    });
  useEffect(() => {
    let live = true;
    api
      .load()
      .then((data) => live && setState(data))
      .catch(
        (e) =>
          live &&
          setError(errorMessage(e, "Não foi possível abrir seus dados.")),
      );
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const act = async (command: Command) => {
    setPending((n) => n + 1);
    try {
      setState(await api.dispatch(command));
    } catch (e) {
      notify(errorMessage(e), true);
      throw e;
    } finally {
      setPending((n) => n - 1);
    }
  };
  if (error)
    return (
      <div className="boot-screen">
        <h1>Vamos cuidar dos seus dados.</h1>
        <p>Não foi possível abrir o Ninho. Seus arquivos foram preservados.</p>
        <pre>{error}</pre>
        <button onClick={() => location.reload()}>Tentar novamente</button>
      </div>
    );
  if (!state)
    return (
      <div className="boot-screen">
        <div className="loading-orbit" />
        <h2>Preparando seu Ninho…</h2>
      </div>
    );
  return (
    <Context.Provider
      value={{ state, api, act, replace: setState, notify, busy: pending > 0 }}
    >
      {children}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
          key={toast.id}
        >
          {toast.text}
          <button aria-label="Fechar mensagem" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
