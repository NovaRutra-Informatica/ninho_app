# Validação do Ninho 1.0.0

Executada em 14/09/2026, no Windows 11 x64.

## Resultados

| Verificação | Resultado |
| --- | --- |
| TypeScript e compilação de produção | Aprovados |
| Vitest: domínio, armazenamento, segurança e componentes | 246 testes aprovados em 10 arquivos |
| Playwright com Electron: fluxos completos | 18 testes aprovados |
| Executável empacotado | Abertura e navegação pelas 8 áreas aprovadas |
| Persistência no executável | Preferências recuperadas após encerrar e reabrir |
| Aparência | Claro, escuro e janela mínima de 1100 × 720 conferidos |
| Erros JavaScript nas execuções completas | Nenhuma exceção não tratada |
| Dependências (`npm audit`) | Zero vulnerabilidades reportadas |
| Geração portátil do Windows | Aprovada; Ninho-1.0.0.exe, aproximadamente 100 MB |

Os testes usaram perfis temporários. Não criaram progresso de estudo no perfil pessoal, nem alteraram o Anki ou a plataforma Estratégia.

## Funcionalidades exercitadas

- Catálogo completo mapeado, incluindo matérias fora de TI; busca e filtros.
- Cadastro e edição de matéria, curso e aula, preservando IDs, vínculos, notas e situação da aula.
- Quatro avaliações de revisão, limite global de cartões novos, filtro por matéria, cartões novos imediatamente disponíveis, edição, exclusão, suspensão e sinalizações.
- Prevenção de avaliações duplicadas e de resposta revelada em outro cartão.
- Importação real de PDF e TXT, cópia independente do original, prévias, anotações, troca de matéria, abertura externa e remoção da biblioteca.
- Proteção contra prévias fora de ordem e vínculo antigo reaparecendo ao editar um material.
- Provas e tarefas: cadastro, edição, conclusão, reabertura, exclusão, calendário e resumo na tela inicial.
- Foco: iniciar, pausar, retomar, reiniciar, concluir antes do fim e concluir automaticamente. Pausas não somam tempo de estudo. Testes de recarga, erros, operações simultâneas e restauração de backup.
- Preferências e temas persistidos; contraste base real do tema escuro verificado em teste e visualmente.
- Backup com anexos, restauração, cancelamento, arquivo inválido, recuperação e preservação dos dados anteriores.
- Íris: falta de evidência, revisões vencidas, lapsos, fontes marcadas, filtros por matéria, perguntas, prioridades e abertura da aula ou cartão específico.
- Proteção de IPC, URLs e arquivos; textos de cartões são exibidos sem executar HTML ou scripts.

## Cobertura e evidências

A cobertura instrumentada abrange **regras de domínio, armazenamento e segurança**, não toda a interface nem o processo principal do Electron: **95,57% das linhas**, **91,07% das ramificações** e **98,21% das funções**. A interface é verificada por testes de componentes e fluxos completos.

- Relatório de cobertura: `coverage/index.html`.
- Relatório de fluxos: `test-results/e2e-report/index.html`.
- Capturas e resultado do executável: `test-results/packaged`.
- Critérios de aceitação: `tests/ACCEPTANCE.md`.

Na inspeção e revisão foram encontrados e corrigidos problemas de concorrência, contexto de navegação, recuperação do foco contraste escuro e posicionamento de modais sobre páginas animadas. As verificações finais foram repetidas após as correções.

## Arquivos de entrega

- `release/Ninho-1.0.0.exe`: arquivo portátil para abrir o aplicativo.
- `release/win-unpacked/Ninho.exe`: aplicativo já extraído. Mantenha os demais arquivos dessa pasta junto dele.
- `LEIA-ME.md`: início rápido, funcionamento e limites conhecidos.

SHA-256 do arquivo portátil:

```text
4D2C7039E11564868869AB41047267D89CAA27D1693A24F222E5D632E286ACC5
```

## Limites da versão

O Estratégia está integrado por catálogo e links reais, sem sincronização automática. Há 71 cartões iniciais de dois PDFs, e não cartões prontos para todas as aulas. A Íris é um assistente local baseado em regras e registros: não usa IA generativa, não lê PDFs e não identifica mudanças factuais automaticamente. O acompanhamento começa com as suas respostas e registros reais.
