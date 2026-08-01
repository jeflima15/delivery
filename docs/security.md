# Seguranca

## Ameacas tratadas

- tomada de conta por telefone: endpoints legados encerrados; reset exige OTP com prova de posse;
- roubo de token por XSS: cookies HttpOnly, Secure em producao e sem auth no localStorage;
- CSRF: token double-submit, Origin/Referer e allowlist de origens nas mutacoes;
- escalada entre lojas: tenant derivado do slug, membership e RBAC revalidados no backend;
- adulteracao de pedido: produtos, opcoes, preco, cupom, frete e total recalculados no servidor;
- IDOR no rastreio: token opaco aleatorio, hash no banco e resposta sem PII;
- abuso de upload: sessao, permissao, MIME/tamanho allowlist e path imutavel por tenant;
- vazamento em logs: auditoria remove chaves de senha, segredo, OTP, token, cookie e authorization.

## Sessao

Access token de 15 minutos e refresh de 30 dias ficam em cookies. Apenas o hash bcrypt do refresh e persistido. Cada refresh rotaciona segredo e CSRF; reutilizacao revoga todas as sessoes da conta. Alteracao/reset de senha incrementa `tokenVersion`, revoga sessoes e exige novo login.

## Master MFA

TOTP e obrigatorio. O segredo e cifrado com AES-GCM usando `MFA_ENCRYPTION_KEY`. Codigos de recuperacao sao armazenados como hash e consumidos atomicamente uma unica vez. O bootstrap e CLI, nunca rota publica.

## Storage

A service-role do Supabase existe somente no backend. O frontend recebe um token de upload curto para um caminho gerado pelo servidor. Policies estao em `supabase/migrations`; bucket/path nao sao aceitos do cliente.

## Rate limit

`securityRateLimit` usa memoria somente em desenvolvimento/teste e Upstash Redis REST em ambiente distribuido. Login, cadastro, OTP/reset, pedido, frete e rastreio estao protegidos. A validacao de ambiente exige URL/token do Upstash em producao e falha fechada se o store ficar indisponivel; memoria de uma instancia nunca e apresentada como protecao suficiente em Vercel.

## LGPD

Admins autorizados podem exportar dados de um cliente dentro da propria loja e anonimiza-los com motivo auditado. A anonimizacao revoga acesso, remove contato/endereco e desvincula pedidos, preservando valores e historico fiscal. Defina retencao legal com assessoria antes de automatizar exclusoes.

## Incidente

1. suspender credencial/provedor afetado;
2. rotacionar segredos no cofre da hospedagem;
3. revogar sessoes e incrementar `tokenVersion` quando aplicavel;
4. preservar logs/auditoria e `requestId`;
5. avaliar tenants/dados atingidos e cumprir notificacoes legais;
6. restaurar somente apos validar build, indices, policies e smoke tests.
