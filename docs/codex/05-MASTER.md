# Master

## Responsabilidade

Administrar tenants, planos, assinaturas, faturas, acessos, relatorios, configuracoes globais, auditoria e visao de infraestrutura da plataforma.

## Arquivos principais

- Frontend: `src/components/MasterDashboard.tsx`, `src/components/master/MasterApp.tsx`, `MasterLayout.tsx`, `api.ts`, `types.ts`, `pages/`.
- API: `server/routes/master.ts`, `masterEnhanced.ts`, `masterInfrastructure.ts`.
- Auth e MFA: `server/routes/auth.ts`, `server/middleware/auth.ts`, `server/security/mfa.ts`.
- Dominio: `server/services/billingService.ts`, `billingStateService.ts`, `subscriptionService.ts`, `invoiceReportingService.ts`, `infrastructureService.ts`, `auditService.ts`.
- Calendario financeiro: `src/lib/masterReporting.ts`; regras e limitacoes em `docs/billing.md`.
- Modelos: `Tenant.ts`, `Plan.ts`, `Subscription.ts`, `Invoice.ts`, `MasterSettings.ts`, `ImpersonateToken.ts`.

## Dependencias e contratos

- Toda rota `/api/master` exige sessao admin, papel `platform_super_admin` e MFA verificado; mutacoes tambem exigem CSRF.
- Credencial Master nasce por CLI em `scripts/bootstrap/`; nao existe bootstrap publico.
- Billing atual e manual e separado do dinheiro dos pedidos. Valores financeiros permanecem em centavos.
- Fatura, assinatura e auditoria sao transacionais. Billing nao remove bloqueios administrativos da loja; vinculos cruzados sao recusados no servidor.
- Receita recebida usa `paidAt`; aberto/vencido usam `dueAt` no calendario de Brasilia. Situacao financeira calculada nao depende de job de vencimento nem substitui o historico persistido.
- Impersonacao esta implementada: gera token de uso unico e curto, consumido em nova sessao tenant e marcado com `impersonatedBy`. Ela nao concede acesso tenant ao cookie Master.
- A tela de infraestrutura consulta provedores apenas no servidor; tokens de gestao nunca sao retornados.

## Decisoes importantes

- Master nao herda membership nem usa rotas tenant para operacoes globais.
- Suporte por impersonacao deve permanecer visivel, limitado e auditavel; a conta impersonada ainda passa por membership/permissoes da loja.
- Exclusao/purga e operacao destrutiva e exige autorizacao explicita, mesmo quando existe rota ou script.

## Verificacoes recomendadas

- Testar login sem MFA, TOTP, recovery code de uso unico, sessao expirada e CSRF.
- Validar separacao entre cookies Master e tenant, consumo unico da impersonacao e revogacao.
- Conferir auditoria e ausencia de segredos nas respostas de infraestrutura.
- Billing: `tests/integration/masterBilling.test.ts`, `tests/unit/masterReporting.test.ts`, `tests/e2e/master-billing.spec.ts`; regressao compartilhada em `tests/integration/multiTenant.test.ts`.

## Modernizacao em andamento

Plano, entregas e pendencias: `docs/codex/MASTER-IMPLEMENTATION.md`. A primeira entrega cobre integridade da cobranca e definicoes financeiras; nao significa que limites, preco contratado, novo layout ou gateway automatico estejam implementados.
