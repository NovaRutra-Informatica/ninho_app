# Testes do aplicativo Windows

```powershell
npm run build
npm run test:e2e
```

A compilação deve terminar antes dos testes. Cada cenário abre o Electron real com uma pasta própria dentro de `%TEMP%\Ninho-E2E`. A fixture confirma o caminho retornado pelo processo principal antes de executar as ações. O perfil pessoal e os dados do Anki não são usados.

Os cliques, formulários, prévias, persistência e chamadas IPC são reais. Os diálogos de seleção de arquivo, destino do backup e confirmação do sistema recebem respostas previsíveis por `electronApplication.evaluate`. Não existe uma rota de teste privilegiada no produto. Os arquivos de importação são um PDF mínimo válido e um texto gerados pela própria fixture.

Os cenários rodam em série. O cronômetro usa o relógio controlado do Playwright para verificar passagem de tempo sem esperar vários minutos. O teste de persistência encerra e reabre o processo com o mesmo perfil temporário.

Falhas guardam captura da janela e erros do renderer em `test-results/e2e-artifacts`. O relatório HTML fica em `test-results/e2e-report`. O diretório temporário só é removido depois de conferir que o caminho resolvido pertence à pasta de testes.

Esses testes não abrem o Estratégia em uma sessão autenticada nem marcam aulas na plataforma. O teste de integração confere o link enviado ao navegador substituindo apenas a chamada do sistema que o abriria.
