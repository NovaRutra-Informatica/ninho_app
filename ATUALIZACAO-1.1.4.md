# Sons do Ninho 1.1.4

O Ninho passa a usar quatro pequenas melodias próprias para confirmar um registro salvo, uma revisão, uma conclusão e uma sessão de foco concluída. A pausa tem um toque de conclusão, sem registrar minutos de estudo.

Em **Ajustes → Sons do Ninho**, ative a opção e clique em **Salvar preferências**. A preferência existente é preservada. Desativá-la interrompe o áudio em andamento; abrir o aplicativo ou apenas navegar entre telas não toca sons.

Os sons são sintetizados localmente, sem arquivos de terceiros, downloads ou sons do Duolingo. Duram menos de meio segundo, com entrada e saída suaves. A repetição rápida é limitada e um toque de conclusão pode substituir um toque menor em andamento. Operações que falham não tocam uma confirmação de sucesso. O aviso antigo do cronômetro foi substituído para evitar dois sons na mesma conclusão.

O contexto de áudio só é criado ao tocar um som e fecha depois de 1,8 segundo sem novos toques. Uma tentativa de ativação bloqueada é abandonada após dois segundos. A ausência de dispositivo de áudio ou um erro de reprodução não impede salvar os estudos.

## Verificação

Os resultados desta versão estão em `VALIDACAO.md`. Os testes usam perfis temporários e não alteram estudos nem preferências pessoais. Os testes unitários abrangem cada evento, repetição, falhas, cancelamento de reprodução e liberação de recursos; os de componentes atravessam o provedor de estado e o cronômetro real.

O cenário `tests/e2e/sounds.spec.ts` aciona a interface, o IPC e a persistência reais. Usa `AudioContext`, osciladores, ganhos e analisador reais do Chromium; mede a onda antes de um ganho final silenciado. Isso verifica a geração de áudio, sem depender dos alto-falantes nem capturar o microfone. A percepção do volume e do timbre no dispositivo pessoal não é avaliada automaticamente.
