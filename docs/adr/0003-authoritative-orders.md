# ADR 0003: pedido autoritativo no servidor

Status: aceito.

O browser envia IDs e quantidades; o servidor carrega catalogo/configuracao, valida opcoes/estoque/pagamento, calcula centavos/cupom/frete e grava em transacao. `Idempotency-Key` impede duplicidade e tracking opaco evita IDOR.
