# Landing

## Responsabilidade

Cuidar da entrada institucional da Pode Vir, marca, navegacao inicial e acesso do lojista. Nao contem regras de catalogo, pedido ou tenant admin.

## Arquivos principais

- Roteamento: `src/App.tsx`; vitrine carregada por rota em `src/StorefrontApp.tsx`.
- Pagina e marca: `src/components/landing/PlatformLanding.tsx`, `ProductPreview.tsx`, `landing.css`, `landingContent.ts`, `src/components/brand/PodeVirBrand.tsx`, `src/config/brand.ts`.
- HTML institucional: `scripts/landingPrerender.ts`, `src/components/landing/prerender.tsx`, `index.html`, `src/main.tsx`, `vercel.json`.
- Aquisicao: `src/components/landing/landingAnalytics.ts`, integrado ao Analytics existente.
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
- O build gera `dist/landing.html` a partir do mesmo componente React; somente `/` usa esse documento, hidratado no cliente e sem consulta de tenant. `/:slug` passa pelo Express para metadados de compartilhamento; admin/auth/Master continuam com HTML neutro. O preview do Vite valida landing/CSP, mas nao simula a consulta de metadados do Express.
- `server/services/storefrontHtml.ts` renderiza nome, descricao e imagem publicos antes do JavaScript. Usa somente `APP_ORIGIN` validada, nunca Host/Forwarded; imagens aceitam marca local ou Storage publico configurado, com fallback neutro. Loja inexistente/indisponivel/falha usa HTML neutro, status 404/423/503 e no-store; dados privados e metadados de loja nunca entram no admin.
- Demonstracoes sao locais, ilustrativas e identificadas com dados ficticios; nunca montam componentes operacionais nem buscam dados de lojas.
- A comunicacao preserva fase piloto, convite e pagamentos manuais. Nao anuncia precos, planos ou resultados de clientes sem confirmacao.
- Disponibilidade da importacao assistida no piloto foi confirmada pelo responsavel em 2026-10-10. A divulgacao e habilitada por padrao; `VITE_LANDING_CATALOG_IMPORT=false` permite pausa da comunicacao. A flag altera apenas a apresentacao, nunca a disponibilidade do recurso no SaaS.
- `VITE_PLATFORM_ORIGIN` e opcional e publico: aceita apenas origem HTTPS sem caminho, query ou credenciais. A landing usa o dominio publico padrao definido em `landingContent.ts` quando nao ha override valido; lojas usam `APP_ORIGIN` no servidor.
- Evento `landing_action` registra `action` e `position`; campanhas aceitas: fontes instagram/facebook/google/whatsapp/email/direct, meios social/cpc/organic/email/referral e campanhas piloto/encomendas/cardapio/podevir. Valores livres, IDs de clique e dados pessoais nao sao encaminhados. Clique no WhatsApp significa intencao de contato, nao lead confirmado. Disponibilidade de relatorios depende do Analytics configurado.
- A variante de marca `wordmark` e opt-in na landing; as variantes existentes permanecem para login/admin. PNGs pequeno/social sao versionados; `scripts/generate-landing-assets.mjs` permite regeneracao local com o canvas fornecido pelas ferramentas de PDF, sem participar do build.

## Verificacoes recomendadas

- Testar `/`, `/login`, `/admin`, convite valido/invalido e conta com uma ou varias lojas.
- Confirmar que a landing nao dispara endpoints de vitrine e que redirects preservam destino esperado.
- Cobertura: `tests/e2e/routes.spec.ts`, `tests/e2e/landing.spec.ts`, `tests/unit/landingAnalytics.test.ts` e `tests/unit/landingHttp.test.ts`.
- Verificar raiz sem JavaScript, hidratacao, ausencia de APIs public/customer por loja e de download de `StorefrontApp`; menu/ancoras em 360/390/768/820/1024/1440 px, abas e FAQ por teclado.
- Compartilhamento: `tests/unit/landingHttp.test.ts`, `storefrontHtml.test.ts` e `tests/e2e/content-security-policy.spec.ts`. Apos publicar, conferir duas URLs de loja sem JS, headers CSP/cache e arquivos de fonte/mapa/worker; cache de previews do WhatsApp depende de nova coleta pelo provedor.
