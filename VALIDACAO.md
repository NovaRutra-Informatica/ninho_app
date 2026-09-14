# Validação do Ninho 1.1.2

Executada em 14/09/2026, no Windows 11 x64.

## Resultados

| Verificação                                                         | Resultado                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TypeScript e compilação de produção                                 | Aprovados                                                                                                                |
| Vitest: domínio, armazenamento, IA, backup, segurança e componentes | 416 testes aprovados em 20 arquivos                                                                                      |
| Playwright com Electron: fluxos completos                           | 26 cenários aprovados no build 1.1.1                                                                                     |
| Regressão após adicionar materiais dentro de cada aula              | 8 cenários aprovados no build 1.1.2                                                                                      |
| LM Studio e modelo real                                             | Duas respostas locais recebidas; instância do teste liberada ao final                                                    |
| Instalador, registro, atalhos e preservação dos dados               | Instalador terminou com código 0; 26 conferências da instalação aprovadas                                                |
| Auditoria de dependências                                           | npm audit sem vulnerabilidades conhecidas                                                                                |
| Aplicativo instalado 1.1.2                                          | Navegação nas oito áreas, temas, janela mínima e persistência após reinício aprovados; 14 de 14 capturas nativas obtidas |

Os testes automatizados usaram perfis temporários, separados do perfil pessoal. Nos testes de interface, os seletores nativos e as chamadas que abririam outros aplicativos têm respostas controladas. O HTTP do LM Studio é simulado nesses cenários; a execução com modelo real foi verificada separadamente, conforme `VALIDACAO-IA.md`.

## Funcionalidades exercitadas

- Cursos principais, matérias, módulos e aulas: criação, edição, pesquisa, filtros e navegação. Migração do formato anterior preservando IDs, histórico, notas e vínculos.
- Data da tela Hoje abrindo o calendário; provas, tarefas, conclusão, reabertura, edição e exclusão.
- Cartões, quatro avaliações de lembrança, agendamento, limite global de novos cartões, edição, exclusão, suspensão e sinalizações.
- Cronômetro por matéria e aula, pausa, retomada, reinício, conclusão, persistência e recuperação após reabertura. Pausas não somam tempo de estudo. O vínculo não muda durante uma sessão em andamento, e registrar tempo não conclui a aula automaticamente. Botões visíveis nas janelas padrão e compacta.
- Materiais dentro da matéria e da aula, importação com contexto explícito, cópia independente, seletor para mover o material entre aulas, prévias de PDF e texto, anotações, edição e remoção. Trocar a matéria limpa o vínculo com a aula anterior. Proteção contra respostas assíncronas fora de ordem e edições durante salvamento.
- Vídeo WebM e áudio WAV válidos: importação, filtros, encaminhamento ao caminho interno correto, backup e restauração byte a byte. Importação de mídia acima de 100 MiB e rejeição acima do limite de 2 GiB também verificadas.
- Backup por streaming, ZIP/ZIP64, restauração de formatos anterior e atual, cancelamento, limites, integridade, recuperação e preservação da coleção anterior.
- IA: seleção de modelo, contexto dos registros e da matéria, histórico, resposta livre, indisponibilidade, erro, cancelamento, nova conversa e liberação apenas de modelos carregados pelo Ninho. O contexto distingue tempo registrado por aula de domínio ou conclusão.
- Preferências persistidas, temas claro e escuro, contraste, textos maiores na assistente, layout e posicionamento do visualizador de PDF na janela. Transições nativas entre páginas, navegação rápida e preferência de movimento reduzido do usuário e do Windows.
- Validação de IPC, URLs e arquivos, conteúdo de texto sem execução de HTML e proteção contra caminhos inválidos em backups.

A cobertura instrumentada reportada abrange os módulos de domínio, armazenamento, segurança, IA e backup; não representa cobertura integral de toda a aplicação. Resultado agregado: **93,13% das instruções, 89,51% das ramificações, 92,96% das funções e 94,04% das linhas**. A interface e a associação de materiais também são exercitadas por testes de componentes e de fluxos completos.

## Dados pessoais e materiais

Antes da migração foram criados um JSON e um ZIP de segurança em `%APPDATA%\Ninho\backups`, com o prefixo `antes-ninho-1.1-2026-09-14T19-29-26-740Z`.

A coleção tem dois cursos principais, 15 matérias, 20 módulos, 271 aulas/materiais extras e 71 cartões. As preferências e o histórico foram preservados. Foram importadas cópias dos dois PDFs já existentes em Downloads, verificadas por SHA-256: Banco de dados aula 00 e Literatura aula 00. Ambos já estavam vinculados às respectivas aulas; a nova interface permite encontrá-los ali sem reimportar. Não foi criado progresso fictício.

A coleta completa dos demais PDFs do Estratégia permanece pendente. Depois de interrupções iniciais por controle simultâneo, a ferramenta encerrou a última tentativa por não conseguir confirmar a URL do Brave. Não houve novas tentativas após esse bloqueio. Nenhum PDF novo foi baixado nesta etapa. As 271 aulas ainda precisam de conferência de todos os documentos disponíveis, inclusive variantes das duas aulas com PDF já conhecido. Veja `PENDENCIAS-ESTRATEGIA.md`.

## Instalação e arquivos de entrega

- Aplicativo instalado: `C:\Users\aless\AppData\Local\Programs\Ninho\Ninho.exe`.
- Instalador: `C:\Users\aless\Ninho\release\Ninho-Setup-1.1.2.exe`.
- Atalhos **Ninho** na área de trabalho e no menu Iniciar apontam para o aplicativo instalado, com AppUserModelID `com.aless.ninho`.
- O instalador mantém o registro de versão e o desinstalador no Windows. O ícone incorporado foi conferido nos sete tamanhos de 16 a 256 pixels e permanece o mesmo nesta atualização.

SHA-256 do instalador:

```text
8571A545F975EF562E916223C9F3B6C2F3767370D8A3D3C58A021130F6166708
```

O estado pessoal e os dois PDFs mantiveram seus hashes SHA-256 antes e depois da instalação 1.1.2. Versão do executável, conteúdo empacotado, ícone, registro do Windows, atalhos e desinstalador foram conferidos contra a compilação de entrega.

## Evidências

- `coverage/index.html`: cobertura instrumentada.
- `test-results/e2e-v1.1.1-report/index.html`: 26 cenários completos.
- `test-results/e2e-v1.1.2-report/index.html`: oito cenários finais de materiais, aulas e cronômetro.
- `test-results/packaged/result.json`: teste do executável instalado 1.1.2 em perfil temporário, com imagens das telas.
- `tests/RESULTADOS-E2E.md` e `tests/ACCEPTANCE.md`: escopo e critérios dos testes de interface.
- `VALIDACAO-IA.md`: teste real, desempenho observado e limites da IA.
- `scripts/verify-installation.ps1`: conferência de versão, executáveis, registro, atalhos, ícone e integridade do estado, sem modificar a instalação.
- `.cache/installation-update-1.1.2.json` e `.cache/installation-verification-1.1.2.json`: instalação, comparação de hashes e 26 conferências aprovadas.
- `.cache/pdf-import-result.json`: importação dos dois documentos existentes.

## Limites da versão

O Estratégia está integrado por catálogo e links reais, sem sincronização automática. Os 71 cartões iniciais vêm de dois PDFs, não de todas as aulas. A conversa com a Íris usa IA generativa local via LM Studio e recebe um resumo dos registros; não lê automaticamente PDFs ou vídeos, não pesquisa a internet e não altera cadastros por conta própria. O acompanhamento depende das respostas e registros reais do usuário e não mede domínio factual nem detecta sozinho mudanças em leis ou tecnologias.
