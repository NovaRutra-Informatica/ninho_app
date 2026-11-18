# Ninho nativo para Windows 11

C# e .NET 10 com WinUI 3 e Windows App SDK. A janela usa Mica, NavigationView, temas nativos e controles XAML. A interface retoma a paleta, as fontes Fraunces/DM Sans, a composição das telas e a coruja do aplicativo original. Não hospeda React, Electron ou WebView.

Este repositório também preserva a versão anterior React/Electron em `src/` para comparar comportamento e dados. A solução nativa está nos projetos `Ninho.*`; as duas implementações são independentes.

## Abrir no Rider

Este projeto está em `C:\Users\aless\RiderProjects\Ninho`. Abra `Ninho.slnx`, selecione `Ninho.Windows` e plataforma **x64**. `Ninho.Core` contém as regras e `Ninho.Tests` a suíte de domínio. Recursos, fontes e ícones acompanham a solução; o build não depende do projeto React nem de Node.

A implementação React/Electron ficou em `C:\Users\aless\WebstormProjects\Ninho` para comparação. A migração da pasta não moveu dados pessoais ou instalações. A pasta nativa anterior (`windows/`) ainda não estava commitada; a mudança não criou commits.

## Compilar e testar

Requisitos de desenvolvimento: Windows 11 x64, SDK .NET 10.0.401 e acesso ao NuGet na primeira restauração. O Windows SDK é restaurado pelo projeto. As versões transitivas estão em `packages.lock.json`.

```powershell
./build.ps1 -Action Test
./build.ps1 -Action Build
./build.ps1 -Action Publish
```

Esses comandos usam a edição **Preview** para desenvolvimento, identificada na barra superior e sem exigir compra. `Publish` gera `artifacts/windows-x64/Ninho.exe` com o runtime .NET e Windows App SDK; não abre nem instala o aplicativo. Essa prévia não deve ser vendida ou publicada como edição comercial. A pasta inteira é necessária; não mova só o executável. Para uma prévia menor em máquinas que já têm o runtime .NET 10 x64, use `-FrameworkDependent`; a saída vai para `artifacts/windows-x64-framework-dependent`. A prévia não está assinada. `Test` executa os testes de estudos e de licenciamento.

## Compra única e licença para Windows

A edição comercial exige uma licença perpétua: o usuário informa seu código uma vez, recebe um comprovante assinado e depois usa o aplicativo offline, sem mensalidade, vencimento ou consulta periódica obrigatória. A ativação ocorre antes de abrir a coleção. Uma falha não apaga os estudos. O Windows protege a identidade da instalação com chave CNG não exportável (TPM quando disponível); o comprovante local usa DPAPI e a assinatura do emissor é conferida a cada abertura. Backups de estudos não carregam a licença.

O cliente só contém chaves públicas. O emissor/serviço de ativação fica em `Ninho.LicenseServer`, separado da distribuição do aplicativo, e limita as instalações por código com operações atômicas. A ativação envia código de compra e chave pública/prova da instalação, sem nome, materiais ou histórico de estudos. Para um computador sem internet, **Ativação assistida** exporta uma solicitação ao suporte e aceita o comprovante assinado de volta. Esse arquivo contém o código de compra e não deve ser publicado.

Ainda é necessário configurar as chaves públicas do emissor, a infraestrutura de venda/entrega de códigos e um certificado comercial de assinatura. Para ativação online, configure também o endereço HTTPS real; `activationEndpoint` vazio com chaves válidas seleciona somente ativação assistida. Nenhum serviço foi implantado ou pagamento configurado. A configuração pública sem chaves é intencional: publicação comercial deve falhar enquanto esses requisitos estiverem ausentes. O uso comum do Ninho continua offline; somente a compra/ativação envolve os serviços de distribuição.

```powershell
./build.ps1 -Action Build -Distribution Production
./build.ps1 -Action Publish -Distribution Production `
  -LicensingPublicConfiguration 'C:\Distribuicao\Ninho\production.public.json' `
  -SigningCertificateThumbprint 'THUMBPRINT_DO_CERTIFICADO' `
  -TimestampServer 'https://SERVIDOR-DE-TIMESTAMP-DO-CERTIFICADO'
```

Os valores acima precisam ser substituídos pelos reais. A saída comercial é `artifacts/windows-x64-commercial`; seu executável e DLLs Ninho recebem assinatura Authenticode com timestamp. Publicar diretamente pelo projeto exige Release e configuração pública válida, mas não substitui a assinatura e a conferência do pacote comercial pelo script. Preview/Debug são exceções de compilação, sem variável de ambiente ou opção do usuário para desbloquear a edição comercial.

Consulte [licenciamento do cliente](DevDocs/LICENSING-WINDOWS.md) e [operação do emissor](DevDocs/LICENSING-SERVER.md). Proteção local dificulta adulteração e compartilhamento; não torna um executável impossível de modificar. Licenças já ativadas e permanentemente offline não recebem revogação imediata por reembolso ou transferência. Não há liberação automática de assentos que permita multiplicar ativações offline.

## Instalar para comparar com o Ninho anterior

Neste computador, por preferência do usuário, cada rodada de alterações da versão Windows deve terminar com a validação, publicação e atualização da instalação local. Depois de instalar, conferir a abertura pelo atalho atualizado. Preservar os dados de estudo e encerrar normalmente uma instância antiga antes de abrir a nova. Apenas compilar não conclui a entrega.

Depois de publicar, execute `./install-preview.ps1`. A instalação por usuário fica em `%LOCALAPPDATA%\Programs\Ninho-Native-Preview`, com o nome **Ninho Nativo (Teste)** na área de trabalho, menu Iniciar e Aplicativos instalados. O script não exige administrador nem abre a aplicação. A instalação anterior e seus atalhos são preservados. Cada atualização recebe uma subpasta própria; as cópias são conferidas por SHA-256.

As duas versões podem ficar abertas ao mesmo tempo. A cópia inicial dos estudos ocorre na primeira abertura da versão nativa; os dados seguem independentes depois disso. Para desinstalar, use **Ninho Nativo (Teste)** em Aplicativos instalados. O desinstalador mantém os dados de estudo e a versão antiga. Os scripts recusam diretórios de outra instalação e destinos redirecionados por links/junctions.

Os TTFs e suas licenças estão em `Ninho.Windows/Assets/Fonts`. São derivados dos mesmos arquivos Fontsource da interface anterior. Não é preciso instalar fontes nem Node para compilar o aplicativo nativo. A correspondência de faces e pesos está em [Fontes](DevDocs/FONTS.md).

A interface reutiliza 60 desenhos Lucide, com 63 aliases, como vetores WinUI, incluindo o ícone `minus` dos controles de duração. A licença está em `Assets/Icons`. `node scripts/prepare-native-icons.mjs --check` (na pasta React de referência) confere as geometrias contra a dependência original. As seis faces TTF incluem Fraunces 500 e DM Sans 400/500/600/700 originais descomprimidos, mais uma face de compatibilidade, conferidas com `python scripts/prepare-native-font.py --check` (na referência). A coruja mantém os paths, cores e animações do SVG original. A sidebar usa a ordem original e o temporizador fica no cartão **Hora de focar**.

## Dados e compatibilidade

### Cópias diárias leves

O Ninho mantém uma cópia ZIP por dia em `%LOCALAPPDATA%\Ninho\AutomaticBackups`, fora da instalação e dos dados ativos. Guarda perfil e respostas, planos salvos, cursos, matérias, aulas/anotações, questões/tentativas, sessões/progresso, agenda, preferências e os agregados locais da assistente. Não inclui PDFs, vídeos nem pesos de IA. Os vínculos dos materiais são mantidos; os arquivos precisam ser guardados à parte ou no backup completo.

A cópia do dia é atualizada dez segundos após mudanças, a cada cinco minutos de uso e ao fechar normalmente. Conteúdo idêntico não regrava o arquivo. São mantidos os 14 dias mais recentes com cópias e até três arquivos inválidos preservados para diagnóstico. A escrita é atômica, comprimida, limitada e verificada por SHA-256. Falhas ficam em Ajustes e não bloqueiam a gravação dos estudos. Não há agendamento nem serviço depois que o aplicativo é fechado.

Se reinstalar e `state.json` estiver ausente, o Ninho procura a cópia válida mais recente e recupera perfil e registros antes de abrir. Estado existente, inclusive inválido, nunca é substituído silenciosamente. Um cronômetro recuperado fica pausado no instante da cópia, sem inventar tempo durante a ausência. **Ajustes → Seu caminho fica guardado** permite ver o estado da cópia, abrir/escolher a pasta, atualizar imediatamente ou restaurar uma cópia explicitamente; restauração manual preserva o estado anterior.

A pasta padrão é local e sobrevive à desinstalação feita pelos nossos scripts. Para sincronizar, o usuário pode selecionar uma pasta que já usa no OneDrive ou em outro serviço. A preferência da pasta fica fora da instalação. O Ninho não configura contas nem envia arquivos à nuvem. Arquivos que existem somente no serviço precisam estar disponíveis no computador para restauração offline. [Placeholders do OneDrive](https://learn.microsoft.com/en-us/windows/compatibility/placeholder-files) são distintos de links/junctions; estes últimos e seus diretórios ancestrais são recusados pelo mecanismo de backup usando [LinkTarget](https://learn.microsoft.com/en-us/dotnet/api/system.io.filesysteminfo.linktarget?view=net-10.0).

- Dados nativos: `%LOCALAPPDATA%\Ninho\native`. Sem servidor, conta ou telemetria.
- Na primeira abertura, se houver `%APPDATA%\Ninho\state.json`, copia os estudos e os anexos existentes. A instalação anterior e seus arquivos não são alterados. As duas versões passam a manter cópias independentes.
- Sem dados anteriores, usa o catálogo de estudos de `resources/seed.json`.
- Aceita estados v1/v2 e backups ZIP da versão anterior; preserva campos adicionais. O JSON leva registros, mas não os anexos. ZIP leva ambos e verifica tamanho, caminhos e SHA-256.
- A restauração preserva `backups/before-restore-*.json`. Os anexos anteriores são mantidos; novos anexos restaurados ganham nomes distintos. Gravações usam troca atômica e uma cópia `.previous`.
- Estado inválido não é silenciosamente trocado pelo catálogo inicial.
- Para testes isolados, defina `NINHO_DATA_DIR` antes de executar; isso desliga a migração automática dos dados pessoais.

## Fluxos disponíveis

Hoje com próximo estudo, tarefas, provas, foco e sequência; cursos → matérias → módulos → aulas; anotações, status e materiais vinculados; biblioteca com prévias nativas de PDF, imagens, texto, áudio e vídeo; revisão espaçada e acervo editável; agenda com provas/tarefas; progresso; foco, pausa e cronômetro livre; preferências, tema e backups. Matérias podem ser movidas entre cursos mantendo aulas e histórico.

A biblioteca importa até 100 arquivos por lote, com publicação atômica. PDFs Estratégia com curso/aula reconhecíveis no nome recebem vínculos sugeridos automaticamente; o contexto explícito de uma matéria/aula tem prioridade. Arquivos originais são preservados.

PDFs têm navegação por página, zoom de 50–400% e painel com texto selecionável/copiável. A pesquisa usa [PdfPig 0.1.16](https://www.nuget.org/packages/PdfPig/0.1.16), em segundo plano, com limite de 64 MB por arquivo, 300 páginas, 2 milhões de caracteres e 20 segundos cooperativos. Páginas posteriores podem ter o texto extraído individualmente. A prévia visual não tem limite de 300 páginas; cada imagem é limitada a 1.800×2.400 pixels. Não há OCR, e a ordem do texto extraído pode diferir do documento. Fechar a prévia cancela o trabalho pendente; uma operação de CPU do parser pode levar algum tempo para observar o cancelamento.

O temporizador usa horários persistidos e conta o tempo ao retornar da suspensão/fechamento. A contagem regressiva é limitada à duração escolhida; o cronômetro livre, a 24 horas. Ao zerar, salva o foco uma única vez e prepara a pausa; concluir antes registra só o tempo decorrido. Pausas não contam como estudo. O feedback da última sessão pode ser salvo durante a pausa. Fechar a janela não mantém um processo de alarme em segundo plano; a conclusão é recuperada ao abrir novamente.

O texto de anotações em edição é mantido durante a navegação nesta execução. Use **Salvar anotações** para persistir antes de fechar. Formulários conservam seus campos se a validação ou a gravação falhar.

## Perfil, apresentação e tutoriais

Instalações novas começam numa apresentação própria, sem sidebar ou controles de navegação do aplicativo. A coruja conduz dez telas: nome, objetivo, motivação/prazo, matérias, ponto de partida, rotina, dias/horário, duração, preferências/desafios e conforto. Os campos usam as cores e fontes do Ninho, com animações e redução de movimento. Nome e objetivo são necessários; os demais textos são opcionais. A etapa e as respostas são salvas localmente. A tela Hoje só é liberada depois da criação do perfil.

Quem já usava o aplicativo abre **Meu perfil** pelo nome na sidebar; **Ver a apresentação** permite percorrer as perguntas. Objetivos e rotina podem ser editados a qualquer momento, com salvamento automático. O perfil acompanha o backup de estudos e entra inteiro no contexto de qualquer geração opcional; planos gerados não substituem as respostas. Tutoriais aparecem na primeira visita às telas e podem ser revistos pelo perfil.

Se uma gravação falhar, as alterações pendentes são mantidas em ordem nesta sessão e o aviso oferece **Tentar salvar novamente**. A fila só retira uma alteração após a confirmação da escrita; falhas na atualização visual não repetem uma gravação já confirmada. É necessário recuperar a escrita antes de encerrar: alterações ainda pendentes na memória não sobrevivem a um encerramento forçado.

Ajustes também salvam automaticamente. Exportar/restaurar backup continuam sendo ações explícitas. Agenda, revisões e temporizador atualizam os controles afetados, sem reconstruir a página a cada data, revelação ou início/pausa. A sidebar anima os mesmos ícones Lucide do original. Os sons de interação do Windows estão desativados; o Ninho usa um aviso próprio, discreto e opcional. O tema escuro usa cinzas neutros.

A troca entre telas usa uma entrada suave com opacidade de 180 ms e deslocamento de 7 pixels em 220 ms. Ela também acompanha cursos/matérias e Aulas/Materiais em Meus estudos, além das seções de Revisões. Ticks, autosave, revelação de cartões e mudanças de data mantêm os controles e não disparam essa transição. A preferência Reduzir animações e a configuração de animações do Windows são respeitadas.

## Assistente presente, incluída e offline

O acompanhamento funciona assim que o app é instalado: não exige importar pesos, abrir o LM Studio nem conversar em um chat. Hoje traz um recado e Minha assistente reúne sugestões com a evidência usada. Meu perfil é onde o estudante comunica objetivos e preferências.

O motor analítico é próprio, pequeno e incluído no código. Usa revisões disponíveis, dificuldades autoavaliadas, lacunas de registros, frequência por dia disponível e horários recorrentes de conclusão. Um modelo Beta-Bernoulli com prior uniforme atualiza a estimativa de frequência conforme surgem registros; a faixa mostrada é aproximada. Padrões de horário exigem pelo menos seis sessões em quatro dias. Não é um LLM treinado nem uma medida objetiva de aprendizagem. Autoavaliação não vira taxa de acerto, e tempo sem registro pode ser estudo feito fora do Ninho.

As visitas e o tempo ativo com cada tela do Ninho em primeiro plano são agregados por dia, com retenção de 90 dias e apenas dez rotas permitidas. Após 60 segundos sem interação, o intervalo deixa de contar como uso ativo. Em **Meu perfil**, é possível desativar a coleta e apagar as observações. Pausas manuais são contadas separadamente; sair do app não significa interromper o estudo. Não observamos outros aplicativos, conteúdo digitado, URLs ou tela. Esses agregados ficam em `coach-usage.json`, separados das sessões e dos minutos de estudo, e não entram no backup de estudos. Uma restauração de estudos limpa as observações derivadas daquela instalação para não misturar perfis. O perfil e as respostas continuam no backup.

A análise é recalculada em tarefa curta após mudanças e durante o uso em primeiro plano. Ao desativar a janela, a análise e qualquer geração opcional são canceladas. O temporizador continua calculando o tempo pelos horários persistidos. Fechar o aplicativo Windows ainda não mantém um serviço de alarme: o tempo é recuperado ao reabrir.

### Modelo de linguagem opcional

**Meu perfil → Modelo de linguagem opcional · avançado** permite elaborar um plano em texto usando um GGUF já existente. A lista encontra pastas padrão ou personalizadas do LM Studio; selecionar valida e salva automaticamente, sem botão Usar modelo. Escolher arquivo e Atualizar lista continuam disponíveis. Ajustes também mantém a seleção avançada. O acompanhamento normal não depende disso.

Use GGUF Instruct compatível com llama.cpp, até 6 GiB. O arquivo continua no local original. Catálogo/validação rodam fora da interface; arquivos divididos, projetores e links não entram. LLamaSharp 0.27.0 usa CPU dentro do processo, com cancelamento e liberação dos pesos ao terminar; não usa GPU, Siri, nuvem ou servidor externo. Nenhum peso foi treinado ou baixado nesta etapa.

O contexto de linguagem contém o perfil completo e um resumo limitado dos registros, sem leitura integral de materiais. Se o perfil não couber, o app avisa, sem truncá-lo silenciosamente. Resultados podem conter erros de interpretação ou duração; a geração opcional não certifica um plano pedagógico. Veja [medições e limites](DevDocs/VALIDATION.md).

## Validação e limites

O [relatório de desempenho e modais](DevDocs/PERFORMANCE-2026-09-23.md) registra as cargas com 71, 1.000 e 5.000 cartões, as medições antes/depois, 184 testes Core e os limites de validação visual. `./measure-performance.ps1`, após compilar, abre uma janela com dados sintéticos separados e produz um relatório de construção/layout, alocações e quantidade de controles; use quando estiver livre para executar esse teste de interface. Os testes Core podem rodar sem controlar a tela.

Consulte [VALIDATION.md](DevDocs/VALIDATION.md) para o histórico e a cobertura: a rodada atual passou **184 testes Core**. Em rodadas anteriores, o onboarding foi exercitado no aplicativo com dados isolados: dez perguntas sem sidebar, controles no estilo Ninho, navegação, dia de sexta-feira, bloco de 15 para 20 minutos salvo e sincronizado com Ajustes/Foco, retomada na pergunta 8 após reabrir e conclusão com perfil e plano analítico, sem LLM. Também foram comparados sidebar, Hoje, aulas, revisões, agenda e ajustes com o original. A atualização atual foi instalada sem abrir o aplicativo, respeitando a reserva do controle da tela para outra tarefa. A inspeção visual final dos modais, todas as escalas DPI e estados de cada tela ainda não foram certificados como visualmente idênticos.

## Implementação anterior em React/Electron

Na cópia em `C:\Users\aless\WebstormProjects\Ninho`, os comandos `npm run build`, `npm test` e `npm run test:e2e` compilam e validam a implementação anterior em `src/`. Os atalhos `npm run native:build`, `npm run native:test` e `npm run native:publish` encaminham para a solução nativa no Rider. Os dados Electron ficam em `%APPDATA%\Ninho`; os dados nativos permanecem em `%LOCALAPPDATA%\Ninho\native`.

| Plataforma | Repositório local | Implementação |
| --- | --- | --- |
| Windows nativo | `C:\Users\aless\RiderProjects\Ninho` | C#/.NET 10 e WinUI 3 |
| Windows anterior | `C:\Users\aless\WebstormProjects\Ninho` | React/Electron preservado para comparação |
| iPhone | `C:\Users\aless\Ninho-iOS` | SwiftUI |
| Web | `C:\Users\aless\WebstormProjects\Ninho-Web` | React estático |
| Android | `C:\Users\aless\StudioProjects\Ninho-Android` | Kotlin/Compose |

Os formatos de dados entre plataformas ainda não constituem um protocolo de sincronização comum. Arquivos pessoais, materiais importados, backups, pesos de modelos, saídas de compilação e credenciais não devem ser versionados.
