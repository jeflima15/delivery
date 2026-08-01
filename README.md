# Delivery SaaS

Plataforma de cardapio e delivery multi-tenant. Cada loja opera no mesmo dominio por um slug proprio, com vitrine, clientes, pedidos, equipe, configuracoes e arquivos isolados. A plataforma possui uma area Master separada para lojas, planos, assinaturas e faturamento.

## Stack

- React 19, Vite 6 e Tailwind CSS 4
- Express 5 e Node.js 20
- MongoDB Atlas com Mongoose
- Supabase Storage para imagens
- Vitest, Supertest e Playwright

## Rotas

- `/:slug`: vitrine da loja
- `/:slug/admin`: painel da loja
- `/master`: painel da plataforma, com MFA obrigatorio
- `/api/public/stores/:slug`: leitura publica
- `/api/customer/stores/:slug`: cliente, pedido e rastreio
- `/api/tenant/stores/:slug`: operacao autenticada da loja
- `/api/master`: operacao global da plataforma

## Desenvolvimento

Requer Node.js 20 e um MongoDB de desenvolvimento com suporte a transacoes.

```bash
npm ci
cp .env.example .env
npm run dev
```

Scripts principais:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run audit:prod
npm run verify
```

O lint novo cobre integralmente os modulos criticos multi-tenant. O monolito legado ainda esta em um adaptador temporario e sera removido por fases, conforme [arquitetura](docs/architecture.md).

## Bootstrap e migracao

O Admin Master e criado exclusivamente por CLI:

```bash
npm run bootstrap:master
```

A migracao sempre comeca em dry-run:

```bash
npm run migrate:tenant
```

A aplicacao deliberadamente nao executa migracao no startup. Leia [docs/migration.md](docs/migration.md) antes de qualquer `--apply`.

## Seguranca

Sessoes usam cookies HttpOnly, refresh rotativo armazenado como hash, CSRF e revalidacao de conta/membership. Pedidos sao recalculados no servidor, usam centavos, transacao e idempotencia. O rastreio publico usa token opaco e nao retorna PII. Leia [docs/security.md](docs/security.md).

## Producao

Antes do deploy, configure os segredos fora do repositorio, habilite um provedor OTP real, Storage server-side, rate limit distribuido e backups/PITR. Execute o checklist de [docs/operations.md](docs/operations.md). Este repositorio nao executa deploy, cobranca, envio real ou migracao real automaticamente.

## Documentacao

- [Arquitetura](docs/architecture.md)
- [Multi-tenancy](docs/multi-tenancy.md)
- [Seguranca](docs/security.md)
- [Migracao](docs/migration.md)
- [Billing](docs/billing.md)
- [RBAC](docs/rbac.md)
- [Operacao](docs/operations.md)
- [OpenAPI](docs/openapi.yaml)
