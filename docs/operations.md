# Operacao

## Variaveis obrigatorias

Servidor: `MONGO_URI`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `APP_ORIGIN`, cookies e tenant padrao. Storage: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no servidor; apenas URL e chave anonima usam prefixo `VITE_`. OTP webhook exige URL e segredo. Nunca commite valores reais.

## Checklist de deploy

1. `npm ci` com Node 20;
2. `npm run verify`;
3. revisar secret scan e diff de migrations;
4. validar backup/PITR e restore recente;
5. configurar rate limit distribuido, OTP, Storage e webhook de convites;
6. aplicar migration em clone, depois dry-run de producao;
7. deploy sem migration automatica;
8. smoke test `/health`, `/ready`, duas vitrines, dois admins, pedido e tracking;
9. observar 5xx, latencia, login falho, pedidos e dependencias externas;
10. somente entao executar apply autorizado e validar pos-condicoes.

## Backup e restore

Use backup automatico/PITR do Atlas. Pelo menos trimestralmente, restaure em projeto isolado, valide contagens/indices e execute testes. Export local ocasional nao substitui backup de producao.

## Observabilidade

Propague `x-request-id`; registre nivel, rota, status, latencia e tenant sanitizado. Alertas minimos: taxa de 5xx, conexao Mongo, falha OTP/Storage/geocode, pedido rejeitado, webhook e crescimento de sessoes. Nao registre body de auth nem PII completa.

## Degradacao

Sem geocode, nao inventar frete; retornar indisponibilidade. Sem OTP real, reset por telefone retorna 503. Sem Storage, cadastro continua mas upload falha claramente. Billing manual continua independente do checkout da loja.

## Rollback

Reimplante o artefato anterior, nao reverta campos aditivos e restaure banco apenas se houver corrupcao confirmada. Em incidente de migration, direcione trafego para o banco restaurado e valide tenants antes de reabrir pedidos.
