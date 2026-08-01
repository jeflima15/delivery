# Matriz RBAC

| Permissao | Owner | Admin | Manager | Operator |
| --- | --- | --- | --- | --- |
| catalogo leitura | sim | sim | sim | sim |
| catalogo escrita | sim | sim | sim | nao |
| pedidos leitura/escrita | sim | sim | sim | sim |
| clientes leitura | sim | sim | sim | nao |
| clientes exportar/anonimizar | sim | sim | nao | nao |
| cupons escrita | sim | sim | sim | nao |
| configuracoes leitura | sim | sim | sim | nao |
| configuracoes escrita | sim | sim | nao | nao |
| equipe leitura | sim | sim | nao | nao |
| equipe escrita | sim | nao | nao | nao |
| billing leitura | sim | nao | nao | nao |
| auditoria leitura | sim | sim | nao | nao |

`platform_super_admin` nao herda membership: ele usa rotas `/api/master`, MFA e permissoes globais explicitas. Operacoes da loja continuam exigindo membership para impedir acesso acidental cruzado.
