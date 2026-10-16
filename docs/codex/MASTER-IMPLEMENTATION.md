# Modernizacao do Admin Master

Plano aprovado na conversa da area Master. Cada entrega inclui contrato, servidor, persistencia, interface afetada e verificacao proporcional ao risco. Alteracoes de landing existentes sao trabalho independente e devem ser preservadas.

## Primeira entrega implementada: integridade de cobranca e calendario

- [x] Validar vinculo fatura/assinatura/loja, inclusive nos registros legados durante mutacao.
- [x] Transacionar faturamento, assinatura, reflexo de status da loja e auditoria.
- [x] Preservar bloqueios administrativos e assinaturas suspensas/canceladas durante pagamento.
- [x] Evitar duplicacao de criacao na nova interface e serializar pagamentos concorrentes.
- [x] Recusar atribuicao sobre assinatura existente e prorrogacao de assinatura fora de trial.
- [x] Conciliar recebido e aberto entre dashboard, serie e relatorio, com limites de dia em Brasilia.
- [x] Permitir filtrar faturas por pagamento, vencimento ou emissao; calcular atraso mesmo sem job.
- [x] Explicitar registros manuais e abrangencia do CSV; melhorar confirmacoes e formulario de datas.
- [x] Preservar datas e identificadores na sanitizacao de auditoria, mantendo filtragem de segredos.
- [x] Adicionar testes de concorrencia, rollback, isolamento, autorizacao e fluxo de interface.

Regras detalhadas e compatibilidade: `docs/billing.md`. Nenhuma migracao, troca de indice, operacao de producao ou nova dependencia faz parte desta entrega.

## Proximas entregas

1. Desenho de UX e navegacao: agrupar Operacao, Comercial e Plataforma; URLs com filtro/aba/recurso; contexto preservado; componentes acessiveis e responsivos. Avaliar bibliotecas somente mediante autorizacao de instalacao.
2. Condicoes comerciais: preservar preco/intervalo contratados por assinatura, distinguir oferta e contrato, definir vigencia de mudancas e qualificar dados legados sem inventar historico.
3. Recursos e limites: catalogo validado, aplicacao no servidor, controle concorrente de quotas e utilizacao visivel no painel da loja. Plano nao concede permissoes administrativas. Alinhar apresentacao comercial ao que estiver efetivamente entregue.
4. Lojas e ficha completa: reunir ativacao, uso, assinatura, cobranca, acessos e suporte; acoes contextualizadas, visoes salvas e exportacao completa com filtros.
5. Dashboard e atencao: indicadores comparativos e investigaveis, instrumentacao de atividade, historico para conversao/churn, estados individuais de leitura/resolucao e preferencias globais aplicadas. Remover a ocultacao permanente de pendencias e diferenciar falha de consulta de ausencia de alertas.
6. Suporte e governanca: motivo, duracao e encerramento de impersonacao, atribuicao do operador na auditoria; manutencao com previa de impacto; historico persistente de infraestrutura.

## Estrutura de UX prevista

- Operacao: fila de pendencias e lojas. Ficha da loja com resumo, ativacao/uso, assinatura/cobranca, acessos e historico.
- Comercial: planos e condicoes, assinaturas, Cobranca Pode Vir e relatorios SaaS. GMV/pedidos continuam identificados como movimentacao das lojas.
- Plataforma: acessos administrativos, auditoria, infraestrutura, configuracoes e manutencao.
- Busca leva ao recurso exato; links e retorno preservam filtros/aba. Modal exige foco correto, Escape, retorno do foco e erro anunciado.

## Decisoes comerciais ainda necessarias para ativacao

Valores/chaves de recursos e quotas; politica de excedentes e downgrade; manutencao de precos antigos versus reajuste; vigencia/proporcionalidade na troca; tolerancia ao atraso e alcance da suspensao. Padrao proposto: preservar dados e condicoes contratadas ate mudanca explicita, sem liberar bloqueio administrativo por cobranca.

## Limites desta fase

Billing continua manual, sem renovacao automatica, gateway, webhook financeiro ou agendamento de grace period. A prorrogacao repetida de trial ainda e uma nova acao manual. MRR nao tem snapshot contratual; atividade nao e instrumentada; notificacoes/preferencias/navegacao ainda aguardam suas entregas. Nao vender essas capacidades como prontas.

Migracoes futuras seguem `docs/migration.md`: diagnostico, dry-run, revisao de legado e autorizacao separada para apply; nunca no startup. MFA, CSRF, memberships, isolamento de sessoes e compatibilidade sao criterios de aceite em todas as entregas.
