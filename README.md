# Ninho para Windows

Aplicativo de estudos para Windows 11 em Electron, React e TypeScript. Este repositório contém a versão Windows; o aplicativo instalado e os dados pessoais continuam nos seus locais atuais.

## Ambiente

```powershell
npm ci
npm run build
npm test
npm start
```

Para desenvolvimento, execute `npm run dev` e use as orientações de [LEIA-ME.md](LEIA-ME.md). O Node.js e as dependências locais já estão disponíveis neste computador. `package-lock.json` deve ser versionado; `node_modules`, pacotes gerados, relatórios, segredos e coleções pessoais estão no `.gitignore`.

Depois da separação dos repositórios, `npm run build` passou novamente, incluindo a verificação TypeScript. O aviso existente sobre o tamanho do bundle não impede a compilação.

## Repositórios independentes

As pastas ficam lado a lado dentro da pasta do usuário:

| Versão  | Pasta           | Estado                                             |
| ------- | --------------- | -------------------------------------------------- |
| Windows | `Ninho`         | Aplicativo existente                               |
| iPhone  | `Ninho-iOS`     | Projeto Swift existente; build iOS exige Mac/Xcode |
| Web     | `Ninho-Web`     | Ambiente inicial preparado                         |
| Android | `Ninho-Android` | Ambiente inicial preparado                         |

Cada pasta possui seu próprio `.git`. A separação preserva o histórico existente do Windows; a saída dos arquivos iOS aparece como remoção neste repositório, pois agora ficam no repositório próprio. Não foi criado commit nem preparado o staging durante esta separação. Não há remote configurado automaticamente.

Depois de revisar, execute em cada pasta:

```powershell
git status
git add .
git commit -m "Prepara projeto Ninho"
```

O catálogo e os documentos sintéticos usados nos testes são fontes do projeto. PDFs pessoais, backups de estudo, credenciais e chaves de assinatura não devem ser adicionados ao Git. Resultados anteriores estão em [VALIDACAO.md](VALIDACAO.md).

A verificação de segurança da versão 1.1.5 está em [SEGURANCA.md](SEGURANCA.md), com resultados do npm, revisão do Electron/Chromium, correção da política de conteúdo e limites conhecidos. A configuração local do Dependabot prepara consultas semanais; não houve publicação nem ativação de serviços no GitHub. O pacote 1.1.5 está preparado, e a instalação pessoal permanece na versão 1.1.4.
