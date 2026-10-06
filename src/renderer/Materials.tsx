import { useEffect, useId, useRef, useState } from "react";
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
import { errorMessage } from "./errors";
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
const videoTypes = ["mp4", "webm", "mov", "mkv"];
const audioTypes = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
export default function Materials({
  subjectId,
  lessonId,
  embedded = false,
}: {
  subjectId?: string;
  lessonId?: string;
  embedded?: boolean;
}) {
  const { state, act, api, replace, notify } = useApp();
  const lessonHelpId = useId();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const lessonScoped = lessonId !== undefined;
  const scopedLesson = state.lessons.find((lesson) => lesson.id === lessonId);
  const activeSubject =
    subjectId || (lessonScoped ? scopedLesson?.subjectId || "" : subject);
  const scopeAvailable =
    !lessonScoped ||
    Boolean(scopedLesson && scopedLesson.subjectId === activeSubject);
  const [type, setType] = useState("all");
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Material | null>(null);
  const [preview, setPreview] = useState<MaterialPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkedSubject, setLinkedSubject] = useState("");
  const [linkedLesson, setLinkedLesson] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const modalGeneration = useRef(0);
  const previewRequest = useRef(0);
  const pdfObjectUrl = useRef<string | null>(null);
  const importPending = useRef(false);
  const savesPending = useRef(new Set<string>());
  const releasePdfUrl = () => {
    if (pdfObjectUrl.current) {
      URL.revokeObjectURL(pdfObjectUrl.current);
      pdfObjectUrl.current = null;
    }
  };
  useEffect(
    () => () => {
      modalGeneration.current++;
      previewRequest.current++;
      releasePdfUrl();
    },
    [],
  );
  useEffect(() => {
    modalGeneration.current++;
    previewRequest.current++;
    releasePdfUrl();
    setSelected(null);
    setPreview(null);
    setPreviewError("");
    setLoading(false);
    setSaving(false);
    setDeleting(null);
    setQuery("");
    setType("all");
  }, [subjectId, lessonId]);
  const importFiles = async () => {
    if (importPending.current || !scopeAvailable) return;
    importPending.current = true;
    setImporting(true);
    try {
      const next = await api.importMaterials(
        lessonScoped
          ? { subjectId: activeSubject, lessonId }
          : { subjectId: activeSubject },
      );
      if (next) {
        replace(next);
        notify("Seus materiais estão guardados.");
      }
    } catch (e) {
      notify(errorMessage(e, "Não foi possível importar os arquivos."), true);
    } finally {
      importPending.current = false;
      setImporting(false);
    }
  };
  const closePreview = () => {
    modalGeneration.current++;
    previewRequest.current++;
    releasePdfUrl();
    setSelected(null);
    setPreview(null);
    setPreviewError("");
    setLoading(false);
    setSaving(false);
  };
  const readPreview = async (material: Material) => {
    const request = ++previewRequest.current;
    releasePdfUrl();
    setPreview(null);
    setPreviewError("");
    setLoading(true);
    try {
      const result = await api.previewMaterial(material.id);
      if (request !== previewRequest.current) return;
      if (result.kind === "pdf") {
        if (!result.data)
          throw new Error("O conteúdo do PDF não está disponível para prévia.");
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
          bytes[index] = binary.charCodeAt(index);
        // The PDF viewer cannot navigate large data URLs. Keep the URL short
        // and retain its bytes only while this preview is open.
        pdfObjectUrl.current = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        setPreview({ ...result, data: undefined, url: pdfObjectUrl.current });
      } else setPreview(result);
    } catch (e) {
      if (request === previewRequest.current)
        setPreviewError(errorMessage(e, "Não foi possível ler este arquivo."));
    } finally {
      if (request === previewRequest.current) setLoading(false);
    }
  };
  const open = async (material: Material) => {
    if (savesPending.current.has(material.id)) {
      notify(
        "Este material está sendo salvo. Aguarde um instante para reabri-lo.",
      );
      return;
    }
    modalGeneration.current++;
    setSelected(material);
    setNotes(material.notes);
    setLinkedSubject(material.subjectId);
    setLinkedLesson(material.lessonId);
    setSaving(false);
    await readPreview(material);
  };
  const saveMaterial = async () => {
    const generation = modalGeneration.current;
    if (!selected || savesPending.current.has(selected.id)) return;
    const materialId = selected.id;
    savesPending.current.add(materialId);
    setSaving(true);
    const updated = {
      ...selected,
      notes,
      subjectId: linkedSubject,
      lessonId: linkedLesson,
    };
    try {
      await act({
        type: "material.update",
        id: selected.id,
        patch: {
          ...(notes !== selected.notes ? { notes } : {}),
          ...(linkedSubject !== selected.subjectId ||
          linkedLesson !== selected.lessonId
            ? { subjectId: linkedSubject, lessonId: linkedLesson }
            : {}),
        },
      });
      if (generation === modalGeneration.current) setSelected(updated);
      notify("Material atualizado.");
    } catch {
    } finally {
      savesPending.current.delete(materialId);
      if (generation === modalGeneration.current) setSaving(false);
    }
  };
  const lessonLabel = (id: string) => {
    const lesson = state.lessons.find((item) => item.id === id);
    if (!lesson) return "";
    const course = state.courses.find((item) => item.id === lesson.courseId);
    return `${lesson.title} · ${course?.title || "Módulo sem nome"}`;
  };
  const scopedMaterials = state.materials.filter(
    (material) =>
      scopeAvailable &&
      (!activeSubject || material.subjectId === activeSubject) &&
      (!lessonScoped || material.lessonId === lessonId),
  );
  const filtered = scopedMaterials.filter(
    (m) =>
      normalizeSearch(m.name + " " + m.notes).includes(
        normalizeSearch(query),
      ) &&
      (type === "all" ||
        (type === "image" && ["png", "jpg", "jpeg", "webp"].includes(m.type)) ||
        (type === "video" && videoTypes.includes(m.type)) ||
        (type === "audio" && audioTypes.includes(m.type)) ||
        type === m.type),
  );
  return (
    <section
      className={`page-enter materials-page ${embedded ? "subject-materials" : ""} ${lessonScoped ? "lesson-materials" : ""}`}
      data-testid={lessonScoped ? `lesson-materials-${lessonId}` : undefined}
    >
      <div className="page-heading">
        <div>
          {lessonScoped ? (
            <h2>Materiais desta aula</h2>
          ) : embedded ? (
            <h2>Materiais desta matéria</h2>
          ) : (
            <h1>Tudo que ajuda a aprender.</h1>
          )}
          <p>
            {lessonScoped
              ? "Seus PDFs, resumos e arquivos ficam juntos da aula em que você estuda."
              : embedded
                ? "As leituras, anotações e arquivos para continuar aprendendo."
                : "Sua biblioteca completa. Cada matéria também tem seus próprios materiais."}
          </p>
        </div>
        <button
          className="button primary"
          disabled={importing || !scopeAvailable}
          onClick={() => void importFiles()}
        >
          <Plus size={18} />
          {importing
            ? "Importando…"
            : lessonScoped
              ? "Adicionar arquivos à aula"
              : "Adicionar arquivos"}
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
          <option value="video">Vídeos</option>
          <option value="audio">Áudios</option>
        </select>
        {!subjectId && !lessonScoped && (
          <SubjectSelect
            value={subject}
            onChange={setSubject}
            allowAll
            label="Filtrar matéria"
          />
        )}
      </div>
      {!scopeAvailable ? (
        <Empty
          title="Esta aula não está disponível."
          text="Volte aos estudos e abra uma aula existente para organizar seus materiais."
        />
      ) : !scopedMaterials.length && !query ? (
        <button
          className="upload-zone"
          disabled={importing}
          onClick={() => void importFiles()}
        >
          <span className="upload-art">
            <FolderOpen size={55} />
            <Plus size={20} />
          </span>
          <h2>
            {lessonScoped
              ? "Nenhum material nesta aula ainda."
              : "Seu próximo conhecimento começa aqui."}
          </h2>
          <p>
            {lessonScoped
              ? "Escolha arquivos no computador para estudar com eles nesta aula."
              : "Escolha arquivos no computador para montar sua biblioteca."}
          </p>
          <span className="button primary">
            Escolher arquivos
            <ArrowUpRight size={17} />
          </span>
          <small>
            PDF, imagens, textos e Office · até 100 MB. Vídeos e áudios · até 2
            GB.
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
                {material.lessonId && ` · ${lessonLabel(material.lessonId)}`}
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
              text={
                lessonScoped
                  ? "Tente outro nome ou formato entre os arquivos desta aula."
                  : "Tente outro nome, formato ou matéria."
              }
              icon={<Search size={26} />}
            />
          )}
        </div>
      )}
      <div className="library-note">
        <FolderOpen size={17} />
        <span>
          {lessonScoped
            ? "Os arquivos adicionados aqui ficam vinculados a esta aula. Para usar um arquivo já importado, abra-o nos materiais da matéria e escolha esta aula."
            : "Os arquivos importados ganham uma cópia dentro do Ninho. Os originais ficam onde estão. PDFs do Estratégia com nome de curso e aula reconhecidos são organizados automaticamente."}
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
              ) : previewError ? (
                <div role="alert">
                  <Empty
                    title="Não foi possível abrir a prévia."
                    text={previewError}
                    icon={<File size={28} />}
                  />
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => {
                      if (!savesPending.current.has(selected.id))
                        void readPreview(selected);
                    }}
                  >
                    Tentar prévia novamente
                  </button>
                </div>
              ) : preview?.kind === "pdf" ? (
                <iframe
                  title={`Prévia de ${selected.name}`}
                  src={preview.url}
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
                      .catch((e) =>
                        notify(
                          errorMessage(
                            e,
                            "Não foi possível abrir o arquivo no Windows.",
                          ),
                          true,
                        ),
                      )
                  }
                  label="Abrir no Windows"
                />
              )}
            </div>
            <aside>
              <fieldset className="material-fields" disabled={saving}>
                <SubjectSelect
                  value={linkedSubject}
                  onChange={(value) => {
                    setLinkedSubject(value);
                    setLinkedLesson("");
                  }}
                />
                <label className="field">
                  Aula do material
                  <select
                    aria-label="Aula do material"
                    aria-describedby={lessonHelpId}
                    value={linkedLesson}
                    disabled={!linkedSubject}
                    onChange={(event) => setLinkedLesson(event.target.value)}
                  >
                    <option value="">Sem aula específica</option>
                    {state.lessons
                      .filter((lesson) => lesson.subjectId === linkedSubject)
                      .map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {lessonLabel(lesson.id)}
                        </option>
                      ))}
                  </select>
                  <small id={lessonHelpId}>
                    {linkedSubject
                      ? "Escolha a aula ou deixe o arquivo disponível apenas na matéria."
                      : "Escolha uma matéria para vincular o arquivo a uma aula."}
                  </small>
                </label>
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
              </fieldset>
              <button
                className="button primary full"
                disabled={saving}
                onClick={() => void saveMaterial()}
              >
                {saving ? "Salvando…" : "Salvar material"}
              </button>
              <button
                className="button secondary full"
                onClick={() =>
                  void api
                    .openMaterial(selected.id)
                    .catch((e) =>
                      notify(
                        errorMessage(
                          e,
                          "Não foi possível abrir o arquivo no Windows.",
                        ),
                        true,
                      ),
                    )
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
