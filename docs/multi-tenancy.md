# Multi-tenancy

## Regras invariantes

1. Rotas de loja recebem slug, resolvem o `Tenant` no backend e derivam `tenantId` dele.
2. Toda consulta operacional inclui `tenantId`; IDs enviados pelo cliente nunca removem esse filtro.
3. Admin precisa de sessao ativa, membership ativa e permissao explicita na mesma loja.
4. Rotas Master sao separadas, globais de forma deliberada e exigem `platform_super_admin` com MFA.
5. Uploads novos usam `tenants/<tenantId>/<target>/<uuid>.webp`.
6. Chaves locais de carrinho/perfil incluem slug.

## Entidades tenant-aware

`StoreSettings`, `Product`, `Category`, `Coupon`, `Order`, `User`, `HomeBlock`, `AuditLog`, `OrderSequence`, `ShippingQuote`, desafios de reset, convites, membership, assinatura e fatura possuem escopo de loja ou referencia explicita ao tenant.

## Indices

Os principais indices compostos cobrem telefone do cliente, ordem do catalogo, codigo de cupom, numero sequencial do pedido, status/data e membership. A migracao detecta duplicidades antes de trocar indices antigos.

## Teste negativo

`tests/integration/multiTenant.test.ts` cria duas lojas e comprova que o catalogo e o resolver nao retornam dados cruzados. Toda nova rota por ID deve incluir um teste equivalente trocando slug e ID.
