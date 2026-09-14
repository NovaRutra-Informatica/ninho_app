import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  File,
  FileText,
  FolderOpen,
  Image,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Material, MaterialPreview } from "../shared/types";
import { useApp } from "./store";
import {
  Confirm,
  Empty,
  Modal,
  SearchBox,
  SubjectSelect,
  normalizeSearch,
  prettyDate,
} from "./ui";
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export default function Materials() {
  const { state, act, api, replace, notify } = useApp();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("all");
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Material | null>(null);
  const [preview, setPreview] = useState<MaterialPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkedSubject, setLinkedSubject] = useState("");
  const [deleting, setDeleting] = useState<Material | null>(null);
  const previewRequest = useRef(0);
  const importPending = useRef(false);
  useEffect(
    () => () => {
      previewRequest.current++;
    },
    [],
  );
  const importFiles = async () => {
    if (importPending.current) return;
    importPending.current = true;
    setImporting(true);
    try {
      const next = await api.importMaterials({ subjectId: subject });
      if (next) {
        replace(next);
        notify("Seus materiais estão guardados.");
      }
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      importPending.current = false;
      setImporting(false);
    }
  };
  const closePreview = () => {
    previewRequest.current++;
    setSelected(null);
    setPreview(null);
    setLoading(false);
  };
  const open = async (material: Material) => {
    const request = ++previewRequest.current;
    setSelected(material);
    setNotes(material.notes);
    setLinkedSubject(material.subjectId);
    setPreview(null);
    setLoading(true);
    try {
      const result = await api.previewMaterial(material.id);
      if (request === previewRequest.current) setPreview(result);
    } catch (e) {
      if (request === previewRequest.current)
        notify((e as Error).message, true);
    } finally {
      if (request === previewRequest.current) setLoading(false);
    }
  };
  const filtered = state.materials.filter(
    (m) =>
      normalizeSearch(m.name + " " + m.notes).includes(
        normalizeSearch(query),
      ) &&
      (!subject || m.subjectId === subject) &&
      (type === "all" ||
        (type === "image" && ["png", "jpg", "jpeg", "webp"].includes(m.type)) ||
        type === m.type),
  );
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Tudo que ajuda a aprender.</h1>
          <p>Seus PDFs, anotações, apresentações e imagens. Em um lugar só.</p>
        </div>
        <button
          className="button primary"
          disabled={importing}
          onClick={() => void importFiles()}
        >
          <Plus size={18} />
          {importing ? "Importando…" : "Adicionar arquivos"}
        </button>
      </div>
      <div className="toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscar material…"
        />
        <select
          aria-label="Tipo de arquivo"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">Todos os formatos</option>
          <option value="pdf">PDF</option>
          <option value="image">Imagens</option>
          <option value="txt">Texto</option>
          <option value="md">Markdown</option>
          <option value="docx">Word</option>
          <option value="pptx">PowerPoint</option>
          <option value="xlsx">Excel</option>
        </select>
        <SubjectSelect
          value={subject}
          onChange={setSubject}
          allowAll
          label="Filtrar matéria"
        />
      </div>
      {!state.materials.length && !query ? (
        <button
          className="upload-zone"
          disabled={importing}
          onClick={() => void importFiles()}
        >
          <span className="upload-art">
            <FolderOpen size={55} />
            <Plus size={20} />
          </span>
          <h2>Seu próximo conhecimento começa aqui.</h2>
          <p>Escolha arquivos no computador para montar sua biblioteca.</p>
          <span className="button primary">
            Escolher arquivos
            <ArrowUpRight size={17} />
          </span>
          <small>
            PDF, imagens, TXT, Markdown, Word, PowerPoint e Excel · até 100 MB
            por arquivo
          </small>
        </button>
      ) : (
        <div className="materials-grid">
          {filtered.map((material) => (
            <article
              className="material-card panel"
              key={material.id}
              data-testid={`material-row-${material.id}`}
            >
              <button
                className={`file-thumbnail ${material.type}`}
                onClick={() => void open(material)}
                aria-label={`Abrir ${material.name}`}
              >
                {["png", "jpg", "jpeg", "webp"].includes(material.type) ? (
                  <Image size={42} />
                ) : (
                  <FileText size={42} />
                )}
                <span>{material.type.toUpperCase()}</span>
              </button>
              <button
                className="material-name"
                onClick={() => void open(material)}
              >
                {material.name}
              </button>
              <small>
                {state.subjects.find((s) => s.id === material.subjectId)
                  ?.name || "Sem matéria"}
              </small>
              <footer>
                <span>
                  {fileSize(material.size)} · {prettyDate(material.createdAt)}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Remover ${material.name}`}
                  onClick={() => setDeleting(material)}
                >
                  <Trash2 size={16} />
                </button>
              </footer>
            </article>
          ))}
          {!filtered.length && (
            <Empty
              title="Nada encontrado."
              text="Tente outro nome, formato ou matéria."
              icon={<Search size={26} />}
            />
          )}
        </div>
      )}
      <div className="library-note">
        <FolderOpen size={17} />
        <span>
          Os arquivos importados ganham uma cópia dentro do Ninho. Os originais
          ficam onde estão.
        </span>
      </div>
      {selected && (
        <Modal
          title={selected.name}
          subtitle={`${selected.type.toUpperCase()} · ${fileSize(selected.size)}`}
          wide
          close={closePreview}
        >
          <div className="preview-layout">
            <div className="document-preview">
              {loading ? (
                <p>Preparando prévia…</p>
              ) : preview?.kind === "pdf" ? (
                <iframe
                  title={`Prévia de ${selected.name}`}
                  src={`data:application/pdf;base64,${preview.data}`}
                />
              ) : preview?.kind === "image" ? (
                <img
                  alt={selected.name}
                  src={`data:${preview.mime};base64,${preview.data}`}
                />
              ) : preview?.kind === "text" ? (
                <pre>{preview.data}</pre>
              ) : (
                <Empty
                  title="Abra com seu aplicativo favorito."
                  text="Este formato é aberto pelo programa padrão do Windows."
                  icon={<File size={28} />}
                  action={() =>
                    void api
                      .openMaterial(selected.id)
                      .catch((e) => notify(e.message, true))
                  }
                  label="Abrir no Windows"
                />
              )}
            </div>
            <aside>
              <SubjectSelect
                value={linkedSubject}
                onChange={setLinkedSubject}
              />
              <label className="field">
                Anotações do material
                <textarea
                  rows={8}
                  value={notes}
                  maxLength={20000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Trechos importantes, dúvidas, páginas para voltar…"
                />
              </label>
              <button
                className="button primary full"
                onClick={async () => {
                  try {
                    const updated = {
                      ...selected,
                      notes,
                      subjectId: linkedSubject,
                      lessonId:
                        linkedSubject === selected.subjectId
                          ? selected.lessonId
                          : "",
                    };
                    await act({
                      type: "material.update",
                      id: selected.id,
                      patch: {
                        notes: updated.notes,
                        subjectId: updated.subjectId,
                        lessonId: updated.lessonId,
                      },
                    });
                    setSelected(updated);
                    notify("Material atualizado.");
                  } catch {}
                }}
              >
                Salvar material
              </button>
              <button
                className="button secondary full"
                onClick={() =>
                  void api
                    .openMaterial(selected.id)
                    .catch((e) => notify(e.message, true))
                }
              >
                Abrir no Windows
                <ArrowUpRight size={16} />
              </button>
            </aside>
          </div>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="Remover da biblioteca?"
          text="O material deixará de aparecer na biblioteca. O arquivo original do seu computador não será alterado."
          close={() => setDeleting(null)}
          confirm={async () => {
            await act({ type: "material.remove", id: deleting.id });
            notify("Material removido da biblioteca.");
          }}
        />
      )}
    </section>
  );
}
