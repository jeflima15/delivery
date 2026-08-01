# ADR 0002: sessoes em cookies

Status: aceito.

Tokens no localStorage foram substituidos por access/refresh em cookies HttpOnly. Refresh e rotativo, persistido como hash e revogavel. Mutacoes exigem CSRF e origem permitida. A decisao reduz impacto de XSS e permite revogacao imediata.
