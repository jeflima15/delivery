# Migracao da loja piloto

## Principios

A migracao e idempotente, nao destrutiva e nao roda no startup. Ela preserva IDs/URLs existentes e adiciona o tenant inicial em etapas. Producao requer backup validado e MongoDB replica set.

## Pre-flight

1. criar snapshot/backup logico e testar restauracao em ambiente isolado;
2. congelar alteracoes administrativas durante a janela;
3. configurar `DEFAULT_TENANT_SLUG`, owner e timezone;
4. executar `npm run typecheck`, `npm test`, `npm run build` e auditoria;
5. executar dry-run e guardar o relatorio;
6. corrigir duplicidades de telefone/cupom e documentos orfaos antes do apply.

## Dry-run

```bash
npm run migrate:tenant
```

O script apenas inventaria contagens, duplicidades e conversoes. Inconsistencias retornam codigo diferente de zero.

## Aplicacao controlada

O script exige duas confirmacoes explicitas, alem do argumento:

```bash
CONFIRM_MIGRATION=loja-piloto npm run migrate:tenant -- --apply
```

O valor da confirmacao deve ser exatamente o `DEFAULT_TENANT_SLUG`. Execute primeiro em clone do banco. O fluxo cria/reutiliza o tenant, faz backfill de `tenantId`, normaliza telefone, converte centavos, gera numero/token dos pedidos e associa admins legados como owners da loja piloto. O Master e criado separadamente por CLI com MFA. Reexecucao usa filtros por campos ausentes.

## Pos-condicoes

- contagens por colecao antes/depois;
- nenhum documento operacional sem `tenantId`;
- somas de pedido em reais versus centavos;
- nenhum telefone/cupom duplicado no mesmo tenant;
- nenhum pedido sem numero sequencial ou tracking opaco;
- amostras de catalogo, pedido, cliente e configuracao;
- testes de isolamento com duas lojas.

## Corte do painel administrativo

Depois da migracao dos dados, valide o painel exclusivamente em `/:slug/admin`. O caminho `/admin` e apenas um redirecionamento de compatibilidade e nao deve ser usado para validar novas funcionalidades.

Antes de retirar o painel legado, confirme:

- nenhuma requisicao do painel por slug usa `/api/admin/*`;
- dashboard, pedidos, catalogo, configuracoes, home, clientes, cupons e logs usam `/api/tenant/stores/:slug/*`;
- alteracoes administrativas aparecem na vitrine do mesmo slug;
- testes com dois tenants comprovam que leitura e escrita nao atravessam lojas;
- logs de producao nao registram consumidores ativos dos endpoints legados durante a janela acordada.

Os endpoints globais antigos permanecem temporariamente no `server.ts`, sem receber regras novas. A remocao deve ocorrer em uma mudanca separada, depois da observacao, e nunca por fallback silencioso no frontend.

## Rollback

O rollback primario e restaurar o snapshot em um cluster separado e reverter a aplicacao para o commit anterior. Como o backfill e aditivo, nao remova campos durante a janela. So troque indices e torne campos obrigatorios depois da validacao completa e do periodo de observacao.
