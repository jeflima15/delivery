# Arquitetura

## Fronteiras

O sistema adota um modelo de banco compartilhado com discriminador `tenantId`. A identidade administrativa e global (`AdminAccount`) e o acesso a lojas e concedido por `TenantMembership`. Clientes pertencem a exatamente uma loja.

```text
React storefront -> /api/public e /api/customer -> tenant resolver -> services -> MongoDB
React tenant admin -> /api/tenant -> session -> membership/RBAC -> services -> MongoDB
React master -> /api/master -> session + platform role + MFA -> platform services -> MongoDB
Uploads -> backend assina caminho tenants/<tenantId>/... -> Supabase Storage
```

`server/routes` contem adaptadores HTTP finos. `server/services` concentra regras financeiras, sessoes, frete, billing, auditoria e Storage. `server/repositories` oferece operacoes que exigem `tenantId`. `server/models` contem entidades globais da plataforma; modelos operacionais existentes permanecem em `src/models` durante a migracao.

## Resolucao de tenant

O slug vem da URL, e normalizado e resolvido no servidor. O cliente nunca fornece um `tenantId` confiavel. Slugs antigos geram redirect 308 pelo `SlugHistory`. Estados suspenso, cancelado e arquivado sao bloqueados antes da regra de negocio.

## Transicao do legado

`server.ts` ainda hospeda endpoints antigos para preservar o piloto. As novas rotas sao montadas primeiro e os fluxos inseguros foram encerrados explicitamente. A estrategia e strangler: migrar dados, apontar todos os clientes para rotas por slug, medir e somente depois remover o adaptador. Nao se deve adicionar regra nova ao bloco legado.

## Frontend

`App.tsx` resolve `/:slug`, `/:slug/admin`, `/master` e convites. Admin da loja e Master sao lazy-loaded. Carrinho e estado local usam chaves por slug. Nao ha token de autenticacao em `localStorage`.

## Decisoes

Veja os ADRs em `docs/adr`. MongoDB, Express, Vite, Vercel e Supabase foram preservados. Multi-dominio, impersonation e um provedor de billing real nao fazem parte desta fase.
