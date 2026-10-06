# Ninho para Windows

Aplicativo de estudos offline. O projeto nativo de Windows foi movido para **`C:\Users\aless\RiderProjects\Ninho`**, em C#, .NET 10, WinUI 3 e Windows App SDK. Esta pasta mantém a implementação React/Electron anterior para comparação.

## Versão nativa no Rider

No Rider, abra `C:\Users\aless\RiderProjects\Ninho\Ninho.slnx`, selecione `Ninho.Windows` e plataforma **x64**. O projeto nativo contém seus próprios recursos, fontes, testes e scripts; não precisa de Node ou Electron.

```powershell
Set-Location C:\Users\aless\RiderProjects\Ninho
.\build.ps1 -Action Test
.\build.ps1 -Action Build
.\build.ps1 -Action Publish
.\install-preview.ps1
```

A publicação fica em `C:\Users\aless\RiderProjects\Ninho\artifacts\windows-x64`. O instalador atualiza somente **Ninho Nativo (Teste)**, mantendo a instalação antiga. Os atalhos npm `native:build`, `native:test` e `native:publish` desta pasta ainda encaminham para o projeto do Rider.

Consulte `README.md` e `DevDocs/VALIDATION.md` no projeto nativo para migração de dados, acompanhamento local, perfil, tutoriais e limites verificados. O acompanhamento analítico vem incluído; um GGUF é opcional apenas para elaborar texto nas opções avançadas do perfil.

Os dados nativos permanecem em `%LOCALAPPDATA%\Ninho\native`, independentes dos originais em `%APPDATA%\Ninho`. A mudança da pasta de desenvolvimento não move os dados nem as instalações. `NINHO_DATA_DIR` permite testes isolados.

## Referência anterior

O código React/Electron em `src/` foi preservado para comparação de design, comportamento e compatibilidade dos dados. Os comandos antigos `npm run build`, `npm test` e `npm start` ainda se referem a essa versão. A versão nativa não executa esse frontend e não utiliza WebView.

A comparação visual foi retomada com autorização do usuário. A equivalência de todas as telas, temas e escalas ainda está sendo conferida contra a instalação original.

## Repositórios

| Plataforma | Repositório local | Implementação |
| --- | --- | --- |
| Windows nativo | `C:\Users\aless\RiderProjects\Ninho` | C#/.NET 10 e WinUI 3; motor analítico incluído, GGUF opcional avançado |
| Windows anterior | `C:\Users\aless\WebstormProjects\Ninho` | React/Electron, referência preservada; acompanhamento local e LLM opcional |
| iPhone | `C:\Users\aless\Ninho-iOS` | SwiftUI e motor analítico local incluído; build iOS exige Mac/Xcode |
| Web | `C:\Users\aless\WebstormProjects\Ninho-Web` | React estático, armazenamento no navegador e resumo estatístico descritivo, sem IA |
| Android | `C:\Users\aless\StudioProjects\Ninho-Android` | Kotlin/Compose, análise local incluída e LiteRT-LM opcional avançado |

As plataformas mantêm sua documentação de validação. O projeto .NET foi extraído da antiga pasta `windows/`, que ainda não havia sido commitada; a mudança não criou commits. Os formatos de dados entre plataformas ainda não constituem um protocolo de sincronização comum.

Arquivos pessoais, materiais importados, backups, pesos de modelos, saídas de compilação e credenciais não devem ser versionados.

Documentação auxiliar: [domínio](devdocs/DOMINIO.md), [testes E2E](devdocs/TESTES-E2E.md), [critérios de aceitação](devdocs/ACCEPTANCE.md) e [resultados de interface](devdocs/RESULTADOS-E2E.md).
