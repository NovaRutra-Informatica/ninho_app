# Ninho

Seu espaço de estudos para Windows 11. A Íris, sua coruja, ajuda a organizar o próximo passo.

## Comece por aqui

1. Abra **Ninho** pelo atalho na área de trabalho ou pelo menu Iniciar. A instalação fica em `C:\Users\aless\AppData\Local\Programs\Ninho`.
2. Em **Hoje**, clique na data para abrir o calendário, escolha uma aula ou comece um tempo de foco. O cronômetro continua enquanto você navega pelo Ninho.
3. Em **Meus estudos**, abra seu curso (Senado Federal, Mauá ou um curso criado por você), encontre sua matéria, abra a aula do Estratégia e registre o que estudou. Guarde anotações, anexe arquivos e crie cartões sobre o que precisa lembrar.
4. Em **Revisões**, tente responder antes de revelar a resposta. Escolha a avaliação que representa sua lembrança. O aplicativo agenda o próximo encontro com aquele cartão.
5. Em **Agenda**, cadastre as datas reais das suas provas e pequenas tarefas de preparação.
6. Em **Minha assistente**, pergunte à Íris por onde começar e veja o que seus registros mostram em cada matéria.

O início vem sem aulas concluídas, provas inventadas ou tempo de estudo fictício. O acompanhamento começa com seus registros.

## O que já está organizado

- Catálogo de **20 módulos e 271 aulas ou materiais extras** do Estratégia, incluindo as matérias que não são de TI, mapeado em 14/09/2026.
- **14 matérias de concurso** e um espaço inicial de Ciência da Computação para a Mauá. Você pode acrescentar cursos, matérias, módulos e aulas.
- **71 cartões iniciais**, preparados a partir de dois PDFs consultados: Banco de dados, aula 00, e Literatura, aula 00. O restante do catálogo não foi convertido automaticamente em cartões.
- Metas e cronômetro ajustáveis. O padrão é 30 minutos de estudo por dia, foco de 25 minutos, pausa de 5 minutos e até 5 cartões novos por dia.

**PDFs disponíveis nesta atualização:** Banco de dados aula 00 e Literatura aula 00, guardados nas respectivas aulas. A coleta dos demais documentos está pendente; consulte `PENDENCIAS-ESTRATEGIA.md`.

Os links de cursos e aulas abrem no navegador padrão, usando o acesso que você já tem ao Estratégia. O catálogo e o progresso ficam no Ninho. Não há sincronização automática com o Estratégia, acesso às suas credenciais ou atualização automática do catálogo.

## Acompanhamento com a Íris

A Íris combina o acompanhamento dos seus registros com uma conversa de IA generativa pelo LM Studio. O modelo preparado é **Qwen3-4B-Instruct-2507 Q4_K_M**, de aproximadamente 2,5 GB em disco. Ele é carregado quando você envia uma mensagem, com contexto de 8.192 tokens e uma solicitação por vez. Abrir o Ninho não carrega o modelo.

Abra **Minha assistente**, escolha o modelo leve e escreva sua mensagem. **Ctrl + Enter** também envia. Você pode interromper uma resposta, começar uma nova conversa ou liberar a memória. A instância criada pelo Ninho sai da memória após cinco minutos sem uso. Modelos abertos por você em outros aplicativos não são descarregados pelo Ninho.

A conexão usa somente `127.0.0.1:1234` no próprio computador. A Íris recebe um resumo dos seus registros e o texto da conversa; não lê automaticamente PDFs ou vídeos, não pesquisa a internet e não altera cadastros por conta própria. Cole um trecho para pedir explicações ou exercícios. O diagnóstico e os atalhos continuam funcionando quando o LM Studio está indisponível.

Ela observa cartões praticados, esquecimentos registrados, revisões previstas, aulas concluídas, tempo de foco, dúvidas marcadas e proximidade das provas. Mostra explicações e oferece ações para começar.

- **Ainda sem evidência:** faltam registros para observar seu estudo.
- **Construindo base / Em consolidação / Em dia:** retratos do histórico dos cartões, com indicação da quantidade de evidência disponível.
- **Revisão necessária:** há revisões previstas ou conteúdo marcado para reaprender.
- **Conferir fonte:** você marcou material que merece checagem no original.

Cobertura indica quantos cartões você praticou. Não é uma porcentagem de domínio da matéria, nota estimada ou previsão de aprovação. Uma revisão atrasada não significa que o conteúdo factual mudou. Para leis, editais ou tecnologias, consulte a fonte e use a marcação de conferência.

Perguntas úteis: “o que estudar hoje?”, “meu nível em Literatura”, “onde preciso melhorar?”, “minhas provas”, “quanto tempo estudei?” e “o que pode estar desatualizado?”.

## Seus materiais

Abra **Meus estudos → curso → matéria** e clique em **Materiais** na linha da aula. A seção **Materiais desta aula** mostra seus anexos; **Adicionar arquivos à aula** já vincula o arquivo àquela aula. O botão da linha informa quantos arquivos estão ali.

A aba **Materiais** da matéria reúne os arquivos de todas as suas aulas e os materiais gerais. A área Materiais do menu reúne a biblioteca inteira. Para organizar um arquivo já importado, abra sua prévia, escolha **Matéria** e **Aula do material** e clique em **Salvar material**. **Sem aula específica** mantém o arquivo somente na matéria; trocar a matéria limpa a aula anterior para você escolher o novo vínculo.

Importe PDF, PNG, JPG, WEBP, TXT, Markdown, DOCX, PPTX e XLSX, com até 100 MB por arquivo. Também é possível importar vídeos MP4, WebM, MOV e MKV e áudios MP3, WAV, OGG, M4A, AAC e FLAC, com até 2 GB por arquivo. Vídeos e áudios são copiados em partes para manter o consumo de memória controlado e abrem no player padrão do Windows. O Ninho guarda uma cópia e mantém o original intacto. PDFs, imagens e textos têm prévia; documentos de escritório abrem pelo programa padrão do Windows.

Você pode vincular cada arquivo a uma matéria ou aula e guardar anotações. Remover um item tira o material da biblioteca ativa. Os originais permanecem intactos; cópias locais podem ser mantidas para permitir a recuperação da coleção anterior.

## Revisões e foco

- Espaço revela a resposta; teclas **1 a 4** registram a avaliação.
- **Não lembrei** traz o cartão de volta mais cedo; as demais avaliações ajustam o intervalo conforme o histórico.
- O limite diário vale para cartões novos em todas as matérias. Revisões já previstas continuam disponíveis.
- Pause um cartão quando quiser tirá-lo da fila. Ele permanece no acervo.
- O cronômetro permite pausar, retomar, reiniciar e concluir antes do fim. Só o tempo de foco concluído entra no progresso; pausas não contam.
- Ao reabrir o aplicativo, um cronômetro recuperado fica pausado para você decidir quando continuar.

### Tempo dedicado a cada aula

Em **Meus estudos → curso → matéria**, clique em **Cronometrar** na linha da aula. O foco fica vinculado àquela aula. Você pode navegar pelo aplicativo enquanto o tempo corre e voltar ao cronômetro pelo menu lateral.

Conclua a sessão para guardar o tempo, mesmo que termine antes do tempo previsto. O total fica visível na própria aula; registrar tempo não marca a aula como concluída. Pausas não entram nessa soma. Quando já existe uma sessão em andamento ou pausada, seu vínculo é mantido para evitar que os minutos sejam atribuídos à aula errada. **Reiniciar** descarta o tempo da sessão que ainda não foi salvo.

## Dados, aparência e backup

Em **Ajustes**, altere nome, metas, duração das sessões, tema claro/escuro/sistema, som e animações. As preferências são aplicadas ao salvar.

Os dados ficam em `%APPDATA%\Ninho`, separados da pasta do programa. O aplicativo funciona localmente; somente a conversa de IA precisa do servidor local do LM Studio. Seus materiais não são enviados a terceiros. A pasta exata aparece nos Ajustes.

**Exportar backup** cria um ZIP com seus dados e anexos. **Restaurar backup** verifica o arquivo e pede confirmação antes de substituir a coleção. A coleção anterior recebe uma cópia de segurança. O backup processa arquivos em partes, aceita ZIP/ZIP64 com até 20 GB e 5.000 anexos e preserva compatibilidade com backups da versão anterior. Faça exportações periódicas para um local de sua escolha.

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
npm run installer
```

Os resultados da validação da entrega ficam em `VALIDACAO.md`. Os dados de teste nunca devem ser usados como progresso pessoal.

## Instalação no Windows

O instalador desta atualização fica em `C:\Users\aless\Ninho\release\Ninho-Setup-1.1.3.exe`. Ele instala o aplicativo para seu usuário, com ícone da coruja, atalho na área de trabalho, entrada no menu Iniciar e desinstalador em **Configurações → Aplicativos → Aplicativos instalados**. A instalação não exige privilégios de administrador.

Os estudos ficam em `%APPDATA%\Ninho`, separados dos arquivos do programa, e são preservados ao atualizar ou desinstalar. Antes da migração foram criadas cópias de segurança na subpasta `backups`. Para o uso diário, utilize o atalho da versão instalada.
