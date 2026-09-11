export type OrderDeliveryType = 'delivery' | 'pickup' | 'retirada' | 'dine_in' | 'local' | string | null | undefined;

export function getOrderStatusLabel(status: string, deliveryType?: OrderDeliveryType): string {
  const isPickup = deliveryType === 'pickup' || deliveryType === 'retirada';
  const isDineIn = deliveryType === 'dine_in' || deliveryType === 'local';

  switch (status) {
    case 'Pendente':
      return 'Aguardando confirmação';
    case 'Preparando':
      return isDineIn ? 'Em preparo na cozinha' : 'Em preparação';
    case 'Pronto':
      if (isDineIn) return 'Pronto para Servir';
      if (isPickup) return 'Pronto para Retirada';
      return 'Pronto para Entrega';
    case 'Saiu para Entrega':
      if (isDineIn) return 'Pronto para Servir';
      if (isPickup) return 'Pronto para Retirada';
      return 'Saiu para Entrega';
    case 'Entregue':
    case 'Concluído':
      if (isDineIn) return 'Pedido Finalizado';
      if (isPickup) return 'Pedido Retirado';
      return 'Pedido Entregue';
    case 'Cancelado':
      return 'Pedido Cancelado';
    default:
      return status;
  }
}
