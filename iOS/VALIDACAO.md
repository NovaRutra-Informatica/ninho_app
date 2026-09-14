# Validação do Ninho para iPhone

Data: 14/09/2026. Ambiente disponível: Windows 11, Docker Linux e Swift 6.2.4. Não havia Mac, Xcode, simulador iOS ou iPhone acessível às ferramentas desta tarefa.

## Executado

| Verificação | Resultado |
| --- | --- |
| Compilação do pacote NinhoCore, incluindo persistência e ZIP | Aprovada em Swift/Linux |
| Suíte integrada do núcleo | **94 testes, 0 falhas** |
| Cobertura de linhas do núcleo | **95,35% — 1.578 de 1.655 linhas** |
| Regras de estudo e compatibilidade do catálogo JSON | 27 testes aprovados |
| Contexto, disponibilidade e ciclo de conversa da assistente | 22 testes aprovados com clientes de teste explicitamente simulados |
| Foco por instantes, pausa, retomada e confirmação de sessão | 16 testes aprovados |
| Biblioteca, PDFs, integridade, ZIP e recuperação | 23 testes aprovados |
| Geração dos sons e seleção de eventos | 6 testes aprovados |
| Backup Windows → Swift → Windows | Estado semanticamente idêntico e PDF byte a byte igual |
| Projeto Xcode | Arquivo PBX validado como OpenStep/plist e scheme compartilhado incluído |
| Estrutura do projeto e scripts | 13 verificações Python aprovadas; scripts Bash com sintaxe válida |
| Ícone | Vetor original renderizado, 1024 × 1024, PNG RGB opaco; conferido visualmente |

A cobertura acima exclui dependências, testes, SwiftUI, UIKit, PDFKit, AVKit e FoundationModels. Não é uma medida de validação das telas nem prova de ausência de erros.

Os testes da biblioteca usam cópia real de arquivos, PDFs sintéticos de vários megabytes, diretórios temporários, ZIPs adulterados, SHA-256 e CRC. Conferem isolamento por aula, duplicação, recuperação de arquivos ausentes/danificados, referências inválidas, rejeição de links/caminhos, rollback de importação e preservação de dados anteriores ao restaurar. A interoperabilidade usou as funções reais `writeBackupFile` e `readBackupFile` da versão Windows.

Os testes de IA conferem limites, contexto derivado dos registros, cancelamento, respostas atrasadas, novas tentativas e indisponibilidade. Eles não executaram um modelo generativo da Apple no Linux. Os testes de áudio verificam WAVs e eventos; respeitar o modo silencioso depende ainda da verificação no aparelho.

Relatórios locais: `TestResults/SwiftCore-final.log`, `SwiftCore-final.xml`, `SwiftCore-coverage.json` e `SwiftCore-coverage-summary.json`. O XML dos 94 testes foi convertido do log observado: SwiftPM aceitou `--xunit-output`, mas não gerou o XML XCTest nessa execução. Os arquivos separados com sufixo `swift-testing.xml` correspondem ao runner Swift Testing sem testes e não são contados como a suíte XCTest.

## Implementado, ainda não executado com SDK Apple

Os targets `NinhoTests` e `NinhoUITests` estão ligados ao scheme do aplicativo. Há **15 testes nativos e 20 de interface escritos, ainda não executados**. Incluem integração com biblioteca real, PDFKit, sons nativos, recuperação do cronômetro e fluxos de criação/edição, revisões, agenda, materiais, ajustes e navegação. As regressões acrescentadas preservam rascunhos ao voltar do PDF/foco, atualizam revisões com o tempo e recuperam o cronômetro sem bloquear os estudos. O monitor de foco funciona fora da tela de cronômetro, adia a conclusão enquanto outra gravação ocupa a biblioteca e mantém a sessão pendente se a gravação falhar. Os perfis são temporários, separados dos dados pessoais. A análise de sintaxe Swift desses arquivos não substitui compilação nem execução no SDK Apple.

Faltam executar num Mac:

1. Resolução final no Xcode e compilação do aplicativo com o SDK iOS.
2. XCTest e XCUITest no simulador de iPhone 15 Pro Max, com revisão das capturas.
3. Assinatura/provisionamento e instalação no iPhone físico.
4. Geração real pela Íris, cancelamento, disponibilidade/idioma e comportamento de memória no aparelho.
5. Reprodução dos sons com volume normal e modo silencioso, coexistência com áudio/vídeo e qualidade percebida.
6. Importação pelo aplicativo Arquivos/iCloud, compartilhamento, codecs, texto ampliado e transições no dispositivo.

Os comandos e requisitos estão em [LEIA-ME.md](LEIA-ME.md). Não foi criado ou apresentado um IPA como se tivesse sido compilado ou testado. Nenhum workflow de nuvem foi publicado ou executado.

## PDFs pessoais

O usuário assumiu os downloads do Estratégia. As pastas de 14 matérias e 271 aulas/extras foram criadas em Downloads, sem preencher ou modificar os materiais. O pacote iOS contém o catálogo e documentos sintéticos de teste; não inclui a coleção inteira de PDFs do Estratégia. A futura importação usará a pasta informada pelo usuário.
