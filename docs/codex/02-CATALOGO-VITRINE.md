# Catalogo e vitrine

## Responsabilidade

Exibir a loja e manter produtos, categorias, complementos, combos e blocos de vitrine. Regras financeiras finais pertencem ao pedido autoritativo.

## Arquivos principais

- Vitrine: `src/components/Home.tsx`, `src/components/ProductModal.tsx`, `src/components/ComboModal.tsx`, `src/components/vitrine/`.
- Estado e contratos publicos: `src/App.tsx`, `src/types/storefront.ts`, `src/lib/productDetails.ts`, `src/lib/combo.ts`.
- API publica: `server/routes/public.ts`.
- Administracao: `src/components/AdminProducts.tsx`, `AdminCategorias.tsx`, `AdminComplementGroups.tsx`, `AdminComboEditor.tsx`, `AdminHomeBlocks.tsx`.
- Importacao assistida: `src/components/tenant-admin/catalog-import/CatalogImportPage.tsx`, `server/routes/catalogImports.ts`, `server/services/catalogImportJobService.ts`, `catalogImportReviewService.ts` e `catalogImportCommitService.ts`.
- Persistencia e rotas tenant: `src/models/Product.ts`, `Category.ts`, `ComplementGroup.ts`, `HomeBlock.ts`, `server/routes/tenantOperations.ts`.

## Dependencias e contratos

- Leitura publica usa `/api/public/stores/:slug/*`; escrita usa `/api/tenant/stores/:slug/*` com membership, permissao e CSRF.
- DTOs publicos devem expor somente campos necessarios; estoque interno, `tenantId` e metadados de banco ficam privados.
- Upload de produto exige `catalog:write` e caminho `tenants/<tenantId>/<target>/<uuid>.webp`; assinatura fica em `server/routes/tenant.ts` e `server/services/storageService.ts`.
- O checkout pode enviar IDs, quantidades e opcoes, mas `server/services/orderService.ts` recarrega o catalogo e calcula valores.
- A importacao usa a engine Domain-Native do Lab, mas persiste separadamente `CatalogImport`, a analise imutavel em `CatalogImportAnalysis` e a execucao em `CatalogImportJob`. O Lab permanece sem escrita no catalogo.
- `CatalogImport.revision` protege edicoes concorrentes do rascunho. `CatalogRevision` e incrementada pelos writers canonicos de produto, categoria, complemento e estrutura, e a confirmacao usa compare-and-swap dentro da mesma transacao do catalogo.
- A confirmacao recompila o resultado a partir do `workingPlan` persistido; o browser envia apenas revisao esperada, hash da previa, modo de publicacao e chave de idempotencia.

## Decisoes importantes

- Nao reintroduzir endpoints globais ou fallback single-store.
- IDs relacionados em combos e complementos devem pertencer ao mesmo tenant.
- Preco de tela e informativo; o servidor e a autoridade financeira.
- Duplicidades nunca atualizam silenciosamente um item: produto, combo ou grupo exige `create`, `reuse_existing` ou `skip`; categorias de mesmo nome podem ser reutilizadas automaticamente somente dentro do tenant.
- Arquivo original fica em bucket privado temporario. Fotos aprovadas usam caminho publico isolado por importacao; cancelamento/expiracao remove temporarios, e confirmacao preserva apenas fotos efetivamente adotadas.
- Uma alternativa de modelagem so e considerada resolvida quando altera o plano por operacao tipada ou quando a modelagem recomendada ja corresponde ao plano. Bloqueios nao podem ser descartados apenas por uma flag.

## Verificacoes recomendadas

- Testar leitura/escrita cruzada entre duas lojas, DTO publico e permissoes de cada papel.
- Cobrir produto inativo/esgotado, complemento invalido, combo com item estrangeiro e upload com alvo inadequado.
- Testes centrais: `tests/integration/multiTenant.test.ts`, `comboOrders.test.ts`, `complementGroups.test.ts` e E2E de catalogo.
- Importacao: `tests/unit/catalogImportReview.test.ts`, `tests/integration/catalogImportCommit.test.ts` e `tests/unit/catalogImportDomain.test.ts`.
