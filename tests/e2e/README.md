# Testes do aplicativo Windows

```powershell
npm run build
npm run test:e2e
```

A compilação deve terminar antes dos testes. Cada cenário abre o Electron real com uma pasta própria, normalmente dentro de `%TEMP%\Ninho-E2E`. A exceção é a fixture de virtualização real do Windows, que usa somente `%APPDATA%\Ninho-QA-E2E-Overlay\profile-*`. A fixture confirma o caminho retornado pelo processo principal antes de executar as ações. O perfil pessoal e os dados do Anki não são usados.

Os cliques, formulários, prévias, persistência e chamadas IPC são reais. Os diálogos de seleção de arquivo, destino do backup e confirmação do sistema recebem respostas previsíveis por `electronApplication.evaluate`. Não existe uma rota de teste privilegiada no produto. Os arquivos sintéticos incluem PDF válido, texto, áudio WAV e vídeo WebM codificado pelo próprio renderer, sem câmera ou captura de tela.

O entrypoint `bootstrap.cjs`, exclusivo dos testes, carrega o `main.cjs` compilado e mantém as janelas ocultas para não disputar foco com o usuário. Ele substitui o HTTP do LM Studio antes de construir o serviço de IA: os cenários cobrem modelo leve, bloqueio de modelo grande, contexto, histórico, indisponibilidade, erro e cancelamento sem carregar modelos ou acessar o servidor pessoal. A ponte IPC e a montagem do prompt no processo principal continuam reais. Testar o modelo instalado de fato é uma verificação separada de entrega, não uma capacidade demonstrada pelas respostas simuladas.

O perfil de migração em `tests/fixtures/v1-state.json` é sintético, derivado do catálogo distribuído e preenchido com anotações, revisão, sinalização, prova, tarefa, sessão e anexo fictícios. O teste compara todos os dados antigos após migrar para a hierarquia de cursos, sem ler `AppData` pessoal.

Por padrão, os cenários rodam em série. A regressão final 1.1.2 usou `--workers=2`, com processos e perfis independentes. O cronômetro usa o relógio controlado do Playwright para verificar passagem de tempo sem esperar vários minutos. O teste de persistência encerra e reabre o processo com o mesmo perfil temporário.

Para repetir somente a regressão de materiais e aulas após compilar:

```powershell
npx playwright test tests/e2e/lesson-materials.spec.ts tests/e2e/materials.spec.ts tests/e2e/subject-materials.spec.ts tests/e2e/studies.spec.ts tests/e2e/lesson-focus.spec.ts --workers=2
```

O conjunto atual tem 32 cenários. `lesson-materials.spec.ts` verifica importação por aula, movimentação, PDF real e persistência. `lesson-focus.spec.ts` verifica tempo por aula, pausa, reinício e proteção do vínculo. `mentor-readability.spec.ts` cobre tamanhos de texto, espaçamento e movimento reduzido. Os resultados estão em `tests/RESULTADOS-E2E.md`.

`materials.spec.ts` também abre PDFs sintéticos válidos pequeno e de 12 MiB, incluindo o grande após reiniciar. A captura nativa é recortada à página principal do plugin PDF, excluindo toolbar e miniaturas; os pixels dos dois blocos vetoriais devem estar presentes. Iframe visível e controles carregados, sozinhos, não comprovam a pintura. O endereço da prévia deve usar `blob:`, evitando a URL base64 longa que deixava documentos grandes em branco.

`material-paths.spec.ts` exercita arquivos existentes em overlay real de AppData e junction com caixa mista. O filesystem e o resolver não são simulados: apenas diálogos e `shell.openPath` são controlados, e o caminho enviado ao leitor deve ser o realpath do anexo registrado. O cenário de overlay registra skip explícito se o Windows não fornecer virtualização; um erro de abertura nunca é convertido em skip. Também cobre arquivo ausente, recuperação da prévia sem perder rascunho e restauração de backup válido sobre um PDF danificado. Perfis e junctions de teste são removidos após conferir seus caminhos.

Falhas guardam captura da janela e erros do renderer em `test-results/e2e-artifacts`. O relatório HTML fica em `test-results/e2e-report`. O diretório temporário só é removido depois de conferir que o caminho resolvido pertence à pasta de testes.

Esses testes não abrem o Estratégia em uma sessão autenticada nem marcam aulas na plataforma. O teste de integração confere o link enviado ao navegador substituindo apenas a chamada do sistema que o abriria.
