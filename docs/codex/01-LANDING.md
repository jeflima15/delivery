# Landing

## Responsabilidade

Cuidar da entrada institucional da Pode Vir, marca, navegacao inicial e acesso do lojista. Nao contem regras de catalogo, pedido ou tenant admin.

## Arquivos principais

- Roteamento: `src/App.tsx`.
- Pagina e marca: `src/components/landing/PlatformLanding.tsx`, `src/components/brand/PodeVirBrand.tsx`, `src/config/brand.ts`.
- Entrada administrativa: `src/components/CentralMerchantLogin.tsx`, `src/components/AcceptInvitation.tsx`, `src/components/ResetAdminPassword.tsx`.
- Contratos de login/convite: `server/routes/auth.ts`, montado em `/api/platform/auth` por `server/routes/index.ts`.

## Dependencias e contratos

- `/` e landing; `/:slug` e vitrine; `/:slug/admin` e painel da loja; `/master` e painel global.
- O login central pode descobrir memberships e pedir selecao quando a conta pertence a varias lojas.
- Convites e resets usam tokens opacos, com validade e consumo controlados no servidor.

## Decisoes importantes

- A landing deve continuar leve: nao inicializa carrinho, sessao de cliente nem chamadas de storefront.
- `/admin` e compatibilidade de navegacao; APIs antigas globais nao sao fallback.
- Alteracoes visuais nao podem relaxar login, convite, CSRF ou selecao de tenant.

## Verificacoes recomendadas

- Testar `/`, `/login`, `/admin`, convite valido/invalido e conta com uma ou varias lojas.
- Confirmar que a landing nao dispara endpoints de vitrine e que redirects preservam destino esperado.
- Cobertura de rotas: `tests/e2e/routes.spec.ts`.
