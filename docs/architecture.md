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

`App.tsx` e um roteador leve que separa quatro contextos sem montar a vitrine por baixo das demais telas:

```text
/                  -> landing estatica da plataforma
/:slug             -> vitrine da loja
/:slug/admin       -> painel administrativo completo da loja
/master/*          -> painel global da plataforma
/invite/:token     -> aceite de convite
```

`/admin` existe somente como compatibilidade e redireciona para `/${VITE_DEFAULT_TENANT_SLUG}/admin`, preservando query string e hash. A URL canonica do painel piloto e `/loja-piloto/admin`. Landing, Admin da loja e Master sao lazy-loaded. A landing nao cria carrinho, sessao de cliente ou requisicoes de storefront. Carrinho e estado local usam chaves por slug. Nao ha token de autenticacao em `localStorage`.

### Jornada universal do cliente

Toda vitrine `/:slug` usa a mesma camada em `src/features/customer`. `customerApi(slug)` e o unico adaptador para autenticacao, perfil, enderecos, cupons, fidelidade, pedidos e rastreio; ele nunca usa fallback para rotas globais legadas. `useCustomerSession(slug)` e a fonte da sessao visual e da intencao pendente. O modal phone-first identifica o proximo passo, mas somente login ou cadastro concluidos liberam recursos privados.

O servidor resolve o tenant antes da autenticacao. A sessao HttpOnly inclui o tenant, e toda operacao privada confirma `{ accountType: customer, tenantId, accountId }`. Assim, o mesmo telefone pode representar contas independentes em lojas diferentes, enquanto cookies de uma loja nao autorizam leituras na outra.

Pedidos sao sempre recalculados por `createAuthoritativeOrder`. Nome, telefone e `usuarioId` vem da conta autenticada; produtos, adicionais, cupom, frete, estoque e fidelidade vem do banco. O navegador envia somente escolhas. O pedido guarda snapshot do endereco, valores em centavos e tracking token opaco. Historico privado consulta `{ tenantId, usuarioId }`; rastreio publico nao retorna PII.

```text
/:slug -> catalogo publico -> cart:<slug>
       -> identify -> login | register -> cookie HttpOnly + CSRF
       -> entrega -> fidelidade -> pagamento -> confirmacao
       -> POST /api/customer/stores/:slug/orders
       -> historico privado | rastreio publico opaco
```

### Admin da loja

O painel aprovado foi mantido como uma interface unica. `TenantAdminDashboard` fornece o slug e `TenantAdminProvider`; `AdminDashboard`, `AdminLayout` e as paginas operacionais continuam sendo a fonte visual. `createTenantAdminApi(slug)` e o unico adaptador HTTP e aponta todas as consultas e mutacoes para `/api/tenant/stores/:slug/*`.

O servidor resolve o tenant pelo slug, valida sessao, membership e permissao antes de executar handlers de dashboard, pedidos, produtos, categorias/estrutura, configuracoes, blocos da home, clientes, cupons, auditoria e uploads. Queries operacionais sempre incluem `tenantId`. O painel tenant nao possui fallback para `/api/admin/*`.

### Admin Master

O Master possui roteamento interno isolado por History API, sem migrar a vitrine para outra biblioteca. O shell responsivo divide sidebar, topbar, busca global e paginas lazy-loaded. Contratos TypeScript ficam em `src/components/master/types.ts`; chamadas protegidas ficam em `src/components/master/api.ts`. Preferencias visuais, como sidebar recolhida e periodo selecionado, usam `localStorage`; configuracoes globais de negocio usam `MasterSettings` no MongoDB.

As paginas de dashboard, lojas, planos, assinaturas, financeiro, acessos, relatorios, atividades e configuracoes consomem somente dados agregados pelo servidor. GMV das lojas e receita SaaS sao dominios distintos. Billing continua manual.

## Decisoes

Veja os ADRs em `docs/adr`. MongoDB, Express, Vite, Vercel e Supabase foram preservados. Multi-dominio, impersonation e um provedor de billing real nao fazem parte desta fase.

## Endpoints legados

Os endpoints `/api/admin/*` ainda existem temporariamente apenas para consumidores antigos confirmados. Eles nao sao usados por `/loja-piloto/admin`, nao recebem novas regras e podem ser removidos depois de uma janela de observacao em producao. O contrato canonico do lojista esta em `docs/openapi.yaml` sob `/api/tenant/stores/{slug}`.
