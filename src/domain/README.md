# Domínio do Ninho

`index.ts` contém regras puras, sem disco, rede ou Electron. Datas de provas e tarefas são datas locais; timestamps de histórico e revisão são ISO 8601. `validateState(unknown)` retorna uma cópia validada e lança um erro se o formato, limites ou referências forem inválidos. `applyCommand(state, command, now?)` valida o comando e devolve um novo estado, preservando a entrada.

Exports: `createInitialState(now?)`, `validateState(input)`, `migrateState(input)`, `applyCommand(state, command, now?)`, `getDueCards(state, now?, subjectId?)`, `getDashboardStats(state, now?)`, `localDate(date?)`, `stateSchema`, `settingsSchema` e tipo `DashboardStats`. O filtro opcional de matéria precede a seleção dos novos, mantendo o limite diário global.

Revisão espaçada simples: **Não lembrei** → 10 minutos; **Difícil** → 1 dia; **Lembrei** → inicialmente 1 dia e depois intervalo × facilidade; **Fácil** → inicialmente 4 dias e depois intervalo × facilidade × 1,3. Facilidade entre 1,3 e 3,5; intervalo máximo de 100 anos. É um agendador transparente próprio, sem alegação de FSRS. Marcações de conteúdo permanecem até o usuário alterá-las; o app não verifica atualizações factuais automaticamente.

O limite diário se aplica apenas a cartões vistos pela primeira vez; revisões vencidas nunca são escondidas por esse limite. A primeira exposição gera uma sessão `review:first:<cardId>` de 0 minutos, para manter a contagem correta depois de novas respostas ou exclusão do cartão. Revisões reais contam como atividade na sequência de estudos, sem inventar minutos. Sessões de foco registram o tempo informado. O painel mostra os últimos sete dias locais e mantém a sequência até ontem quando ainda não houve atividade hoje.

O estado v2 organiza cursos de estudo (`StudyProgram`) → matérias → módulos/fontes (`Course`) → aulas. Os programas iniciais são `senado-federal` e `maua`. `validateState` migra automaticamente estados e backups v1, agrupando matérias por objetivo sem alterar IDs, cartões, notas, provas, histórico ou anexos. O programa `outros` só é criado na migração quando há matérias pessoais. Comandos antigos `subject.save` sem `programId` são normalizados; `program.save` permite criar/editar o curso e mantém o objetivo das matérias coerente.

`getLessonStudyStats(state)` agrega os minutos e a contagem de sessões com duração positiva por aula, ignorando sessões genéricas e vínculos inconsistentes. O cronômetro registra `StudySession.lessonId` ao concluir, preserva o vínculo quando pausado ou reaberto e bloqueia a troca de contexto enquanto há tempo pendente. Reiniciar descarta explicitamente a sessão ainda não salva; concluir o foco nunca marca a aula como concluída automaticamente.

O seed possui 2 cursos de estudo, 20 módulos e 271 aulas do programa observado no Estratégia, 14 matérias de concurso e um espaço de Ciência da Computação para Mauá. Os 71 cartões autorais vieram dos PDFs já lidos parcialmente (25 Banco de dados, 46 Literatura), preservando fonte e página. Programa mapeado não equivale a aula assistida: todo progresso e histórico começam zerados. `generate_seed.py` reconstrói o arquivo a partir dos JSONs locais autorizados; não acessa contas nem baixa conteúdo.

## Orientadora local

`getMentorOverview(state, now?, subjectId?)` retorna diagnósticos por matéria, próximos passos e limites explícitos. `answerMentor(state, message, now?, subjectId?)` reconhece perguntas em português sobre plano, evidências, dificuldades, provas, tempo e conferência de fontes. O motor é determinístico, não altera dados nem acessa serviços externos.

Cobertura é a proporção dos cartões cadastrados já praticados, nunca domínio da matéria; sem cartões, ela é `null`. Confiança descreve tamanho da amostra: nenhum cartão = sem evidência; 1–4 = baixa; 5–19 = moderada; 20 ou mais = ampla, sempre restrita aos cartões registrados. “Em dia” requer pelo menos 5 cartões praticados, cobertura mínima de 50%, nenhum vencido/marcado e ao menos metade com 3 respostas e intervalo de 7 dias. Isso não comprova conhecimento atual.

Prioridade soma fatores explicados no resultado, limitada a 100: 4 pontos por revisão prevista (até 36), 1 por dia do maior atraso (até 10), 5 por marcação de fonte (até 25), 4 por marcação de reaprender (até 16), 8 por próxima aula e 10–40 pela proximidade de uma prova cadastrada. Lapsos históricos não detectam desatualização factual. A conferência de fonte só aparece como marcação explícita, não como conclusão de que houve uma mudança.

## Biblioteca e backup

Anexos aceitos: PDF, imagens, texto/Markdown, documentos Office (até 100 MiB por arquivo); MP4/WebM/MOV/MKV e MP3/WAV/OGG/M4A/AAC/FLAC (até 2 GiB). `main/backup.ts` exporta e restaura ZIP/ZIP64 por streams, limitado a 20 GiB e 5.000 anexos (mais estado e índice). SHA-256 e CRC são verificados em staging antes de substituir o estado. A restauração mantém uma cópia de segurança anterior e aceita o manifesto v1. Apenas JSON de estado/índice e pequenos blocos de arquivo são mantidos em memória.
