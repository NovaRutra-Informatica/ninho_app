import { useEffect, useState } from "react";
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
import { Confirm } from "./ui";
export default function Settings() {
  const { state, act, api, replace, notify } = useApp();
  const [settings, setSettings] = useState(state.settings);
  const [paths, setPaths] = useState({ data: "", backup: "" });
  const [saving, setSaving] = useState(false);
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
      <form
        className="settings-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await act({ type: "settings.update", patch: settings });
            notify("Preferências salvas.");
          } catch {
          } finally {
            setSaving(false);
          }
        }}
      >
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
                min={5}
                max={720}
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
                max={180}
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
              <strong>Som ao concluir o foco</strong>
              <small>Um aviso suave no fim da sessão.</small>
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
          <div className="save-settings">
            <button className="button primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar preferências"}
            </button>
          </div>
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
              Sem conta e sem envio de arquivos a um servidor. Para usar em
              outro computador, exporte e restaure seu backup.
            </small>
          </div>
        </div>
      </article>
      <p className="version-line">
        Ninho 1.0 · Feito para o seu próximo passo · Windows 11
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
                replace(next);
                setSettings(next.settings);
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
