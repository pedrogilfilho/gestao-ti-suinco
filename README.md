# Gestão de TI · Suinco (reescrita)

Sistema interno da TI da Suinco: empréstimo e devolução de equipamentos, inventário, usuários e setores, acessos com perfis, auditoria e configurações. Esta é a reescrita do sistema atual (v4.3.0, em Firebase), agora em **Next.js + NestJS + PostgreSQL**.

O sistema atual continua no ar até a reescrita cobrir tudo. A migração é feita por módulos, e este repositório está no **módulo 1 (núcleo)**.

## Andamento do núcleo

| Parte | Situação |
|---|---|
| `packages/shared`: permissões, esquemas, situações e datas | pronto |
| API: login, setores, usuários, equipamentos, acessos e grupos | pronto |
| API: empréstimos e devoluções, auditoria com restaurar, configurações, busca | pronto |
| API: avisos em tempo real (Socket.IO) | pronto |
| Script de importação do backup do sistema atual | pronto |
| Telas (Next.js): base, login, menu, tema | pronto |
| Telas: Equipamentos, Usuários, Setores, Em uso, Acessos, Auditoria, Configurações, Portal, busca geral | pronto |
| Docker de produção (Caddy + Postgres + API + web) | pronto |

O que cada teste do sistema atual vira aqui está em [`PARIDADE.md`](PARIDADE.md).

## Estrutura

```
apps/api          NestJS + Prisma (toda a regra de negócio e as permissões)
apps/web          Next.js (telas)
packages/shared   permissões, esquemas zod, constantes e cálculos usados pela API e pelas telas
docker/           compose de desenvolvimento (Postgres) e de produção (Caddy, Postgres, API, web)
```

## Requisitos

- Node 22 ou mais novo
- pnpm 10
- Docker Desktop (o Postgres de desenvolvimento e os testes da API rodam em containers)

## Como rodar

```bash
pnpm install
cp .env.example .env
cp .env apps/api/.env
pnpm db:up                                              # Postgres em localhost:5434
pnpm --filter @gestao/shared build
pnpm --filter @gestao/api exec prisma migrate dev       # cria as tabelas
pnpm --filter @gestao/api seed                          # dados de exemplo (só em banco vazio)
pnpm dev                                                # API em http://localhost:3001/api e telas em http://localhost:3000
```

Abra http://localhost:3000 e entre com um dos usuários do seed abaixo.

Para apagar o banco de desenvolvimento e começar do zero: `pnpm --filter @gestao/api exec prisma migrate reset` (apaga tudo e roda o seed de novo).

**Porta do banco:** 5434. A 5432 é do Postgres instalado no Windows e a 5433 é de outro projeto.

### Usuários do seed

Senha de todos: `Teste@1234` (ou a de `SEED_SENHA` no `.env`).

| E-mail | Perfil |
|---|---|
| gerson.araujo@suinco.com.br | Administrador Master (dono) |
| tecnico.teste@suinco.com.br | Administrador TIC |
| consulta.teste@suinco.com.br | Somente consulta |
| solicitante.teste@suinco.com.br | Solicitante |

## Importar os dados do sistema atual

Usa o arquivo de **Configurações → Baixar backup completo** do sistema atual. A importação só roda num banco vazio e traz o núcleo: setores, usuários, fotos, grupos, acessos, equipamentos, empréstimos e a configuração.

```bash
pnpm --filter @gestao/api importar -- caminho/do/backup.json --ensaio   # faz tudo e desfaz: só mostra o relatório
pnpm --filter @gestao/api importar -- caminho/do/backup.json            # grava de verdade
```

- Rode sempre primeiro com `--ensaio` e leia o relatório inteiro. Ele lista o que foi criado, o que ficou de fora (com o motivo) e os avisos.
- O relatório também é salvo em `relatorio-importacao-<data>.txt`, ao lado do backup.
- Campos antigos que não têm lugar no modelo novo vão para as Observações do equipamento, com aviso.
- Ninguém recebe senha na importação, exceto os donos (`DONOS`). Eles recebem uma senha temporária que aparece só na tela e são obrigados a trocá-la no primeiro login. Os outros acessos recebem senha pela tela de Acessos.

## Testes

```bash
pnpm --filter @gestao/shared test        # unitários do pacote compartilhado
pnpm --filter @gestao/api test:unit      # unitários da API
pnpm --filter @gestao/api test:e2e       # integração: sobe um Postgres próprio em container
pnpm --filter @gestao/api typecheck      # checa os tipos de src, scripts e testes
```

Os testes de integração rodam um arquivo de cada vez, cada um com o banco limpo. O Docker Desktop precisa estar aberto.

Testes de tela (Playwright, Chromium):

```bash
pnpm --filter @gestao/web exec playwright test
```

Eles sobem sozinhos a API (porta 3101) e as telas (porta 3100) usando o banco `gestao_e2e` no mesmo Postgres de desenvolvimento (`pnpm db:up` antes). O banco é recriado com o seed a cada execução; o script se recusa a mexer em banco cujo nome não termine em `_e2e`.

## Subir em produção

Num servidor com Docker:

```bash
cp .env.example .env    # preencher PG_SENHA, JWT_SECRET, DONOS e, se houver, DOMINIO
docker compose -f docker/compose.yml up -d --build
```

O Caddy fica na frente: `/api` e `/socket.io` vão para a API e o resto para as telas. Com `DOMINIO` preenchido ele pega o certificado HTTPS sozinho; sem ele, serve HTTP na porta 80. As migrações rodam ao subir a API. Depois, importar o backup (seção acima) e entrar com o dono usando a senha temporária mostrada na importação. `docker/backup.sh` faz o backup diário do banco (guardado 30 dias); o agendamento no cron está explicado no próprio arquivo.

**Não publicar em servidor nenhum sem o pedido do Gerson.**

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão com o Postgres |
| `JWT_SECRET` | assinatura do login (mínimo 32 caracteres) |
| `DONOS` | e-mails dos donos do app, separados por vírgula: têm todas as permissões e o acesso deles é protegido |
| `ARQUIVOS_DIR` | pasta onde ficam assinaturas e fotos |
| `TZ` | fuso horário (`America/Sao_Paulo`) |
| `SEED_SENHA` | senha dos usuários do seed |

O `.env` não vai para o repositório.

## Regras importantes

- Toda alteração grava a auditoria na mesma transação: se a gravação falhar, o registro de auditoria também não fica.
- Excluir é exclusão lógica (`excluido_em`): o item some das telas e pode ser restaurado pela Auditoria.
- Quem pode o quê é decidido só na API. As telas apenas escondem os botões.
- Datas exibidas e "hoje" seguem o horário de Brasília.
