# Mapa compartilhado

## Responsabilidade

Registrar as fronteiras que todas as areas devem respeitar. Detalhes permanecem em `docs/architecture.md`, `docs/security.md`, `docs/multi-tenancy.md`, `docs/rbac.md`, `docs/openapi.yaml` e `docs/adr/`.

## Contratos e invariantes

- Rotas de loja recebem `slug`; `server/middleware/tenant.ts` resolve o `Tenant` e deriva `tenantId`. Body, query e headers nunca sao autoridade para tenant.
- Consultas e mutacoes operacionais filtram por `tenantId` e pelo identificador do recurso. Sessao administrativa tambem exige membership ativa e permissao de `server/domain/permissions.ts`.
- Cliente, lojista e Master usam sessoes separadas em cookies HttpOnly. Mutacoes autenticadas exigem CSRF; Master exige `platform_super_admin` e MFA verificado.
- O navegador envia escolhas de compra. Catalogo, disponibilidade, estoque, cupom, frete, fidelidade e totais em centavos sao recalculados no servidor.
- Dados privados nao entram em DTOs publicos, rastreio publico, push ou logs. Uploads sao assinados pelo backend para caminho gerado por tenant.
- Master e deliberadamente global em `/api/master`; acesso a uma loja continua tenant-scoped, inclusive durante suporte por impersonacao.

## Dependencias entre areas

- `01-LANDING` encaminha para loja, login ou Master, sem montar sessao/carrinho de vitrine na raiz.
- `02-CATALOGO-VITRINE` fornece escolhas; `03-PEDIDOS-OPERACAO` revalida tudo no servidor.
- `04-LOJA-LOGISTICA` publica configuracoes consumidas pelas duas areas anteriores.
- `05-MASTER` administra a plataforma sem herdar permissoes de membership.
- `06-CORE` fornece auth, tenancy, CSRF, rate limit, Storage, auditoria, runtime e CI.

## Decisoes duraveis

- Tenant por caminho: `docs/adr/0001-tenant-paths.md`.
- Sessao em cookies: `docs/adr/0002-cookie-sessions.md`.
- Pedido autoritativo: `docs/adr/0003-authoritative-orders.md`.
- `HANDOFF.txt` e historico e pode divergir do Git atual; nao e contrato operacional.
- Identidade da aba tem um unico writer em `src/lib/browserIdentity.ts`, instalado por `PageIdentity` em `App`. Vitrine e jornada mantem nome da loja; admin usa `Painel — Nome`. Plataforma restaura seus titulos e icone. Identidade publica minima vem de `/api/public/stores/:slug/identity`, nunca de settings autenticadas ou dados privados antes do login.

## Verificacoes recomendadas

- Para qualquer rota por ID, tente o mesmo ID com outro slug e outra membership.
- Verifique 401, 403 e sucesso para cada papel afetado; valide CSRF nas mutacoes.
- Confirme que respostas publicas e logs nao incluem PII, segredos, hashes ou campos internos.
- Rode testes focados e, para mudancas transversais, `npm run verify` e os E2E relevantes quando autorizados.
