# Validação de interface do Ninho 1.1.2

Em 14/09/2026, a suíte completa no build 1.1.1 aprovou **26 de 26 cenários**, em 13,5 minutos, com janelas ocultas. TypeScript também terminou sem erros.

Após adicionar materiais dentro das aulas, o build 1.1.2 aprovou **8 de 8 cenários direcionados**, em 4,8 minutos, com dois processos independentes. Essa execução cobre o novo fluxo de PDF por aula, materiais globais, três fluxos de Estudos, dois fluxos de cronômetro por aula e mídia pessoal com backup. Os cenários repetidos não são somados como testes distintos.

O novo teste importou um PDF com nome arbitrário na aula 00, confirmou sua ausência na aula vizinha, moveu o mesmo arquivo para outra aula e depois para outra matéria. O seletor limpou a aula anterior ao trocar a matéria. Notas, vínculos e bytes originais foram preservados após reiniciar. Os testes de foco mantiveram o vínculo e o tempo por aula após pausa e dois reinícios, com botões inteiramente visíveis nas janelas padrão e compacta.

Na 1.1.1, a conferência de legibilidade e movimento reduzido também passou, com uma execução adicional apenas para capturar o plano da assistente. Na 1.1.2, o teste do executável instalado aprovou navegação nas oito áreas, temas, janela mínima e persistência, com 14 de 14 capturas nativas. O relatório geral registra ainda 416 testes de lógica e componentes aprovados.

O aplicativo foi aberto pelo Electron 44.3.0 real no Windows, usando um perfil temporário separado em cada cenário. Os testes não alteraram o perfil pessoal do Ninho, o Anki ou o progresso do Estratégia.

Foram exercitados organização por cursos e matérias, módulos, aulas, edição, cartões, agendamento, arquivos e prévias, agenda, foco, preferências, temas, assistente, backup e recuperação. A persistência foi conferida encerrando e reabrindo o processo. O perfil v1 sintético preservou integralmente IDs, notas, revisão, sinalização, provas, tarefas, sessões, preferências e anexo ao migrar para a nova hierarquia.

A biblioteca dentro de uma matéria conservou o contexto após importação e edição. Vídeo WebM codificado na fixture e áudio WAV válido foram copiados, filtrados, encaminhados ao Windows pelo caminho interno correto, exportados e restaurados. O teste comparou os arquivos recuperados byte a byte e verificou que o original permaneceu intacto.

UI, persistência e ponte IPC são reais. Seletores nativos e chamadas que abririam outros aplicativos têm respostas controladas. O HTTP do LM Studio é simulado antes de iniciar o processo principal: os testes verificam seleção de modelo, contexto real da matéria no prompt, histórico, resposta livre, indisponibilidade, erro, cancelamento, nova conversa e preservação do progresso. Esses cenários não carregam modelos reais nem demonstram qualidade de respostas do modelo instalado. A verificação do LM Studio instalado pertence à etapa de entrega.

A verificação visual identificou e corrigiu o posicionamento de modais dentro de elementos animados. Os testes exigem que o modal do PDF fique integralmente dentro da janela e aguardam o visualizador mostrar página 1 e sua miniatura. A captura do PDF na biblioteca global mostra o documento renderizado. No novo cenário por aula, a captura do modal ocorreu com a superfície do PDF ainda preta, apesar de os controles do visualizador terem carregado; essa imagem não é usada como evidência visual da página renderizada. A seção de materiais da aula foi inspecionada e está legível. O tema escuro é verificado pela cor efetivamente aplicada, além da preferência salva.

- Suíte completa 1.1.1: [abrir relatório](../test-results/e2e-v1.1.1-report/index.html).
- Regressão 1.1.2: [abrir relatório](../test-results/e2e-v1.1.2-report/index.html).
- Executável instalado: `test-results/packaged/result.json`.
- Critérios: [plano de aceitação](ACCEPTANCE.md).
- Como repetir: [instruções dos testes](e2e/README.md).

O catálogo inicial apresenta Senado Federal e Mauá como cursos principais, 20 módulos e 271 aulas/materiais extras; os cartões preparados são 71, provenientes dos PDFs consultados. Os testes distinguem esse conteúdo do progresso pessoal. Os diagnósticos da assistente usam registros e sinalizações. A conversa com IA recebe um resumo dos estudos, sem ler automaticamente PDFs/vídeos nem verificar mudanças em fontes externas.
