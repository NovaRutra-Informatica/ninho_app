# Validação final do Ninho

Em 14/09/2026, a execução final de `npx playwright test` aprovou **18 de 18 cenários**, em aproximadamente 1,1 minuto. `npx tsc --noEmit` também terminou sem erros.

O aplicativo foi aberto pelo Electron 44.3.0 real no Windows, usando um perfil temporário separado em cada cenário. Os testes não alteraram o perfil pessoal do Ninho, o Anki ou o progresso do Estratégia.

Foram exercitados os fluxos de estudos e edição, cartões e agendamento, arquivos e prévias, agenda, foco, preferências, temas, assistente, backup e recuperação. A persistência foi conferida encerrando e reabrindo o processo. A integração nativa com arquivos e navegador passou pela ponte IPC real, substituindo somente as respostas dos seletores do Windows e as chamadas que abririam aplicativos externos.

A verificação visual identificou e corrigiu o posicionamento de modais dentro de elementos animados. O teste final exige que o modal do PDF fique integralmente dentro da janela, aguarda o visualizador mostrar página 1 e sua miniatura e guarda uma captura do documento carregado. O tema escuro é verificado pela cor efetivamente aplicada, além da preferência salva.

- Relatório completo: [abrir relatório](../test-results/e2e-report/index.html).
- Critérios: [plano de aceitação](ACCEPTANCE.md).
- Como repetir: [instruções dos testes](e2e/README.md).

O catálogo inicial tem 20 cursos e 271 aulas/materiais extras; os cartões preparados são 71, provenientes dos PDFs consultados. Os testes distinguem esse conteúdo do progresso pessoal. A assistente usa registros locais e sinalizações; não consulta o Estratégia nem verifica automaticamente mudanças nas fontes.
