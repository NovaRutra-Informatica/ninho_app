# Aceitação do Ninho

O objetivo é abrir o Ninho e saber o que estudar hoje, sem configurar um sistema complexo. Os testes usam um perfil temporário próprio; não devem alterar a coleção do Anki, marcar aulas como estudadas no Estratégia nem gravar no perfil pessoal do Ninho.

## Primeiro uso e navegação

- Abrir o executável no Windows 11, sem navegador, terminal, servidor de desenvolvimento ou conexão obrigatória.
- Ver a página Hoje, o próximo passo, tempo de foco e acesso claro a todas as áreas.
- Encontrar as matérias de concurso, incluindo Português, Inglês, Direito e Literatura, e as 271 aulas e materiais extras mapeados dos 20 cursos. O catálogo não significa que todas as aulas tenham cartões prontos.
- Distinguir conteúdo preparado, cartões disponíveis, aulas concluídas e material pendente. Os dados iniciais não inventam progresso pessoal.
- Navegar pelo teclado, reconhecer o foco, ler textos sem cortes e fechar caixas de diálogo com os controles visíveis.

## Meus estudos

- Buscar por uma aula e filtrar por matéria, incluindo matérias fora de TI.
- Alterar uma aula de não iniciada para em andamento e concluída; retornar a um estado anterior sem perder notas.
- Salvar anotações e recuperá-las após fechar e reabrir o aplicativo.
- Cadastrar uma matéria da faculdade ou pessoal, sem confundir sua origem com o curso do Senado.
- Corrigir nomes e links de matérias, cursos e aulas sem duplicar itens, romper vínculos ou perder anotações e progresso.
- Abrir a aula do Estratégia no navegador padrão a partir do link real. O Ninho não pede a senha do Estratégia nem promete sincronizar progresso automaticamente.

## Revisões

- Criar, editar e excluir um cartão com matéria, pergunta, resposta e fonte.
- Recusar cartões sem pergunta ou resposta e mostrar o problema de forma compreensível.
- Mostrar a pergunta antes da resposta. A resposta só aparece quando solicitada.
- Registrar cada uma das quatro avaliações e modificar a próxima revisão coerentemente. Um cartão respondido não reaparece indefinidamente na mesma fila, salvo quando o agendamento prevê isso.
- Marcar conteúdo para conferir atualização e para estudar novamente; suspender e reativar cartões.
- Respeitar o limite diário de novos cartões e tornar visível quando não houver revisão pendente.
- Não sugerir que uma informação factual foi atualizada automaticamente.

## Materiais

- Importar PDF e texto por seletor de arquivos, associá-los a uma matéria e abri-los na biblioteca.
- Copiar os arquivos para o armazenamento do Ninho; o material permanece utilizável se o original for movido.
- Exibir prévia de PDF e texto, ou explicar quando é necessário abrir no aplicativo padrão.
- Alterar anotações e associação do material; remover um item sem excluir o arquivo original.
- Cancelar a importação sem alterar a biblioteca; tratar arquivos ausentes, inválidos ou grandes demais com mensagem útil.

## Agenda

- Criar, editar, concluir e excluir uma prova com data, horário, matéria, local e observações.
- Mostrar provas próximas na página inicial e no planejamento.
- Criar, concluir, reabrir e excluir uma tarefa; persistir os estados.
- Validar título e data obrigatórios, sem aceitar uma data que não existe.

## Foco e progresso

- Iniciar, pausar, retomar, reiniciar e concluir uma sessão de foco. Pausar impede a contagem de tempo; reiniciar não registra uma sessão concluída.
- Não duplicar sessões com cliques rápidos ou recarregamentos. Uma sessão concluída aparece no histórico e nos totais.
- Calcular progresso com aulas, revisões e minutos realmente registrados, sem números demonstrativos apresentados como conquistas pessoais.

## Mentor de estudos

- Consultar o assistente local e receber um próximo passo apoiado no histórico de estudos, revisões, conteúdos sinalizados e provas do próprio perfil.
- Diferenciar falta de histórico, esquecimento registrado e conteúdo que precisa de conferência. Não classificar um assunto nunca estudado como dominado.
- Apresentar explicação compreensível para cada recomendação e direcionar para a área pertinente do aplicativo.
- Atualizar recomendações quando o usuário conclui uma aula, registra uma revisão ou sinaliza conteúdo; manter o controle das decisões com o usuário.
- Deixar claro que o mentor organiza os dados registrados. A conferência de mudanças em leis, editais e tecnologias depende das fontes do conteúdo.

## Preferências, dados e recuperação

- Alterar nome, tema, meta diária, duração do foco e intervalo, limite de cartões, som e movimento reduzido.
- Recuperar preferências, notas, provas, tarefas, revisões e materiais após reiniciar o aplicativo.
- Exportar um backup que inclua dados e anexos; restaurá-lo após confirmação, recuperando o conteúdo esperado.
- Cancelar a exportação/restauração sem perda de dados. Rejeitar backup inválido sem destruir o perfil atual.
- Não abrir caminhos arbitrários, scripts ou URLs de protocolos perigosos. O conteúdo de cartões e anotações aparece como texto, não como código executável.

## Cobertura executável

- `tests/e2e`: navegação, catálogo, estudo, cartões e fila de revisão, materiais reais, agenda, foco, preferências, persistência e backup via Electron e IPC reais. Só os seletores/confirmadores nativos são substituídos por respostas determinísticas nos testes.
- Os testes de domínio e desktop complementam os fluxos com validações, agendamento, corrupção de dados, segurança de arquivos e operações canceladas ou inválidas.
- A inspeção visual final deve registrar capturas das páginas Hoje, Meus estudos, Revisões, Materiais e Agenda em tema claro/escuro. Conferir animações com movimento normal e reduzido.

## Registro da entrega

Execução E2E final em 14/09/2026: 18/18 cenários aprovados com Electron 44.3.0; TypeScript sem erros. Inclui regressão de posicionamento do modal, PDF realmente carregado e cores do tema escuro. Consulte [o resultado registrado](RESULTADOS-E2E.md) e o relatório HTML. O teste do executável empacotado e a abertura do perfil pessoal pertencem à etapa de entrega.
