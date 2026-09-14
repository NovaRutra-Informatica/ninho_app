# Íris com IA local — validação da versão 1.1

Verificado em 14/09/2026. A validação usou registros iniciais sintéticos do Ninho; não leu PDFs, vídeos, conversas privadas ou credenciais.

## Modelo e ambiente

- LM Studio instalado em `D:/Program Files/LM Studio`; CLI em `%USERPROFILE%/.lmstudio/bin/lms.exe`.
- Modelo baixado: **Qwen3-4B-Instruct-2507, GGUF Q4_K_M**, identificador `qwen3-4b-instruct-2507`, arquivo de **2.497.280.448 bytes** (aproximadamente 2,50 GB).
- GPU identificada: NVIDIA GeForce RTX 5080, **16.303 MiB** reportados pelo `nvidia-smi`. A máquina também tem GPU integrada.
- Os modelos maiores já presentes, de 30B, 32B e 80B, não foram carregados, alterados nem removidos.
- Não foi feita uma medição isolada do consumo de VRAM do modelo. O tamanho do arquivo não representa o total de memória usado durante a inferência.

## Fluxo real executado

1. Antes do teste, `/api/v1/models` e `lms ps --json` indicavam **nenhum modelo carregado**.
2. Primeiro pedido: sugerir um primeiro passo para estudar para o Senado, usando os registros iniciais. Tempo observado, incluindo carregar o modelo: **13.273 ms**.
3. Segundo pedido na mesma conversa: explicar chave estrangeira com um exemplo curto. Tempo observado: **1.089 ms**. O modelo respondeu em português, com exemplo de alunos, turmas e integridade referencial.
4. `aiUnload` descarregou a instância criada pelo Ninho. A consulta seguinte mostrou `ownedModel: null`, todos os modelos com `loaded: false` e `lms ps --json` retornou `[]`.

São duas observações de execução, não uma promessa de desempenho. Outros aplicativos, contexto e tamanho da resposta alteram a latência. Não foi feito teste cronometrado real de cinco minutos; o TTL configurado em 300 segundos e o temporizador do Ninho foram verificados em testes automatizados.

## Comportamento implementado

- `aiStatus` consulta o servidor; se ele estiver desligado, pode listar modelos baixados pela CLI. **Consultar status não carrega modelos.**
- O primeiro envio inicia o servidor em `127.0.0.1:1234` quando necessário e carrega um modelo compatível. O endpoint é fixo, local e não admite redirecionamentos, nuvem ou credenciais.
- Modelos sem metadados confirmados, acima de 8B ou acima de 6 GiB são bloqueados.
- Cada carregamento próprio recebe identificador exclusivo `ninho-iris-UUID`, contexto de 8.192 tokens, uma geração simultânea e TTL de 300 segundos. A CLI escolhe automaticamente a distribuição de memória.
- Modelos que já estavam abertos pelo usuário podem ser reutilizados. **Liberar memória nunca descarrega essas instâncias externas.**
- Pedidos têm prazo total de três minutos, cancelamento por identificador e limite de resposta. A aplicação permite apenas um pedido simultâneo. Cancelar tenta liberar a instância própria; o TTL continua sendo a proteção contra encerramento abrupto.
- A conversa transmite um resumo parcial dos registros locais e até 8.000 caracteres de histórico recente para o servidor local. O contexto é JSON válido, limitado por campos, com até 6.500 caracteres; o histórico antigo é descartado primeiro. Não há leitura automática dos materiais.
- Na versão 1.1.1, esse resumo inclui até oito aulas com mais tempo registrado, identificadas por programa, matéria, módulo e aula, com minutos e sessões concluídas. O filtro de matéria é respeitado; tempo dedicado não equivale a aula concluída ou domínio do conteúdo. Essa ampliação foi verificada nos testes automatizados; as latências acima correspondem às duas execuções reais da integração 1.1.0.
- O modelo não recebe ferramentas e não pode alterar registros, executar comandos ou acessar arquivos. As respostas são renderizadas como texto React, com suporte restrito a negrito e código; HTML e links não são executados.
- Os indicadores de revisões, dificuldades e fontes continuam calculados deterministicamente. A conversa com IA pode cometer erros e não mede domínio, nota ou desatualização por conta própria.

## Testes automatizados

`npx vitest run src/main/ai.test.ts src/renderer/AiChat.test.tsx`

Cobrem consulta sem carregamento, catálogo leve, rejeição dos modelos grandes, contexto real e parcial, servidor desligado, carregamento próprio, reutilização externa, TTL, descarregamento, isolamento E2E, limites de entrada e saída, autenticação não suportada, cancelamento, pedido simultâneo, prazo, erro sem perda da pergunta, continuidade da conversa, sugestões, limpeza do histórico e renderização segura.

Os testes não carregam modelos reais nem dependem da rede. O E2E separado utiliza servidor simulado e diretório de dados isolado.

## Referências oficiais

- [REST API do LM Studio](https://lmstudio.ai/docs/developer/rest), [lista de modelos](https://lmstudio.ai/docs/developer/rest/list) e [descarregamento de instâncias](https://lmstudio.ai/docs/developer/rest/unload).
- [CLI: carregar modelos com identificador e TTL](https://lmstudio.ai/docs/cli/local-models/load) e [iniciar servidor local](https://lmstudio.ai/docs/cli/serve/server-start).
- [TTL e descarregamento automático](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict).
- [Modelo original Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) e [quantização GGUF da comunidade LM Studio](https://huggingface.co/lmstudio-community/Qwen3-4B-Instruct-2507-GGUF/tree/main).
