# Ninho

Seu espaço de estudos para Windows 11. A Íris, sua coruja, ajuda a organizar o próximo passo.

## Comece por aqui

1. Abra **Ninho.exe** na pasta `release/win-unpacked`, ou o arquivo portátil **Ninho-1.0.0.exe** em `release`.
2. Em **Hoje**, escolha uma aula ou comece um tempo de foco. O cronômetro continua enquanto você navega pelo Ninho.
3. Em **Meus estudos**, encontre sua matéria, abra a aula do Estratégia e registre o que estudou. Guarde anotações, anexe arquivos e crie cartões sobre o que precisa lembrar.
4. Em **Revisões**, tente responder antes de revelar a resposta. Escolha a avaliação que representa sua lembrança. O aplicativo agenda o próximo encontro com aquele cartão.
5. Em **Agenda**, cadastre as datas reais das suas provas e pequenas tarefas de preparação.
6. Em **Minha assistente**, pergunte à Íris por onde começar e veja o que seus registros mostram em cada matéria.

O início vem sem aulas concluídas, provas inventadas ou tempo de estudo fictício. O acompanhamento começa com seus registros.

## O que já está organizado

- Catálogo de **20 cursos e 271 aulas ou materiais extras** do Estratégia, incluindo as matérias que não são de TI, mapeado em 14/09/2026.
- **14 matérias de concurso** e um espaço inicial de Ciência da Computação para a Mauá. Você pode acrescentar outras matérias, cursos e aulas.
- **71 cartões iniciais**, preparados a partir de dois PDFs consultados: Banco de dados, aula 00, e Literatura, aula 00. O restante do catálogo não foi convertido automaticamente em cartões.
- Metas e cronômetro ajustáveis. O padrão é 30 minutos de estudo por dia, foco de 25 minutos, pausa de 5 minutos e até 5 cartões novos por dia.

Os links de cursos e aulas abrem no navegador padrão, usando o acesso que você já tem ao Estratégia. O catálogo e o progresso ficam no Ninho. Não há sincronização automática com o Estratégia, acesso às suas credenciais ou atualização automática do catálogo.

## Acompanhamento com a Íris

A Íris é um assistente local baseado em regras e nos dados do aplicativo. Não usa um serviço de IA generativa, não lê o conteúdo dos PDFs e não pesquisa a internet.

Ela observa cartões praticados, esquecimentos registrados, revisões previstas, aulas concluídas, tempo de foco, dúvidas marcadas e proximidade das provas. Mostra explicações e oferece ações para começar.

- **Ainda sem evidência:** faltam registros para observar seu estudo.
- **Construindo base / Em consolidação / Em dia:** retratos do histórico dos cartões, com indicação da quantidade de evidência disponível.
- **Revisão necessária:** há revisões previstas ou conteúdo marcado para reaprender.
- **Conferir fonte:** você marcou material que merece checagem no original.

Cobertura indica quantos cartões você praticou. Não é uma porcentagem de domínio da matéria, nota estimada ou previsão de aprovação. Uma revisão atrasada não significa que o conteúdo factual mudou. Para leis, editais ou tecnologias, consulte a fonte e use a marcação de conferência.

Perguntas úteis: “o que estudar hoje?”, “meu nível em Literatura”, “onde preciso melhorar?”, “minhas provas”, “quanto tempo estudei?” e “o que pode estar desatualizado?”.

## Seus materiais

Importe PDF, PNG, JPG, WEBP, TXT, Markdown, DOCX, PPTX e XLSX, com até 100 MB por arquivo. O Ninho guarda uma cópia e mantém o original intacto. PDFs, imagens e textos têm prévia; documentos de escritório abrem pelo programa padrão do Windows.

Você pode vincular cada arquivo a uma matéria ou aula e guardar anotações. Remover um item tira o material da biblioteca ativa. Os originais permanecem intactos; cópias locais podem ser mantidas para permitir a recuperação da coleção anterior.

## Revisões e foco

- Espaço revela a resposta; teclas **1 a 4** registram a avaliação.
- **Não lembrei** traz o cartão de volta mais cedo; as demais avaliações ajustam o intervalo conforme o histórico.
- O limite diário vale para cartões novos em todas as matérias. Revisões já previstas continuam disponíveis.
- Pause um cartão quando quiser tirá-lo da fila. Ele permanece no acervo.
- O cronômetro permite pausar, retomar, reiniciar e concluir antes do fim. Só o tempo de foco concluído entra no progresso; pausas não contam.
- Ao reabrir o aplicativo, um cronômetro recuperado fica pausado para você decidir quando continuar.

## Dados, aparência e backup

Em **Ajustes**, altere nome, metas, duração das sessões, tema claro/escuro/sistema, som e animações. As preferências são aplicadas ao salvar.

Os dados ficam em `%APPDATA%\Ninho`, separados da pasta do programa. O aplicativo funciona sem servidor e não envia seus materiais a terceiros. A pasta exata aparece nos Ajustes.

**Exportar backup** cria um ZIP com seus dados e anexos. **Restaurar backup** verifica o arquivo e pede confirmação antes de substituir a coleção. A coleção anterior recebe uma cópia de segurança. Faça exportações periódicas para um local de sua escolha.

## Desenvolvimento

Código em `C:\Users\aless\Ninho`.

- TypeScript, React e CSS para o aplicativo; Electron para o ambiente Windows e arquivos locais.
- Validação de dados com Zod, armazenamento atômico e bridge restrita entre interface e sistema.
- Vitest para testes de lógica e componentes; Playwright com Electron para fluxos completos em perfis temporários.

```powershell
npm install
npm run build
npm test
npm run test:coverage
npm run test:e2e
npm run package
npm run dist
```

Os resultados da validação da entrega ficam em `VALIDACAO.md`. Os dados de teste nunca devem ser usados como progresso pessoal.
