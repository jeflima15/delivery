# Loja e logistica

## Responsabilidade

Cuidar do painel tenant, equipe, configuracoes da loja, onboarding, horarios, entrega/retirada, regioes, frete, uploads da loja e notificacoes da equipe.

## Arquivos principais

- Shell e API: `src/components/TenantAdminDashboard.tsx`, `AdminLayout.tsx`, `src/components/tenant-admin/api.ts`, `TenantAdminContext.tsx`.
- Configuracao: `src/components/AdminConfig.tsx`, `src/components/tenant-admin/onboarding/`, `PreorderSettingsEditor.tsx`, `WeeklyHoursEditor.tsx`.
- Logistica: `DeliveryRegionMapEditor.tsx`, `NeighborhoodTierEditor.tsx`, `server/services/deliveryRegionService.ts`, `shippingService.ts`, `geocodingService.ts`.
- Equipe e push: `src/components/AdminTeam.tsx`, `PushSettings.tsx`, `server/routes/tenant.ts`, `push.ts`, `server/services/invitationService.ts`, `pushService.ts`.
- Modelos: `src/models/StoreSettings.ts`, `DeliveryRegion.ts`, `server/models/TenantMembership.ts`, `PushDevice.ts`, `PushJob.ts`.

## Dependencias e contratos

- `server/routes/tenant.ts` resolve tenant, exige sessao e membership; `tenantOperations.ts` aplica permissao por recurso e CSRF nas mutacoes.
- A matriz canonica esta em `server/domain/permissions.ts`; `docs/rbac.md` e a explicacao humana.
- Frete publicado deriva de configuracao e regioes do proprio tenant. Falha de geocode nao autoriza inventar cotacao.
- Uploads exigem permissao conforme alvo: `settings:write`, `catalog:write` ou `orders:write`.
- Push revalida conta, membership, permissao, tenant e pedido antes do envio.

## Decisoes importantes

- Configuracoes do tenant nunca sao globais por conveniencia.
- Onboarding grava rascunho e usa revisao para evitar sobrescrita silenciosa; detalhes em `docs/ONBOARDING.md`.
- Em Horarios e Operacao, o estado publicado de pedidos imediatos e encomendas vem de `GET /settings/operational-status`; a edicao da grade e da agenda permanece em rascunho ate salvar. Abrir/fechar e pausar sao operacoes imediatas separadas do salvamento das configuracoes. O salvamento da secao nao envia `is_open` para nao sobrescrever uma operacao recente.
- A escolha inicial do modo de venda nessa tela coordena `preorderDraft.salesMode` e `preorderEnabled`: "pedidos para agora" desativa a agenda sem apagar horarios/regras guardados; os modos com encomenda a ativam somente ao salvar uma configuracao valida. `acceptingPreorders` permanece independente para nao retomar encomendas pausadas por acidente. O modo global nao converte a disponibilidade dos produtos; a revisao do catalogo e explicita.
- O worker persistente nao deve rodar dentro de funcao serverless; Vercel requer chamada agendada externa ao endpoint protegido.

## Verificacoes recomendadas

- Testar Owner, Admin, Manager e Operator, incluindo negacoes para equipe, configuracoes e uploads.
- Trocar slug e ID em regioes, settings, membros, aparelhos push e pedidos.
- Validar horarios, timezone, entrega/retirada, falhas de geocode e worker desligado/religado.

## UX administrativa (2026-10-03)

- Sidebar e a navegacao principal no desktop; abas do catalogo continuam em telas menores. Conta/senha ficam no menu de conta. Status operacional e informativo; pausar/retomar sao acoes explicitas com confirmacao.
- Falha de dashboard tem estado de erro e retry, nunca metricas zeradas como se fossem leitura valida. Pedidos recentes abrem a operacao pelo ID e usam referencia operacional padronizada.
- Clientes oferecem 7/30/90 dias e intervalo personalizado, com legenda separando metricas do periodo e gasto historico do cliente.
