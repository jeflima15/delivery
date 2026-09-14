# Encomendas na Pode Vir

## Ativar na loja

1. Em Loja > Entrega e Pagamento, habilite retirada ou entrega. Para exigir sinal, habilite PIX e cadastre a chave correta.
2. Em Loja > Horarios & Operacao > Agenda de encomendas, marque Ativar encomendas no cardapio.
3. Escolha Somente por encomenda ou Pronta entrega e encomendas.
4. Defina antecedencia, horizonte de agendamento, dias, faixas de entrega/retirada e intervalo dos horarios.
5. Opcionalmente limite pedidos por dia/horario, configure folgas/datas especiais e escolha o percentual de sinal.
6. Salve as alteracoes. A agenda e independente do horario de pronta entrega; permite receber encomendas com a loja fechada.

As configuracoes existentes ficam desativadas ate a ativacao explicita. Para pausar novas encomendas, desmarque Aceitar novas encomendas. Desativar a funcionalidade inteira restaura o atendimento imediato; nao apaga pedidos existentes.

## Produtos e combos

Em Catalogo > Cadastro de Produtos > Editar > Regras de encomenda, escolha o modo permitido para o item e, se necessario, um prazo de preparo proprio. Esse prazo substitui o padrao para o item; pedidos com varios itens respeitam o maior prazo. Combos respeitam tambem seus componentes. Salve o cadastro.

O controle de estoque continua opcional. Se estiver ligado, a reserva utiliza o estoque existente. Limites de agenda contam pedidos, nao unidades ou horas de producao. Carrinhos com modalidades incompativeis precisam ser separados.

## Operacao diaria

- O cliente escolhe data e janela no checkout e pode informar personalizacoes nas observacoes. A disponibilidade e conferida novamente ao finalizar.
- Em Pedidos > Em andamento > Encomendas, filtre a data de entrega/retirada e abra os detalhes.
- Confira o PIX no banco e use Registrar recebimento ou devolucao. O valor sugerido primeiro e o sinal faltante; depois, o saldo. Nao e preciso abrir o caixa para registrar na encomenda. Sem caixa aberto, o recebimento fica no historico do pedido, fora do fechamento de caixa.
- Inicie o preparo manualmente apos conferir o sinal. Para finalizar a entrega/retirada, registre o saldo total recebido.
- Antes do preparo, use Reagendar encomenda nos detalhes. Combine com o cliente e informe o motivo. A disponibilidade e revalidada; preco e sinal combinados permanecem.
- Ao cancelar, a vaga e liberada. Valores recebidos ficam como devolucao pendente ate voce efetuar e registrar a devolucao; o sistema nao transfere dinheiro.
- Data, janela e valores aparecem no acompanhamento do cliente, nos detalhes e na comanda.

## Limites desta entrega

PIX e conferido manualmente, sem API bancaria ou cobranca automatica. Pedido sem sinal ocupa a vaga ate cancelamento manual. Nao ha inicio automatico de producao, envio automatico de WhatsApp, orcamento negociado ou upload de referencias neste fluxo. O cliente usa produtos precificados, adicionais e observacoes; alteracoes posteriores devem ser combinadas com a loja.

Antes do piloto, publique a versao e faca um pedido de teste na propria loja: agendar, conferir sinal, reagendar, preparar, registrar saldo e finalizar. Confira tambem a impressora utilizada no estabelecimento. Os testes automatizados nao substituem esta validacao da configuracao e equipamentos reais.
