# Catalogo e vitrine

## Responsabilidade

Exibir a loja e manter produtos, categorias, complementos, combos e blocos de vitrine. Regras financeiras finais pertencem ao pedido autoritativo.

## Arquivos principais

- Vitrine: `src/components/Home.tsx`, `src/components/ProductModal.tsx`, `src/components/ComboModal.tsx`, `src/components/vitrine/`.
- Estado e contratos publicos: `src/App.tsx`, `src/types/storefront.ts`, `src/lib/productDetails.ts`, `src/lib/combo.ts`.
- API publica: `server/routes/public.ts`.
- Administracao: `src/components/AdminProducts.tsx`, `AdminCategorias.tsx`, `AdminComplementGroups.tsx`, `AdminComboEditor.tsx`, `AdminHomeBlocks.tsx`.
- Persistencia e rotas tenant: `src/models/Product.ts`, `Category.ts`, `ComplementGroup.ts`, `HomeBlock.ts`, `server/routes/tenantOperations.ts`.

## Dependencias e contratos

- Leitura publica usa `/api/public/stores/:slug/*`; escrita usa `/api/tenant/stores/:slug/*` com membership, permissao e CSRF.
- DTOs publicos devem expor somente campos necessarios; estoque interno, `tenantId` e metadados de banco ficam privados.
- Upload de produto exige `catalog:write` e caminho `tenants/<tenantId>/<target>/<uuid>.webp`; assinatura fica em `server/routes/tenant.ts` e `server/services/storageService.ts`.
- O checkout pode enviar IDs, quantidades e opcoes, mas `server/services/orderService.ts` recarrega o catalogo e calcula valores.

## Decisoes importantes

- Nao reintroduzir endpoints globais ou fallback single-store.
- IDs relacionados em combos e complementos devem pertencer ao mesmo tenant.
- Preco de tela e informativo; o servidor e a autoridade financeira.

## Verificacoes recomendadas

- Testar leitura/escrita cruzada entre duas lojas, DTO publico e permissoes de cada papel.
- Cobrir produto inativo/esgotado, complemento invalido, combo com item estrangeiro e upload com alvo inadequado.
- Testes centrais: `tests/integration/multiTenant.test.ts`, `comboOrders.test.ts`, `complementGroups.test.ts` e E2E de catalogo.
