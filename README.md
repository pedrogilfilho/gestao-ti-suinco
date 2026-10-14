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
| Script de importação do backup do sistema atual | a fazer |
| Telas (Next.js) | a fazer |
| Docker de produção (Caddy + Postgres + API + web) | a fazer |

O que cada teste do sistema atual vira aqui está em [`PARIDADE.md`](PARIDADE.md).

## Estrutura

```
apps/api          NestJS + Prisma (toda a regra de negócio e as permissões)
apps/web          Next.js (telas) — ainda não criado
packages/shared   permissões, esquemas zod, constantes e cálculos usados pela API e pelas telas
docker/           compose de desenvolvimento (Postgres)
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
pnpm --filter @gestao/api dev                           # API em http://localhost:3001/api
```

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

## Testes

```bash
pnpm --filter @gestao/shared test        # unitários do pacote compartilhado
pnpm --filter @gestao/api test:unit      # unitários da API
pnpm --filter @gestao/api test:e2e       # integração: sobe um Postgres próprio em container
```

Os testes de integração rodam um arquivo de cada vez, cada um com o banco limpo. O Docker Desktop precisa estar aberto.

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
