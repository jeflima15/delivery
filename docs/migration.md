# Migracao da loja piloto

## Indices explicitos (004)

A conexao normal desabilita `autoIndex`/`autoCreate` e nao executa DDL. Antes de publicar em banco novo ou com indices ausentes, provisione os indices dos schemas com `npm run migrate:indexes`. O comando exige `MONGO_URI` e `MIGRATION_DB_NAME`, usa dry-run por padrao e nao imprime dados de clientes. Nenhum comando desta secao deve ser executado em producao sem autorizacao.

1. Valide backup/PITR e restore em clone. Congele escritas durante a janela de aplicacao.
2. Execute o dry-run no clone. O relatorio identifica colecao, nome, chave e opcoes; conta grupos duplicados antes de criar indices unicos. Conflitos de definicao bloqueiam a aplicacao.
3. Indices existentes, inclusive globais, sao preservados. Somente definicoes legadas exatas aparecem como candidatos; para selecionar uma, repita o dry-run com `--drop-index=users:telefone_1` (ou outro identificador efetivamente listado). Nomes semelhantes, opcoes especiais e indices desconhecidos nunca sao removidos pelo comando.
4. Revise o plano, os candidatos e o backfill. Para aplicar no clone, passe `--apply`, `CONFIRM_INDEX_MIGRATION` igual ao banco e `APPROVED_INDEX_PLAN` igual ao fingerprint do dry-run com as mesmas selecoes. Qualquer mudanca no inventario invalida a aprovacao.
5. Todos os indices ausentes sao criados antes de remover os selecionados. Falha de criacao preserva as restricoes antigas; execucao parcial exige novo dry-run. Nao ha `syncIndexes` nem exclusao de dados.
6. Confira indices, unicidade, login, duas lojas e memberships no clone. Depois, mediante autorizacao separada, repita inventario/aprovacao no banco de destino antes da publicacao.

Backfill de tenant/telefone deve preceder a retirada da unicidade global dos usuarios. Remocoes em categorias/produtos exigem revisao de negocio, mesmo quando listadas como candidatas. Indices com collation/opcoes divergentes ficam para decisao manual; nao os descarte para fazer a migracao passar.

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

Os endpoints globais antigos foram removidos depois da validacao do painel por slug. Nao adicione fallback silencioso no frontend; toda operacao administrativa deve permanecer no contrato tenant-scoped.

## Associacao de pedidos aos clientes

Depois do backfill inicial de `tenantId`, execute a migracao idempotente que associa pedidos legados a usuarios pelo telefone normalizado. Ela opera em um unico tenant, nao altera pedidos ja associados e somente vincula quando existe exatamente uma correspondencia dentro da mesma loja.

Dry-run obrigatorio:

```powershell
$env:MIGRATION_DB_NAME='nome-do-banco'
$env:CUSTOMER_MIGRATION_TENANT_SLUG='loja-piloto'
npm run migrate:customer-orders
```

O relatorio informa `mode`, `tenant`, `scanned`, `linkable`, `migrated`, `ignored`, `ambiguousCount`, `unmatched` e `ambiguous`. Guarde esse JSON. Ambiguidades bloqueiam o apply; pedidos sem correspondencia permanecem sem `usuarioId` e devem ser tratados manualmente.

Aplicacao explicita:

```powershell
$env:CONFIRM_CUSTOMER_ORDER_MIGRATION='loja-piloto'
npm run migrate:customer-orders -- --apply
```

Rollback logico: use o relatorio e um backup para remover apenas os `usuarioId` aplicados pela execucao, ou restaure o snapshot em ambiente separado. O script nao remove clientes, pedidos ou snapshots antigos.

## Rollback

O rollback primario e restaurar o snapshot em um cluster separado e reverter a aplicacao para o commit anterior. Como o backfill e aditivo, nao remova campos durante a janela. So troque indices e torne campos obrigatorios depois da validacao completa e do periodo de observacao.
