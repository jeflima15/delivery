import React, { useEffect, useState } from 'react';
import { CheckCircle, ChevronRight, Clock3, Lock, Package, RefreshCw } from 'lucide-react';
import { customerApi } from '../features/customer/api';
import OrderDetailsModal from './OrderDetailsModal';

type Props = {
  user?: any;
  tenantSlug: string;
  products?: any[];
  isPasswordVerified?: boolean;
  onRequestPasswordVerification?: () => void;
  onReorder?: (items: any[]) => void;
  onTrackingRequest?: (tracking: { orderId: string; trackingToken: string }) => void;
};

export default function Orders({
  tenantSlug,
  products = [],
  isPasswordVerified = false,
  onRequestPasswordVerification,
  onReorder,
  onTrackingRequest,
}: Props) {
  const [state, setState] = useState<'active' | 'completed'>('active');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await customerApi(tenantSlug).orders(state, page);
      setOrders(data.items || []);
      setPagination(data.pagination || { page: 1, pages: 1 });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar seus pedidos.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [state]);

  useEffect(() => {
    if (state === 'completed' && !isPasswordVerified) return;
    load();
    if (state !== 'active') return;
    const refresh = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [tenantSlug, state, page, isPasswordVerified]);

  const repeat = (order: any) => {
    const available = new Map(
      products
        .filter((product) => product.ativo !== false && !product.esgotado)
        .map((product) => [String(product._id || product.id), product]),
    );
    const items = order.items.flatMap((item: any) => {
      const product = available.get(String(item.productId));
      if (!product) return [];
      const price = Number(product.preco || 0);
      return [
        {
          produtoId: String(product._id || product.id),
          nome: product.nome,
          preco_unitario: price,
          quantidade: item.quantity,
          subtotal: price * item.quantity,
          opcoes_escolhidas: [],
          secureOptions: [],
        },
      ];
    });
    if (items.length) onReorder?.(items);
    else setError('Os produtos deste pedido não estão mais disponíveis.');
  };

  const modalOrder = selectedOrder
    ? {
        ...selectedOrder,
        _id: selectedOrder.id,
        tipo_entrega: selectedOrder.deliveryType,
        metodo_pagamento: selectedOrder.paymentMethod,
        total: selectedOrder.totalCents / 100,
        frete: selectedOrder.shippingCents / 100,
        desconto_cupom: selectedOrder.discountCents / 100,
        cliente: { endereco: selectedOrder.address },
        historico_status: selectedOrder.history,
        review: selectedOrder.review,
        canReview: selectedOrder.canReview,
        reviewDeadlineAt: selectedOrder.reviewDeadlineAt,
        itens: selectedOrder.items.map((item: any) => ({
          nome: item.name,
          quantidade: item.quantity,
          preco_unitario: item.unitPriceCents / 100,
          subtotal: item.subtotalCents / 100,
        })),
      }
    : null;

  const submitReview = async (payload: { score: number; comment: string }) => {
    if (!selectedOrder) throw new Error('Pedido não selecionado.');
    const response = await customerApi(tenantSlug).reviewOrder(selectedOrder.id, payload);
    const updatedOrder = response.order;
    setSelectedOrder(updatedOrder);
    setOrders((current) => current.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)));
    return updatedOrder;
  };

  return (
    <div className="mx-auto mb-24 max-w-5xl px-4 pt-4 sm:px-6 sm:pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Seus pedidos</h1>
          <p className="mt-1 text-sm text-gray-500">Acompanhe pedidos ativos e consulte seu histórico.</p>
        </div>
        <button
          onClick={() => load()}
          aria-label="Atualizar pedidos"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setState('active')}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            state === 'active' ? 'bg-white store-text-primary shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Em andamento
        </button>
        <button
          onClick={() => setState('completed')}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            state === 'completed' ? 'bg-white store-text-primary shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Finalizados
        </button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* B3X Style Password Protection for Completed Orders */}
      {state === 'completed' && !isPasswordVerified ? (
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-shadow hover:shadow-md">
          <button
            onClick={onRequestPasswordVerification}
            className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-gray-50/50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50/80 text-blue-600">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Pedidos finalizados</h3>
                <p className="mt-0.5 text-xs text-gray-500 leading-snug">
                  Os pedidos finalizados são mostrados apenas após informar sua senha.
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
          </button>
          <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3">
            <button
              onClick={onRequestPasswordVerification}
              className="flex items-center gap-2 text-xs font-semibold text-gray-600 hover:store-text-primary transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Informe sua senha
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="font-medium text-gray-700">Nenhum pedido por aqui</p>
          <p className="mt-1 text-sm text-gray-500">
            Seus pedidos {state === 'active' ? 'em andamento' : 'finalizados'} aparecerão nesta área.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {orders.map((order) => (
            <article key={order.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
              <button onClick={() => setSelectedOrder(order)} className="flex w-full items-center gap-4 p-4 text-left">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    order.status === 'Entregue' ? 'store-bg-soft store-text-primary' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {order.status === 'Entregue' ? <CheckCircle className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800">Pedido #{order.orderNumber}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleString('pt-BR')} ·{' '}
                    {(order.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <p className="mt-1 text-xs font-medium store-text-primary">{order.status}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => repeat(order)}
                  className="flex-1 px-3 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Pedir novamente
                </button>
                {order.trackingToken && !['Entregue', 'Cancelado'].includes(order.status) && (
                  <button
                    onClick={() =>
                      onTrackingRequest?.({
                        orderId: order.id,
                        trackingToken: order.trackingToken,
                      })
                    }
                    className="flex-1 border-l border-gray-100 px-3 py-3 text-xs font-semibold store-text-primary hover:store-bg-soft"
                  >
                    Acompanhar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-500">
            {page} de {pagination.pages}
          </span>
          <button
            disabled={page >= pagination.pages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      <OrderDetailsModal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        order={modalOrder}
        onSubmitReview={submitReview}
      />
    </div>
  );
}
