import { useEffect, useState } from "react";
import { ArrowRight, CircleHelp, X } from "lucide-react";
import { useApp } from "./store";

const tours: Record<string, [string, string, string][]> = {
  today: [
    [
      "Seu espaço",
      "A sidebar leva aos estudos, revisões, materiais e planos. O temporizador está sempre ao alcance, e seu nome abre Meu perfil.",
      ".sidebar",
    ],
    [
      "Um retrato do dia",
      "Aqui você acompanha minutos de estudo, revisões disponíveis e dias seguidos. Clique em cada cartão para abrir sua atividade.",
      ".stat-grid",
    ],
    [
      "Seu próximo passo",
      "Continue uma aula, marque pequenas tarefas e veja provas próximas. Cada ação mantém seus registros neste dispositivo.",
      ".dashboard-columns",
    ],
  ],
  studies: [
    [
      "Cursos, matérias e aulas",
      "Entre em um curso, escolha a matéria e abra uma aula para registrar progresso, notas e materiais.",
      ".content-inner",
    ],
    [
      "Encontre seu estudo",
      "Use a busca e os filtros para localizar o que quer estudar. Comece uma sessão de foco a partir da aula para vincular o tempo a ela.",
      ".page-heading",
    ],
  ],
  reviews: [
    [
      "Reencontre o que aprendeu",
      "As revisões vencidas e os novos cartões formam sua fila. Revele a resposta e avalie como foi lembrar.",
      ".content-inner",
    ],
    [
      "Cuide da sua memória",
      "A avaliação muda a próxima revisão. A biblioteca permite editar cartões, conferir fontes e marcar conteúdos para reaprender.",
      ".page-heading",
    ],
  ],
  materials: [
    [
      "Tudo perto da aula",
      "Importe arquivos locais e vincule à matéria ou aula. A busca e os filtros ajudam a encontrar PDFs, textos, vídeos e outros arquivos.",
      ".content-inner",
    ],
    [
      "Abra e organize",
      "Clique no material para visualizar detalhes. Seus arquivos ficam neste computador e entram no backup.",
      ".page-heading",
    ],
  ],
  agenda: [
    [
      "Espaço para seus compromissos",
      "Mude o mês e selecione um dia para ver tarefas e provas. Nova tarefa e Marcar prova abrem formulários próprios.",
      ".content-inner",
    ],
    [
      "Um passo de cada vez",
      "Conclua tarefas quando terminar. Data, horário e matéria ajudam a organizar a preparação.",
      ".page-heading",
    ],
  ],
  progress: [
    [
      "Acompanhe seu percurso",
      "Minutos registrados, aulas concluídas, revisões e sequência mostram o que você fez. Tempo estudado não mede domínio de um assunto.",
      ".progress-summary",
    ],
    [
      "Constância visível",
      "O gráfico mostra a semana. Conquistas e progresso por matéria ajudam a escolher seu próximo passo.",
      ".progress-columns",
    ],
  ],
  mentor: [
    [
      "Sua assistente",
      "O acompanhamento aparece automaticamente com base no seu perfil e nos registros reais. Abra “Por que apareceu?” para ver a regra e a amostra. Não precisa instalar um modelo.",
      ".content-inner",
    ],
    [
      "Um contexto que continua",
      "Objetivos e rotina do Meu perfil orientam os cartões. Navegação não conta como tempo estudado; os limites e os dados que faltam aparecem no final. Você decide o próximo passo.",
      ".page-heading",
    ],
  ],
  settings: [
    [
      "Do seu jeito",
      "Tema, sons, animações e preferências são salvos automaticamente. Backup e restauração continuam sendo ações explícitas.",
      ".settings-grid",
    ],
  ],
};
export default function Tutorial({ page }: { page: string }) {
  const { state, act } = useApp();
  const [index, setIndex] = useState(0);
  const [replay, setReplay] = useState(false);
  const tour = tours[page];
  const visible = Boolean(
    tour &&
    state.profile?.completedAt &&
    (replay || !state.profile.tutorialsSeen.includes(page)),
  );
  useEffect(() => {
    setIndex(0);
    setReplay(false);
  }, [page]);
  useEffect(() => {
    if (!visible) return;
    const element = document.querySelector(tour?.[index]?.[2] ?? "");
    element?.classList.add("tutorial-highlight");
    return () => element?.classList.remove("tutorial-highlight");
  }, [visible, page, index]);
  if (!tour || !state.profile?.completedAt) return null;
  async function close() {
    await act({ type: "profile.tutorial", page, seen: true });
    setReplay(false);
    setIndex(0);
  }
  return visible ? (
    <aside className="tutorial-coach" aria-label={`Tutorial de ${page}`}>
      <div className="row-between">
        <span className="eyebrow">
          Conheça seu Ninho · {index + 1}/{tour.length}
        </span>
        <button
          className="icon-button"
          aria-label="Fechar tutorial"
          onClick={() => void close().catch(() => {})}
        >
          <X size={17} />
        </button>
      </div>
      <h2>{tour[index]?.[0]}</h2>
      <p>{tour[index]?.[1]}</p>
      <button
        className="button primary"
        onClick={() =>
          index + 1 < tour.length
            ? setIndex(index + 1)
            : void close().catch(() => {})
        }
      >
        {index + 1 < tour.length ? "Próximo" : "Entendi"}
        <ArrowRight size={15} />
      </button>
    </aside>
  ) : (
    <button
      className="tutorial-replay"
      onClick={() => {
        setIndex(0);
        setReplay(true);
      }}
      aria-label="Rever tutorial desta tela"
    >
      <CircleHelp size={18} />
      Como funciona
    </button>
  );
}
