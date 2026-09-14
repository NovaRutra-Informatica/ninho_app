# Trabalho no Ninho

O Ninho é um aplicativo pessoal para Windows 11. Preserve os estudos e os arquivos do usuário.

## Testes acompanham o comportamento

- Cada funcionalidade nova deve incluir testes de seus comportamentos relevantes, inclusive falhas e persistência quando aplicável.
- Cada correção deve incluir uma regressão que reproduza a causa do problema. Não simule o componente que causou o erro para obter um resultado positivo.
- Use Vitest para lógica e componentes e Playwright com Electron para integração de interface, IPC, arquivos e persistência. Os diálogos e o lançamento de outros aplicativos podem ser controlados; registre esse limite.
- Os testes usam perfis temporários próprios. Nunca grave dados de teste, aulas concluídas, sessões ou cartões no perfil pessoal.
- Caminhos Windows podem ser virtuais. Mantenha as regressões de AppData, junctions, nomes internos, links e identidade de arquivo. Se o ambiente não oferecer virtualização MSIX, registre o cenário correspondente como não executado, sem apresentá-lo como aprovado.
- Para prévias de PDF, confira o conteúdo desenhado, não apenas a presença do iframe ou dos controles. Inclua um PDF pequeno e outro de vários megabytes, além da liberação das referências temporárias ao fechar ou trocar o arquivo.
- Execute os testes afetados e `npm run build`. Mudanças que atravessam armazenamento, IPC e interface exigem a suíte completa de integração. Repita testes após novas alterações ou falhas relevantes.
- Antes de entregar uma atualização instalada, confira o executável com `scripts/verify-installation.ps1` e o teste em perfil isolado de `scripts/smoke-packaged.mjs`. Confirme também o fluxo real relatado pelo usuário quando houver acesso disponível.
- Atualize `VALIDACAO.md` com os resultados efetivamente obtidos, os cenários não executados e os limites da verificação. Não trate quantidade de testes como prova de ausência de todo erro possível.

Os comandos de desenvolvimento estão em `LEIA-ME.md`; os critérios de uso e as instruções de integração estão em `tests/ACCEPTANCE.md` e `tests/e2e/README.md`.
