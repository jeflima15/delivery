# Core, seguranca e infraestrutura

## Responsabilidade

Manter bootstrap HTTP, banco, autenticacao compartilhada, sessoes, cookies, CSRF, tenancy, rate limits, auditoria, Storage, ambiente, Vercel, workers, CI e contratos transversais.

## Arquivos principais

- Bootstrap e rotas: `server.ts`, `server/routes/index.ts`, `vercel.json`.
- Ambiente e banco: `server/config/env.ts`, `server/db/connect.ts`, `.env.example`.
- Middlewares: `server/middleware/auth.ts`, `csrf.ts`, `tenant.ts`, `rateLimit.ts`, `requestContext.ts`, `errors.ts`, `validate.ts`.
- Servicos: `sessionService.ts`, `auditService.ts`, `storageService.ts`, `infrastructureService.ts`.
- Workers: push em `server/routes/pushWorker.ts`, `server/services/pushService.ts`, `scripts/push-worker.ts`; importacao de catalogo em `server/routes/catalogImportWorker.ts`, `server/services/catalogImportJobService.ts`, `scripts/catalog-import-worker.ts`.
- CI e operacao: `.github/workflows/ci.yml`, `docs/operations.md`, `docs/migration.md`, `docs/security.md`.

## Contratos e dependencias

- Runtime canonico atual: Node 24, conforme `package.json` e CI. As referencias antigas a Node 20 no README e na operacao foram alinhadas com essa fonte.
- Access token dura 15 minutos; refresh dura 30 dias, e armazenado como hash e rotaciona refresh e CSRF. Reuso revoga sessoes ativas da conta.
- Cookies de acesso/refresh sao HttpOnly, `Secure` em producao e `SameSite=Lax`; o cookie CSRF e legivel pelo cliente para double-submit.
- Producao exige origem da aplicacao e Upstash Redis; indisponibilidade do rate limit distribuido falha fechada.
- Service role do Supabase, chaves MFA, JWT, OTP, worker e tokens de gestao sao server-only. Variaveis `VITE_` nunca recebem segredos.
- O Storage usa `tenants/<tenantId>/<target>/<uuid>.webp`. A policy em `supabase/migrations/001_tenant_storage.sql` contem comentario historico com formato anterior e deve ser alinhada antes de aplicacao manual.
- `vercel.json` publica API e SPA, mas nao agenda push. Em serverless, um agendador externo deve chamar `/api/internal/push/run` com segredo proprio.
- `vercel.json` tambem nao agenda a importacao. Para garantir analise e cleanup apos o usuario fechar a tela, um agendador deve chamar `POST /api/internal/catalog-imports/run` com `Authorization: Bearer <CATALOG_IMPORT_WORKER_SECRET>`; o endpoint usa lease, retry e lotes limitados. Em runtime persistente, `npm run catalog-import:worker` executa o mesmo servico.

## Decisoes importantes

- Migracoes nao rodam no startup e exigem dry-run, backup e autorizacao para apply.
- Logs recebem `requestId`; auditoria remove chaves sensiveis. Nao registrar body de auth, PII completa ou credenciais.
- CI usa Node 24 e executa typecheck, lint, testes, build, auditoria de dependencias, secret scanning e E2E.
- Documentos existentes sao detalhamento; este arquivo e mapa. Divergencias devem ser resolvidas pelo codigo atual e registradas aqui ou em ADR quando duraveis.

## Verificacoes recomendadas

- Auth: rotacao/reuso de refresh, revogacao por `tokenVersion`, cookies por escopo, CSRF same-origin e MFA.
- Tenancy/RBAC: duas lojas, quatro papeis, IDs cruzados, tenant suspenso e impersonacao.
- Infra: `/health`, `/ready`, falha de Mongo/Upstash/Storage/OTP, endpoint do worker e ausencia de segredos.
- Antes de deploy: `npm run verify`, E2E relevante, diff de migrations, backup/PITR e smoke test descrito em `docs/operations.md`.
