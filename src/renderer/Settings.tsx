import { useEffect, useRef, useState } from "react";
import {
  Download,
  FolderHeart,
  Laptop,
  Moon,
  ShieldCheck,
  Sun,
  Upload,
} from "lucide-react";
import { useApp } from "./store";
import { settingsSchema } from "../domain";
import type { Settings as SettingsValue } from "../shared/types";
import { Confirm } from "./ui";
import { clearActivity } from "./activity";
export default function Settings() {
  const { state, act, api, replace, notify } = useApp();
  const [settings, setDraft] = useState(state.settings);
  const [saveStatus, setSaveStatus] = useState(
    "As alterações são salvas automaticamente.",
  );
  const saveSequence = useRef(0);
  function setSettings(next: SettingsValue) {
    setDraft(next);
    const patch: Partial<SettingsValue> = {};
    for (const key of Object.keys(next) as (keyof SettingsValue)[]) {
      if (next[key] !== settings[key]) {
        const result = settingsSchema.shape[key].safeParse(next[key]);
        if (!result.success) {
          setSaveStatus("Complete o campo com um valor válido para salvar.");
          return;
        }
        Object.assign(patch, { [key]: result.data });
      }
    }
    const sequence = ++saveSequence.current;
    setSaveStatus("Salvando…");
    void act({ type: "settings.update", patch })
      .then(() => {
        if (sequence === saveSequence.current)
          setSaveStatus("Tudo salvo neste computador.");
      })
      .catch(() => {
        if (sequence === saveSequence.current)
          setSaveStatus(
            "Não foi possível salvar. Altere o campo para tentar novamente.",
          );
      });
  }
  const [paths, setPaths] = useState({ data: "", backup: "" });
  const [restore, setRestore] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  useEffect(() => {
    void api
      .getPaths()
      .then(setPaths)
      .catch((e) => notify(e.message, true));
  }, []);
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Do seu jeito.</h1>
          <p>Um ritmo possível é melhor que uma rotina impossível.</p>
        </div>
      </div>
      <form className="settings-grid" onSubmit={(e) => e.preventDefault()}>
        <article className="panel settings-panel">
          <span className="eyebrow">VOCÊ & SEU RITMO</span>
          <h2>Pequenos compromissos.</h2>
          <label className="field">
            Como quer ser chamado?
            <input
              value={settings.name}
              required
              maxLength={100}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Meta diária (minutos)
              <input
                type="number"
                min={1}
                max={1440}
                required
                value={settings.dailyMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              Novos cartões por dia
              <input
                type="number"
                min={0}
                max={200}
                required
                value={settings.newCardsPerDay}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    newCardsPerDay: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              Tempo de foco (minutos)
              <input
                type="number"
                min={1}
                max={240}
                required
                value={settings.focusMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    focusMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              Tempo de pausa (minutos)
              <input
                type="number"
                min={1}
                max={60}
                required
                value={settings.breakMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    breakMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="microcopy">
            O limite de novos cartões mantém a rotina leve. As revisões que
            venceram continuam disponíveis. Para aplicar outro tempo a um
            cronômetro já iniciado, use Reiniciar.
          </p>
        </article>
        <article className="panel settings-panel">
          <span className="eyebrow">UM LUGAR QUE COMBINA COM VOCÊ</span>
          <h2>Ambiente de estudo.</h2>
          <label className="field">Aparência</label>
          <div className="theme-options">
            {(
              [
                ["light", "Claro", Sun],
                ["dark", "Escuro", Moon],
                ["system", "Sistema", Laptop],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                type="button"
                key={value}
                className={settings.theme === value ? "selected" : ""}
                aria-pressed={settings.theme === value}
                onClick={() => setSettings({ ...settings, theme: value })}
              >
                <Icon size={22} />
                {label}
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <span>
              <strong>Sons do Ninho</strong>
              <small>
                Toques suaves ao salvar, revisar e concluir estudos.
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) =>
                setSettings({ ...settings, sound: e.target.checked })
              }
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Reduzir animações</strong>
              <small>Uma interface mais tranquila.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) =>
                setSettings({ ...settings, reducedMotion: e.target.checked })
              }
            />
          </label>
          <p className="microcopy" role="status">
            {saveStatus}
          </p>
        </article>
      </form>
      <article className="panel backup-panel">
        <div className="backup-heading">
          <span className="round-icon">
            <FolderHeart size={25} />
          </span>
          <div>
            <span className="eyebrow">SEU APRENDIZADO É SEU</span>
            <h2>Leve seu Ninho com você.</h2>
            <p>
              Uma cópia completa com progresso, cartões, agenda e todos os
              arquivos importados.
            </p>
          </div>
        </div>
        <div className="button-row">
          <button
            className="button primary"
            disabled={backupBusy}
            onClick={async () => {
              setBackupBusy(true);
              try {
                const path = await api.exportBackup();
                if (path) notify(`Backup salvo em ${path}`);
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <Download size={17} />
            {backupBusy ? "Preparando backup…" : "Exportar backup"}
          </button>
          <button className="button secondary" onClick={() => setRestore(true)}>
            <Upload size={17} />
            Restaurar backup
          </button>
        </div>
        <div className="storage-path">
          <ShieldCheck size={17} />
          <div>
            <strong>Armazenado neste computador</strong>
            <p>{paths.data || "Consultando pasta…"}</p>
            <small>
              Sem conta e sem envio de arquivos à nuvem. Para usar em outro
              computador, exporte e restaure seu backup.
            </small>
          </div>
        </div>
      </article>
      <p className="version-line">
        Ninho 1.1.3 · Feito para o seu próximo passo · Windows 11
      </p>
      {restore && (
        <Confirm
          title="Restaurar um Ninho salvo?"
          text="Você vai escolher um backup. Após a validação, ele substituirá os dados atuais. Antes disso, uma cópia de segurança do seu Ninho atual será preservada automaticamente."
          label="Escolher backup"
          close={() => setRestore(false)}
          confirm={async () => {
            try {
              const next = await api.restoreBackup();
              if (next) {
                clearActivity();
                replace(next);
                setDraft(next.settings);
                notify("Backup restaurado. Seu Ninho está de volta.");
              }
            } catch (e) {
              notify((e as Error).message, true);
              throw e;
            }
          }}
        />
      )}
    </section>
  );
}
