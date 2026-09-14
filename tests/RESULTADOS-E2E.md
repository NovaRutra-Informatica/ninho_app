# Validação de interface do Ninho

## Windows 1.1.4: sons

Em 14/09/2026, o build 1.1.4 passou por todos os **33 cenários distintos**. A rodada completa aprovou 32 em 10 minutos; o cenário de preferências falhou porque ainda usava o nome anterior da opção de som. O seletor foi atualizado para **Sons do Ninho**, e o cenário passou na repetição em 16,1 segundos. Não houve alteração de produto entre as duas execuções. TypeScript, build e 500 testes Vitest passaram.

O novo cenário de áudio aciona salvar preferências, concluir aula, revisar cartão e terminar foco. Os osciladores, ganhos, contexto e analisador do Chromium são reais. Uma saída final silenciada permite medir o sinal sem depender dos alto-falantes, usar microfone ou alterar o volume do Windows. As frequências, o sinal não nulo, o fechamento por inatividade e a preferência desativada após recarregar foram conferidos. Falhas de reprodução, repetição rápida e operações rejeitadas são cobertas pelos testes de lógica e componentes.

O executável empacotado 1.1.4 passou pelo smoke de navegação, temas, janela mínima e reabertura, com 14 capturas nativas. Este smoke usa `release/win-unpacked/Ninho.exe`, em perfil temporário, e não comprova instalação no perfil pessoal.

Após instalar, o mesmo smoke foi executado com `AppData/Local/Programs/Ninho/Ninho.exe`, novamente em perfil temporário: aprovado, 14 capturas e nenhum erro. O script de verificação da instalação também passou; estado pessoal, preferência e dois PDFs foram preservados. Essa evidência separada está em `test-results/packaged/result.json` e `.cache/installation-verification-1.1.4.json`.

- Rodada completa: [relatório 1.1.4](../test-results/e2e-v1.1.4-report/index.html).
- Preferências após corrigir o seletor: [reteste aprovado](../test-results/e2e-v1.1.4-settings-report/index.html).
- Pacote antes de instalar: `test-results/packaged-1.1.4-uninstalled/result.json`.

## Histórico 1.1.3

Em 14/09/2026, a suíte completa do **build final 1.1.3 aprovou 32/32 cenários E2E**, em 9,6 minutos, com dois workers: nenhuma falha, nenhum cenário pulado e nenhuma exceção não tratada no renderer. A validação do build também aprovou 471 testes de lógica, serviços e componentes; TypeScript sem erros.

As regressões novas usaram filesystem real em AppData virtualizado e junction com caixa mista. Um PDF existente abriu pelo caminho físico canônico, preservando prévia, associação, importação, backup e persistência. Arquivo ausente não acionou o leitor externo; a prévia pôde ser recuperada mantendo o rascunho. Um backup válido restaurou o PDF danificado sob UUID novo, mantendo intacta a cópia danificada anterior. Somente os diálogos e `shell.openPath` foram controlados; o resolver e as operações de arquivo não foram simulados. O smoke do executável instalado 1.1.3 é registrado separadamente na entrega.

Em 14/09/2026, a suíte completa no build 1.1.1 aprovou **26 de 26 cenários**, em 13,5 minutos, com janelas ocultas. TypeScript também terminou sem erros.

Após adicionar materiais dentro das aulas, o build 1.1.2 aprovou **8 de 8 cenários direcionados**, em 4,8 minutos, com dois processos independentes. Essa execução cobre o novo fluxo de PDF por aula, materiais globais, três fluxos de Estudos, dois fluxos de cronômetro por aula e mídia pessoal com backup. Os cenários repetidos não são somados como testes distintos.

O novo teste importou um PDF com nome arbitrário na aula 00, confirmou sua ausência na aula vizinha, moveu o mesmo arquivo para outra aula e depois para outra matéria. O seletor limpou a aula anterior ao trocar a matéria. Notas, vínculos e bytes originais foram preservados após reiniciar. Os testes de foco mantiveram o vínculo e o tempo por aula após pausa e dois reinícios, com botões inteiramente visíveis nas janelas padrão e compacta.

Na 1.1.1, a conferência de legibilidade e movimento reduzido também passou, com uma execução adicional apenas para capturar o plano da assistente. Na 1.1.2, o teste do executável instalado aprovou navegação nas oito áreas, temas, janela mínima e persistência, com 14 de 14 capturas nativas. O relatório geral registra ainda 416 testes de lógica e componentes aprovados.

O aplicativo foi aberto pelo Electron 44.3.0 real no Windows, usando um perfil temporário separado em cada cenário. Os testes não alteraram o perfil pessoal do Ninho, o Anki ou o progresso do Estratégia.

Foram exercitados organização por cursos e matérias, módulos, aulas, edição, cartões, agendamento, arquivos e prévias, agenda, foco, preferências, temas, assistente, backup e recuperação. A persistência foi conferida encerrando e reabrindo o processo. O perfil v1 sintético preservou integralmente IDs, notas, revisão, sinalização, provas, tarefas, sessões, preferências e anexo ao migrar para a nova hierarquia.

A biblioteca dentro de uma matéria conservou o contexto após importação e edição. Vídeo WebM codificado na fixture e áudio WAV válido foram copiados, filtrados, encaminhados ao Windows pelo caminho interno correto, exportados e restaurados. O teste comparou os arquivos recuperados byte a byte e verificou que o original permaneceu intacto.

UI, persistência e ponte IPC são reais. Seletores nativos e chamadas que abririam outros aplicativos têm respostas controladas. O HTTP do LM Studio é simulado antes de iniciar o processo principal: os testes verificam seleção de modelo, contexto real da matéria no prompt, histórico, resposta livre, indisponibilidade, erro, cancelamento, nova conversa e preservação do progresso. Esses cenários não carregam modelos reais nem demonstram qualidade de respostas do modelo instalado. A verificação do LM Studio instalado pertence à etapa de entrega.

A verificação visual anterior corrigiu o posicionamento de modais dentro de elementos animados. Os testes exigem que o modal do PDF fique integralmente dentro da janela. Na rodada 1.1.2, a captura por aula ocorreu com a superfície do PDF ainda preta, apesar de os controles terem carregado; essa imagem não comprova a pintura da página. A seção de materiais da aula foi inspecionada e está legível. O tema escuro é verificado pela cor efetivamente aplicada, além da preferência salva.

A rodada inicial 1.1.3, com 31 cenários, não cobria PDF grande nem exigia pixels do conteúdo. Uma regressão adicional reproduziu a falha: PDF pequeno legível e PDF sintético válido de 12 MiB inteiramente branco com endereço `data:`. Depois da correção para `blob:`, o teste passou com ambos os tamanhos e com o grande após reiniciar. A captura nativa recorta o plugin principal, exclui miniaturas e toolbar e exige os dois blocos vetoriais coloridos da página. O teste isolado passou e foi repetido dentro da suíte final de 32; as execuções não são somadas como cenários distintos.

- Suíte final 1.1.3: [abrir relatório](../test-results/e2e-v1.1.3-final-report/index.html).
- Rodada inicial 1.1.3, antes da regressão de PDF grande: [relatório histórico](../test-results/e2e-v1.1.3-report/index.html).
- PDF grande: [falha antes da correção](../test-results/pdf-render-before-report/index.html) e [pintura após a correção](../test-results/pdf-render-after-report/index.html).
- Suíte completa 1.1.1: [abrir relatório](../test-results/e2e-v1.1.1-report/index.html).
- Regressão 1.1.2: [abrir relatório](../test-results/e2e-v1.1.2-report/index.html).
- Executável instalado 1.1.3: `test-results/packaged-installed-1.1.3/result.json`.
- Critérios: [plano de aceitação](ACCEPTANCE.md).
- Como repetir: [instruções dos testes](e2e/README.md).

O catálogo inicial apresenta Senado Federal e Mauá como cursos principais, 20 módulos e 271 aulas/materiais extras; os cartões preparados são 71, provenientes dos PDFs consultados. Os testes distinguem esse conteúdo do progresso pessoal. Os diagnósticos da assistente usam registros e sinalizações. A conversa com IA recebe um resumo dos estudos, sem ler automaticamente PDFs/vídeos nem verificar mudanças em fontes externas.
