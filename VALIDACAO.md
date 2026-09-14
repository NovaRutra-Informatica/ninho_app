# Validação do Ninho

## Atualização Windows 1.1.4 — sons

Em 14/09/2026, **500 testes Vitest em 25 arquivos passaram**, incluindo 29 testes novos de sons e sua integração com persistência e foco. TypeScript e compilação de produção passaram. A cobertura instrumentada de domínio e serviços permanece nos percentuais documentados abaixo; os novos módulos de áudio são exercitados por testes, mas não fazem parte desse recorte de cobertura.

O novo E2E de áudio passou com `AudioContext`, osciladores, ganhos e analisador reais do Chromium. Após salvar preferências, concluir aula, revisar cartão e concluir foco, conferiu as frequências programadas e um sinal não nulo. A saída final foi silenciada para não depender do dispositivo físico. Conferiu fechamento ocioso, ausência de áudio ao desativar a preferência e persistência após recarregar. A avaliação subjetiva de timbre e volume nos alto-falantes pessoais não foi executada.

A rodada completa de interface aprovou **32 cenários em 10 minutos** e teve um timeout de seletor: o teste de preferências ainda procurava o rótulo antigo “Som ao concluir o foco”. Após ajustar somente o teste para “Sons do Ninho”, esse cenário passou em **16,1 segundos**. Assim, os **33 cenários distintos foram aprovados**, com a rodada inicial e a repetição documentadas separadamente. Não houve mudança no produto entre essas execuções. Relatórios: `test-results/e2e-v1.1.4-report/index.html` e `test-results/e2e-v1.1.4-settings-report/index.html`.

O smoke do executável empacotado **1.1.4** passou por navegação, temas, janela mínima, reabertura e persistência, com 14 de 14 capturas nativas; evidência em `test-results/packaged-1.1.4-uninstalled/result.json`. A versão **1.1.4 foi instalada** no perfil pessoal. O smoke repetido com o executável realmente instalado, em perfil temporário, também passou com 14 capturas e nenhuma exceção; evidência em `test-results/packaged/result.json`. A captura de Ajustes foi inspecionada e o controle de som está legível. As mudanças estão em `ATUALIZACAO-1.1.4.md`.

Instalador: `release/Ninho-Setup-1.1.4.exe` (118.079.139 bytes), SHA-256 `7F6F5453ACF01F890A8485E0E8870101B9557DD1E1B062EF95BB1FA7EB8BCFDA`. Instalação terminou com código 0, e `scripts/verify-installation.ps1` aprovou executável, versão, pacote, ícone, registro e atalhos. O estado pessoal e os dois PDFs permaneceram byte a byte iguais antes/depois; a preferência de som já ativada foi preservada. Relatórios: `.cache/installation-update-1.1.4.json` e `.cache/installation-verification-1.1.4.json`.

## Entrega instalada anterior: 1.1.3

Executada em 14/09/2026, no Windows 11 x64.

## Resultados

| Verificação                                                         | Resultado                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TypeScript e compilação de produção                                 | Aprovados                                                                                     |
| Vitest: domínio, armazenamento, IA, backup, segurança e componentes | 471 testes aprovados em 23 arquivos                                                           |
| Playwright com Electron: suíte completa 1.1.3                       | 32 cenários aprovados em 9,6 minutos; nenhuma falha ou cenário pulado                         |
| Dois PDFs reais do perfil pessoal                                   | Resolução e prévias conferidas, bytes e estado preservados                                    |
| LM Studio e modelo real                                             | Duas respostas locais verificadas na entrega anterior; regressões atuais usam HTTP controlado |
| Instalador, registro, atalhos e preservação dos dados               | Versão final 1.1.3 instalada; 26 conferências aprovadas, estado e PDFs preservados            |
| Auditoria de dependências                                           | Sem mudança de dependências desde o npm audit sem vulnerabilidades conhecidas                 |
| Aplicativo instalado 1.1.3 e leitor do Windows                      | Smoke aprovado, 14 capturas; PDF real exibido no Ninho e aberto no Acrobat                    |

Os testes automatizados usaram perfis temporários, separados do perfil pessoal. Nos testes de interface, os seletores nativos e as chamadas que abririam outros aplicativos têm respostas controladas. O HTTP do LM Studio é simulado nesses cenários; a execução com modelo real foi verificada separadamente, conforme `VALIDACAO-IA.md`.

As correções desta atualização estão descritas em `CORRECOES-1.1.3.md`, incluindo a reprodução da falha no acervo real e os limites dos testes.

Na verificação manual do executável final, a aula 00 de Banco de dados exibiu sua capa e 173 páginas dentro do Ninho. O botão **Abrir no Windows** abriu o mesmo arquivo no Adobe Acrobat, sem o erro de biblioteca. Surgiram avisos externos **Font Capture** durante a abertura no Acrobat; os eventos coincidem com sua abertura e o título existe na biblioteca de fontes CoolType carregada pelo leitor. A DLL ausente não foi identificada. O leitor e os helpers criados por essa conferência foram encerrados após validar suas identidades; essa limpeza não é apresentada como reparo do Acrobat. Nenhuma configuração do Windows ou instalação do Adobe foi alterada.

## Funcionalidades exercitadas

- Cursos principais, matérias, módulos e aulas: criação, edição, pesquisa, filtros e navegação. Migração do formato anterior preservando IDs, histórico, notas e vínculos.
- Data da tela Hoje abrindo o calendário; provas, tarefas, conclusão, reabertura, edição e exclusão.
- Cartões, quatro avaliações de lembrança, agendamento, limite global de novos cartões, edição, exclusão, suspensão e sinalizações.
- Cronômetro por matéria e aula, pausa, retomada, reinício, conclusão, persistência e recuperação após reabertura. Pausas não somam tempo de estudo. O vínculo não muda durante uma sessão em andamento, e registrar tempo não conclui a aula automaticamente. Botões visíveis nas janelas padrão e compacta.
- Materiais dentro da matéria e da aula, importação com contexto explícito, cópia independente, seletor para mover o material entre aulas, prévias de PDF e texto, anotações, edição e remoção. Trocar a matéria limpa o vínculo com a aula anterior. Proteção contra respostas assíncronas fora de ordem e edições durante salvamento.
- Prévias PDF com URLs temporárias liberadas ao fechar, trocar o arquivo ou sair da matéria. PDF pequeno e de 12 MiB com conteúdo pintado, conferido por pixels da página principal, inclusive após reiniciar. A regressão grande falhou no código anterior e passou após a correção.
- Vídeo WebM e áudio WAV válidos: importação, filtros, encaminhamento ao caminho interno correto, backup e restauração byte a byte. Importação de mídia acima de 100 MiB e rejeição acima do limite de 2 GiB também verificadas.
- Backup por streaming, ZIP/ZIP64, restauração de formatos anterior e atual, cancelamento, limites, integridade, recuperação e preservação da coleção anterior.
- IA: seleção de modelo, contexto dos registros e da matéria, histórico, resposta livre, indisponibilidade, erro, cancelamento, nova conversa e liberação apenas de modelos carregados pelo Ninho. O contexto distingue tempo registrado por aula de domínio ou conclusão.
- Preferências persistidas, temas claro e escuro, contraste, textos maiores na assistente, layout e posicionamento do visualizador de PDF na janela. Transições nativas entre páginas, navegação rápida e preferência de movimento reduzido do usuário e do Windows.
- Validação de IPC, URLs e arquivos, conteúdo de texto sem execução de HTML e proteção contra caminhos inválidos em backups.

A cobertura instrumentada reportada abrange os módulos de domínio, armazenamento, segurança, IA e backup; não representa cobertura integral de toda a aplicação. Resultado agregado: **93,05% das instruções, 89,64% das ramificações, 93,06% das funções e 93,85% das linhas**. A interface e a associação de materiais também são exercitadas por testes de componentes e de fluxos completos.

## Dados pessoais e materiais

Antes da migração foram criados um JSON e um ZIP de segurança em `%APPDATA%\Ninho\backups`, com o prefixo `antes-ninho-1.1-2026-09-14T19-29-26-740Z`.

A coleção tem dois cursos principais, 15 matérias, 20 módulos, 271 aulas/materiais extras e 71 cartões. As preferências e o histórico foram preservados. Foram importadas cópias dos dois PDFs já existentes em Downloads, verificadas por SHA-256: Banco de dados aula 00 e Literatura aula 00. Ambos já estavam vinculados às respectivas aulas; a nova interface permite encontrá-los ali sem reimportar. Não foi criado progresso fictício.

A coleta completa dos demais PDFs do Estratégia permanece pendente. Depois de interrupções iniciais por controle simultâneo, a ferramenta encerrou a última tentativa por não conseguir confirmar a URL do Brave. Não houve novas tentativas após esse bloqueio. Nenhum PDF novo foi baixado nesta etapa. As 271 aulas ainda precisam de conferência de todos os documentos disponíveis, inclusive variantes das duas aulas com PDF já conhecido. Veja `PENDENCIAS-ESTRATEGIA.md`.

## Instalação e arquivos de entrega

- Aplicativo instalado: `C:\Users\aless\AppData\Local\Programs\Ninho\Ninho.exe`.
- Instalador: `C:\Users\aless\Ninho\release\Ninho-Setup-1.1.3.exe`.
- Atalhos **Ninho** na área de trabalho e no menu Iniciar apontam para o aplicativo instalado, com AppUserModelID `com.aless.ninho`.
- O instalador mantém o registro de versão e o desinstalador no Windows. O ícone incorporado foi conferido nos sete tamanhos de 16 a 256 pixels e permanece o mesmo nesta atualização.

SHA-256 do instalador:

```text
8CAA2060206C61FAB79563DFA87A6238E48EAC4AFCFA1E19CD172CEEC81DDA02
```

O estado pessoal e os dois PDFs mantiveram seus hashes SHA-256 antes e depois da instalação final 1.1.3. Versão do executável, conteúdo empacotado, ícone, registro do Windows, atalhos e desinstalador foram conferidos contra a compilação de entrega.

## Evidências

- `coverage/index.html`: cobertura instrumentada.
- `test-results/e2e-v1.1.3-final-report/index.html`: rodada final de 32 cenários.
- `test-results/pdf-render-before-report/index.html` e `test-results/pdf-render-after-report/index.html`: reprodução da prévia branca e sua correção, com capturas da página.
- `test-results/packaged-installed-1.1.3/result.json`: teste histórico do executável instalado 1.1.3 em perfil temporário, com imagens das telas.
- `tests/RESULTADOS-E2E.md` e `tests/ACCEPTANCE.md`: escopo e critérios dos testes de interface.
- `VALIDACAO-IA.md`: teste real, desempenho observado e limites da IA.
- `scripts/verify-installation.ps1`: conferência de versão, executáveis, registro, atalhos, ícone e integridade do estado, sem modificar a instalação.
- `.cache/installation-update-1.1.3.json` e `.cache/installation-verification-1.1.3.json`: instalação final, comparação de hashes e 26 conferências aprovadas.
- `.cache/materials-regression-real-profile.json`: resolução dos dois PDFs pessoais e comparação dos bytes das prévias.
- `.cache/pdf-preview-probe/`: comparação isolada do PDF real entre URLs `data:` e `blob:`.
- `.cache/native-pdf-verification-1.1.3.json`: observações da abertura real no Ninho e no leitor padrão, incluindo o aviso externo.
- `.cache/pdf-import-result.json`: importação dos dois documentos existentes.

## Limites da versão

O Estratégia está integrado por catálogo e links reais, sem sincronização automática. Os 71 cartões iniciais vêm de dois PDFs, não de todas as aulas. A conversa com a Íris usa IA generativa local via LM Studio e recebe um resumo dos registros; não lê automaticamente PDFs ou vídeos, não pesquisa a internet e não altera cadastros por conta própria. O acompanhamento depende das respostas e registros reais do usuário e não mede domínio factual nem detecta sozinho mudanças em leis ou tecnologias.
