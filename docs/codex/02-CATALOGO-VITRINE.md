# Catalogo e vitrine

## Responsabilidade

Exibir a loja e manter produtos, categorias, complementos, combos e blocos de vitrine. Regras financeiras finais pertencem ao pedido autoritativo.

## Arquivos principais

- Vitrine: `src/components/Home.tsx`, `src/components/ProductModal.tsx`, `src/components/ComboModal.tsx`, `src/components/vitrine/`.
- Estado e contratos publicos: `src/StorefrontApp.tsx` (carregado por rota em `src/App.tsx`), `src/types/storefront.ts`, `src/lib/productDetails.ts`, `src/lib/combo.ts`.
- API publica: `server/routes/public.ts`.
- HTML inicial para compartilhamento: `server.ts` e `server/services/storefrontHtml.ts`; detalhes de roteamento/CSP em `06-CORE.md`.
- Identidade da aba: `src/components/PageIdentity.tsx`, `src/lib/browserIdentity.ts` e `src/lib/storeIdentity.ts`. O HTML inicial da vitrine ja contem nome sem sufixo e favicon do logo, separado de `og:image` (que continua preferindo capa).
- Administracao: `src/components/AdminProducts.tsx`, `AdminCategorias.tsx`, `AdminComplementGroups.tsx`, `AdminComboEditor.tsx`, `AdminHomeBlocks.tsx`.
- Importacao assistida: `src/components/tenant-admin/catalog-import/CatalogImportPage.tsx`, `server/routes/catalogImports.ts`, `server/services/catalogImportJobService.ts`, `catalogImportReviewService.ts` e `catalogImportCommitService.ts`.
- Persistencia e rotas tenant: `src/models/Product.ts`, `Category.ts`, `ComplementGroup.ts`, `HomeBlock.ts`, `server/routes/tenantOperations.ts`.

## Dependencias e contratos

- Leitura publica usa `/api/public/stores/:slug/*`; escrita usa `/api/tenant/stores/:slug/*` com membership, permissao e CSRF.
- DTOs publicos devem expor somente campos necessarios; estoque interno, `tenantId` e metadados de banco ficam privados.
- Upload de produto exige `catalog:write` e caminho `tenants/<tenantId>/<target>/<uuid>.webp`; assinatura fica em `server/routes/tenant.ts` e `server/services/storageService.ts`.
- O checkout pode enviar IDs, quantidades e opcoes, mas `server/services/orderService.ts` recarrega o catalogo e calcula valores.
- A importacao usa a engine Domain-Native canonica em `catalogImportAiService.ts` e `catalogImportPreprocessor.ts`. Persiste `CatalogImport`, a analise imutavel em `CatalogImportAnalysis` e a execucao em `CatalogImportJob`; nenhuma analise grava no catalogo antes da confirmacao.
- O Lab IA e seus pipelines experimentais foram retirados. Links antigos `tab=lab_ia` abrem `importar`, sem iniciar analise. A retirada nao exige migracao nem remocao de drafts, buckets ou arquivos remotos.
- `CatalogImport.revision` protege edicoes concorrentes do rascunho. `CatalogRevision` e incrementada pelos writers canonicos de produto, categoria, complemento e estrutura, e a confirmacao usa compare-and-swap dentro da mesma transacao do catalogo.
- A confirmacao recompila o resultado a partir do `workingPlan` persistido; o browser envia apenas revisao esperada, hash da previa, modo de publicacao e chave de idempotencia.

## Decisoes importantes

- Nao reintroduzir endpoints globais ou fallback single-store.
- IDs relacionados em combos e complementos devem pertencer ao mesmo tenant.
- Preco de tela e informativo; o servidor e a autoridade financeira.
- Favicon usa `logo_url` existente, sem campo novo. URLs seguem a mesma allowlist do compartilhamento (marca local ou Storage publico configurado); imagens privadas/assinadas/externas caem no icone Pode Vir. Nao ha fetch de imagem no servidor. O cliente verifica carregamento/decodificacao e retorna ao fallback em erro/timeout; logos retangulares recebem padding transparente em canvas 64x64, sem alterar o original. Uploads quadrados continuam pela URL original, sem conversao.
- HTML e endpoint de identidade usam no-store. Uploads tem caminho UUID novo; o favicon tambem recebe `v` derivado do `updatedAt` persistido das settings, nunca do horario de cada acesso. Salvar settings notifica a aba atual; foco/visibilidade/pageshow reconsultam a identidade para refletir alteracoes de outra aba. Respostas antigas e carregamentos de imagens de outra loja sao descartados.
- Duplicidades nunca atualizam silenciosamente um item: produto, combo ou grupo exige `create`, `reuse_existing` ou `skip`; categorias de mesmo nome podem ser reutilizadas automaticamente somente dentro do tenant.
- Arquivo original fica em bucket privado temporario. Fotos aprovadas usam caminho publico isolado por importacao; cancelamento/expiracao remove temporarios, e confirmacao preserva apenas fotos efetivamente adotadas.
- Uma alternativa de modelagem so e considerada resolvida quando altera o plano por operacao tipada ou quando a modelagem recomendada ja corresponde ao plano. Bloqueios nao podem ser descartados apenas por uma flag.
- A revisao da importacao e orientada por pendencias do estado atual calculado no servidor: bloqueios vinculados a entidades apontam para o respectivo editor, avisos tecnicos ficam em detalhes e fotos ja vinculadas nao ocupam a area principal. A previa continua sendo obrigatoria antes da confirmacao.

## Verificacoes recomendadas

- Testar leitura/escrita cruzada entre duas lojas, DTO publico e permissoes de cada papel.
- Cobrir produto inativo/esgotado, complemento invalido, combo com item estrangeiro e upload com alvo inadequado.
- Testes centrais: `tests/integration/multiTenant.test.ts`, `comboOrders.test.ts`, `complementGroups.test.ts` e E2E de catalogo.
- Importacao: `tests/unit/catalogImportReview.test.ts`, `tests/integration/catalogImportCommit.test.ts` e `tests/unit/catalogImportDomain.test.ts`.

## UX de catalogo e vitrine (2026-10-03)

- Disponibilidade publica e derivada no servidor, inclusive estoque dos componentes de combos, sem expor quantidades privadas. O pedido continua validando valores e estoque autoritativamente.
- Busca ignora acentos, expande resultados em lotes de 15 e preserva consulta/rolagem ao abrir detalhes. Promocoes abrem por escolha do cliente ou link explicito, nunca por popup automatico.
- Produtos e combos usam editores em pagina, com parametros editor/id, retorno aos filtros e protecao de alteracoes nao salvas. GET administrativo products/:id exige catalog:read.
- Paginacao 25/50 e local; a colecao completa permanece disponivel para validacao dos combos. Selecao distingue pagina e todos os resultados filtrados. Operacoes em lote usam writes canonicos com expectedUpdatedAt, resultado por item e retencao dos que falharam; nao sao a transacao atomica da importacao.
- A previa da importacao espera o salvamento dos formularios alterados. Mudanca local invalida a previa; falha de salvamento impede confirmar uma versao antiga. Limites exibidos vem do backend.
- Testes de tela: catalog-ux.spec.ts, catalog-import-ux.spec.ts e regressoes product-preorder/combo/promotions.
- Identidade: `storefrontHtml.test.ts`, `landingHttp.test.ts`, `multiTenant.test.ts` e `page-identity.spec.ts`; jornada real de encomenda e salvamento de aparencia tambem verificam titulo/icone. Apos publicar, conferir favicon em navegadores reais e caches de abas ja abertas. Sem JavaScript, HTML usa URL validada do logo; se um objeto permitido tiver sido removido/corrompido no Storage, o fallback por falha de carregamento depende do cliente JavaScript.
