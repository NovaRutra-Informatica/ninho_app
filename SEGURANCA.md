# Segurança do Ninho para Windows

Verificação em **15/09/2026**, para o código e o pacote **1.1.5**. A instalação pessoal permanece na versão **1.1.4**; esta auditoria não instalou nem abriu uma atualização no perfil pessoal.

## Dependências e runtime

`npm audit --json`, incluindo dependências de desenvolvimento, terminou com **zero vulnerabilidades reportadas** em todas as severidades. O relatório contém 465 dependências no total. `npm ls --all --json` terminou sem erro; as 29 dependências diretas instaladas correspondem ao lockfile, e os endereços de pacotes resolvidos usam o registro oficial do npm. As versões de dependências foram mantidas: não foi encontrada correção de pacote pendente no resultado do npm. `package.json` e `package-lock.json` mudaram somente a versão do aplicativo.

Evidências locais, ignoradas pelo Git: `.cache/npm-audit-security-final.json`, `.cache/npm-tree-security.json` e `.cache/dependency-consistency-security.json`. O resultado do audit depende dos avisos conhecidos pelo registro na data da consulta; não é uma prova de ausência de falhas desconhecidas ou de problemas no código nativo.

O processo Electron real confirmou **Electron 44.3.0, Chromium 152.0.7977.78 e Node.js 24.20.0**. A versão 44.3.0 era a versão estável mais recente publicada pelo Electron na consulta. O pacote inclui as correções de validação interna de IPC e permissões descritas nas [notas oficiais do Electron 44.3.0](https://releases.electronjs.org/release/v44.3.0). Evidência do binário: `.cache/electron-runtime-security.json`.

Os avisos recentes publicados pelo projeto também foram consultados. A versão 44.3.0 está fora das faixas afetadas listadas para [herança de sandbox em popups](https://github.com/electron/electron/security/advisories/GHSA-gr2m-v5gq-v685), [Node em workers de webview](https://github.com/electron/electron/security/advisories/GHSA-9qh4-3jw8-366w), [CORS em protocolos personalizados](https://github.com/electron/electron/security/advisories/GHSA-j84w-jfhq-vhvj) e [cache entre sessões em ProtocolResponse](https://github.com/electron/electron/security/advisories/GHSA-r4w5-6pfg-jxp5).

**Limite do Chromium:** o boletim do [Chrome estável de 08/09/2026](https://chromereleases.googleblog.com/2026/09/stable-channel-update-for-desktop_0808145027.html) anuncia correções no Chrome 153, incluindo CVE-2026-87585 em PDFium. O Electron estável disponível ainda usa Chromium 152. Não foi encontrada confirmação pública suficiente, por CVE, de quais correções desse boletim foram incorporadas ao runtime do Electron utilizado. Portanto, esta auditoria não declara essas CVEs corrigidas no Ninho nem afirma que o runtime esteja livre de vulnerabilidades. Esse acompanhamento permanece necessário nas próximas versões estáveis do Electron; não foi substituído por uma versão alfa sem validação.

## Correção aplicada

A política de conteúdo da interface de produção ainda permitia WebSockets locais usados pelo desenvolvimento. Um teste com Electron e servidor local reais reproduziu a conexão antes da correção. A versão 1.1.5 usa `connect-src 'none'`, `base-uri 'none'` e `form-action 'none'`: a interface não inicia conexões diretas, não aceita uma base de URL injetada e não envia formulários para outro destino. A comunicação com o LM Studio continua pelo serviço restrito do processo principal.

O Vite acrescenta as permissões de atualização durante o desenvolvimento somente quando serve a aplicação. Elas não entram no HTML compilado. Foram preservadas as permissões locais necessárias às prévias PDF; o teste de pintura real, inclusive com PDF de 12 MiB, passou com a política mais restrita.

As regressões verificam bloqueio efetivo no navegador, nenhum handshake recebido pelo servidor, violações das três diretivas e separação da política de desenvolvimento. Os relatórios anterior e posterior ficam em `test-results/security-csp-before-report/index.html` e `test-results/security-csp-after-report/index.html`. A falha anterior é uma reprodução intencional, não um resultado aprovado.

## Fronteiras revisadas

- A janela usa isolamento de contexto, sandbox e segurança do navegador; Node no renderer e em workers e a tag webview estão desativados. Permissões e novas janelas são negadas. Os valores efetivos também são conferidos no Electron real.
- O IPC exige o documento esperado, o frame principal e o `webContents` autorizado. Um teste novo confirma que outra janela não consegue carregar dados mesmo usando o documento e o preload do Ninho. A ponte não expõe um canal IPC genérico nem execução de comandos.
- Links externos aceitam somente HTTP/HTTPS, sem credenciais ou caracteres de controle. Anexos usam cópias gerenciadas, nomes internos validados, limites e identidade de arquivo; executáveis não são importáveis. Foram preservadas as verificações de caminhos canônicos, overlay e junctions.
- Backups são processados com limites, verificação de caminhos e integridade, preservando a coleção anterior. Não foi alterado o mecanismo de backup nesta revisão.
- A IA usa o endereço fixo `127.0.0.1:1234`, rejeita redirecionamentos e limita requisição, resposta e tempo de espera. A CLI local é chamada com argumentos separados, sem shell. O modelo não recebe ferramentas para executar comandos ou alterar cadastros. A política da interface não altera esse serviço.

Essas medidas foram comparadas às [recomendações oficiais de segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security). A revisão não equivale a um teste de intrusão completo, nem audita o Windows, o LM Studio instalado ou os aplicativos externos usados para abrir materiais.

## Manutenção e entrega

`.github/dependabot.yml` prepara verificações semanais do ecossistema npm, com até cinco propostas abertas e sem fusão automática. O arquivo só terá efeito em um repositório hospedado no GitHub com os recursos correspondentes habilitados; nenhuma publicação, configuração remota ou ativação de alertas foi executada. A configuração segue a [documentação do Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference). Para reproduzir o ambiente, use `npm ci` com o lockfile versionado.

Os dados pessoais, materiais, relatórios locais e segredos permanecem excluídos pelo `.gitignore`. Nenhum commit ou staging foi realizado. Os resultados de testes e o instalador preparado estão registrados em [VALIDACAO.md](VALIDACAO.md).
