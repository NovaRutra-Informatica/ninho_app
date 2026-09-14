# Correções do Ninho 1.1.3

## PDF da aula não abria

O erro foi reproduzido no perfil pessoal e observado na janela instalada 1.1.2: `Error invoking remote method 'ninho:open-material': Error: O arquivo está fora da biblioteca.` A prévia também falhava e mostrava incorretamente a mensagem de formato externo.

Os dois PDFs estavam íntegros. O caminho lógico era `%APPDATA%\Ninho\materials`, mas o caminho físico dos arquivos estava no `LocalCache\Roaming` do pacote Windows. A pasta combinava localizações, fazendo a comparação textual entre o diretório canônico e o pai do arquivo rejeitar anexos válidos. Esse comportamento de mesclagem do AppData está descrito pela [Microsoft, em Flexible virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization).

A validação agora parte do anexo registrado, exige nome interno válido e filho direto da biblioteca, rejeita arquivos e pastas que sejam links e compara a identidade do arquivo lógico com a do arquivo canônico. Os identificadores usam `bigint` para preservar a precisão no Windows. O leitor externo recebe o caminho canônico, acessível também fora da visão virtualizada do aplicativo. Nenhum caminho de pacote é codificado no produto.

Os testes anteriores em pastas temporárias comuns não reproduziam o problema. Foram adicionadas regressões para a relação de caminhos observada, virtualização real do AppData em perfil isolado, junction de um diretório ancestral, diferenças de caixa, arquivos substituídos, links e arquivos ausentes. Apenas o lançamento de aplicativos externos é controlado nos E2E; o filesystem, a resolução e o IPC são reais. A relação específica de diretório mesclado é simulada em um teste unitário usando duas referências ao mesmo arquivo físico.

## Prévia de PDFs maiores ficava em branco

A conferência do executável instalado revelou uma segunda falha: o arquivo real de Banco de dados, com 11.629.134 bytes, abria no leitor externo, mas sua prévia no Ninho ficava branca. O mesmo documento foi reproduzido em um perfil isolado do Electron: a URL `data:` com todo o conteúdo em base64 falhou; uma URL `blob:` exibiu a capa mantendo as mesmas restrições de segurança.

Esse resultado é compatível com o limite de 2 MB de URL descrito na [documentação do Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md#url-length). No teste real, a URL anterior tinha mais de 15 milhões de caracteres; a referência `blob:` tinha 49.

A prévia passa a usar uma referência temporária ao PDF em memória, liberada ao fechar ou trocar o documento. A regressão visual usa PDFs sintéticos pequeno e de 12 MiB, com conteúdo vetorial de cores conhecidas. Ela confere pixels do conteúdo pela captura nativa da janela; iframe, controles e miniatura sozinhos não são considerados prova de renderização.

## Mensagens e recuperação de falhas

- A interface remove o envoltório técnico do Electron e mantém a explicação da falha.
- Uma prévia que falha mostra seu erro e permite tentar novamente, preservando notas e a seleção de aula. Ela não é apresentada como formato incompatível.
- Uma conexão com o LM Studio que se recupera deixa de mostrar o erro antigo. Respostas de status antigas não substituem o estado mais recente.
- A restauração de um backup íntegro funciona quando anexos da coleção atual estão ausentes ou danificados. Antes de instalar os anexos verificados sob nomes novos, o Ninho preserva o índice anterior, cria um ZIP dos anexos válidos e mantém os arquivos danificados intactos. Uma auditoria de tamanho e assinatura lê no máximo 8 KiB por anexo; erros de leitura, permissão ou gravação interrompem a operação. O aviso de recuperação só aparece após uma restauração concluída.

## Verificação

Os resultados finais, a versão instalada e os limites dos testes estão em `VALIDACAO.md`. A verificação somente de leitura dos PDFs reais está em `.cache/materials-regression-real-profile.json`: os dois arquivos produziram prévias PDF com os mesmos bytes dos originais, e `state.json` permaneceu inalterado.

Os perfis dos testes são isolados. Não foram criados registros de estudo, revisões ou progresso fictícios no perfil pessoal. A coleta dos demais PDFs do Estratégia continua documentada separadamente em `PENDENCIAS-ESTRATEGIA.md`.
