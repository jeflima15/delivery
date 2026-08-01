# ADR 0001: tenant por caminho

Status: aceito.

Cada loja usa `/:slug`. Isso elimina DNS por loja e funciona no deploy atual. O backend resolve slug e deriva `tenantId`; headers/body nunca definem o tenant. Slug e unico, reservado e possui historico para redirect.
