import React from 'react';
import { Printer } from 'lucide-react';
import { paymentMethodLabel } from '../lib/paymentMethods';
import {
  ThermalPaperWidth,
  formatCurrency,
  formatDateTime,
} from '../lib/thermalPrint';
import { formatOrderReference } from '../lib/orderReference';

export interface PrintOrderProps {
  order: any;
  storeName?: string;
  paperWidth?: ThermalPaperWidth;
  buttonLabel?: string;
  buttonClassName?: string;
  hideButton?: boolean;
  onBeforePrint?: () => void;
}

export function ThermalReceiptContent({
  order,
  storeName,
  paperWidth = '80mm',
}: {
  order: any;
  storeName?: string;
  paperWidth?: ThermalPaperWidth;
}) {
  if (!order) return null;

  const is58 = paperWidth === '58mm';
  const effectiveStoreName =
    storeName || order.storeName || order.tenantName || 'PodeVir Delivery';

  const orderNum = formatOrderReference(order);

  const isPickup = order.tipo_entrega === 'pickup' || order.tipo_entrega === 'retirada';
  const isDineIn = order.tipo_entrega === 'dine_in' || order.tipo_entrega === 'local';

  // Subtotal calculation
  const subtotal =
    order.subtotal !== undefined && order.subtotal !== null
      ? Number(order.subtotal)
      : (order.total || 0) -
        (order.frete || 0) +
        (order.desconto_cupom || 0) +
        (order.valor_desconto_pontos || 0);

  // Cash / Dinheiro & Troco check
  const rawMethod = String(order.metodo_pagamento || '').toLowerCase();
  const isCash = ['cash', 'dinheiro', 'money'].includes(rawMethod);
  const trocoPara = Number(
    order.troco_para !== undefined && order.troco_para !== null
      ? order.troco_para
      : order.troco || order.changeForCents ? (order.changeForCents / 100) : 0
  );
  const levarTroco = trocoPara > (order.total || 0) ? trocoPara - (order.total || 0) : 0;

  // Cutlery / Talheres
  const cutlery =
    order.talheres === true ||
    order.incluir_talheres === true ||
    order.cutlery === true;

  const divider = is58
    ? '--------------------------------'
    : '------------------------------------------------';
  const doubleDivider = is58
    ? '================================'
    : '================================================';

  return (
    <div
      className="thermal-receipt-body text-black bg-white select-text"
      style={{
        width: is58 ? '52mm' : '74mm',
        maxWidth: is58 ? '52mm' : '74mm',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: is58 ? '11px' : '12.5px',
        lineHeight: is58 ? '1.2' : '1.3',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        color: '#000',
        padding: '1mm 2mm',
      }}
    >
      {/* 1. CABEÇALHO */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: is58 ? '13px' : '15px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {effectiveStoreName}
        </div>
        <div style={{ fontSize: is58 ? '10px' : '11px', margin: '2px 0' }}>
          {formatDateTime(order.createdAt || new Date())}
        </div>
        <div
          style={{
            fontWeight: 900,
            fontSize: is58 ? '18px' : '22px',
            margin: '4px 0 2px 0',
            letterSpacing: '-0.5px',
          }}
        >
          PEDIDO {orderNum}
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '2px 0' }}>{doubleDivider}</div>

      {/* 2. TIPO DE ATENDIMENTO DESTACADO */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 900,
          fontSize: is58 ? '13px' : '15px',
          padding: '3px 0',
          textTransform: 'uppercase',
          border: '1.5px solid #000',
          margin: '4px 0',
        }}
      >
        {isDineIn
          ? '>>> COMER NO LOCAL (MESA) <<<'
          : isPickup
            ? '>>> RETIRADA NO BALCÃO <<<'
            : '>>> ENTREGA (DELIVERY) <<<'}
      </div>

      <div style={{ textAlign: 'center', margin: '2px 0' }}>{divider}</div>

      {/* 3. DADOS DO CLIENTE */}
      <div style={{ margin: '4px 0' }}>
        <div>
          <span style={{ fontWeight: 800 }}>CLIENTE: </span>
          <span>{order.cliente?.nome || 'Não informado'}</span>
        </div>
        <div>
          <span style={{ fontWeight: 800 }}>TEL/WHATS: </span>
          <span>{order.cliente?.telefone || 'Não informado'}</span>
        </div>

        {!isPickup && !isDineIn && (
          <div style={{ marginTop: '3px' }}>
            <div style={{ fontWeight: 800 }}>ENDEREÇO DE ENTREGA:</div>
            <div
              style={{
                fontSize: is58 ? '11px' : '12px',
                fontWeight: 600,
                marginTop: '1px',
              }}
            >
              {order.cliente?.endereco || 'Endereço não informado'}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', margin: '2px 0' }}>{doubleDivider}</div>

      {/* 4. ITENS DO PEDIDO (COZINHA & MONTAGEM) */}
      <div style={{ margin: '4px 0' }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: is58 ? '12px' : '13px',
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}
        >
          ITENS DO PEDIDO:
        </div>

        {Array.isArray(order.itens) && order.itens.length > 0 ? (
          order.itens.map((item: any, idx: number) => {
            const itemSubtotal =
              item.subtotal !== undefined
                ? item.subtotal
                : (item.preco_unitario || 0) * (item.quantidade || 1);

            return (
              <div
                key={idx}
                style={{
                  marginBottom: '8px',
                  paddingBottom: '4px',
                  borderBottom:
                    idx < order.itens.length - 1 ? '1px dashed #444' : 'none',
                }}
              >
                {/* Linha Principal do Produto */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    fontWeight: 900,
                    fontSize: is58 ? '12px' : '13.5px',
                  }}
                >
                  <span style={{ flex: 1, paddingRight: '4px' }}>
                    [{item.quantidade || 1}x] {item.nome}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    R$ {formatCurrency(itemSubtotal)}
                  </span>
                </div>

                {/* Preço Unitário se Qtd > 1 */}
                {(item.quantidade || 1) > 1 && item.preco_unitario > 0 && (
                  <div
                    style={{
                      fontSize: is58 ? '9.5px' : '10.5px',
                      color: '#000',
                      marginLeft: '4px',
                    }}
                  >
                    (Unitário: R$ {formatCurrency(item.preco_unitario)})
                  </div>
                )}

                {/* Se for Combo com Etapas */}
                {item.tipo_item === 'combo' &&
                  Array.isArray(item.combo_snapshot?.etapas) &&
                  item.combo_snapshot.etapas.map((etapa: any, sIdx: number) => (
                    <div
                      key={sIdx}
                      style={{
                        marginLeft: '6px',
                        marginTop: '2px',
                        fontSize: is58 ? '10.5px' : '11.5px',
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        &gt; {etapa.nome}: {etapa.produto_nome}
                      </div>
                      {Array.isArray(etapa.adicionais) &&
                        etapa.adicionais.map((ad: any, aIdx: number) => (
                          <div
                            key={aIdx}
                            style={{
                              marginLeft: '8px',
                              fontSize: is58 ? '10px' : '11px',
                            }}
                          >
                            • {ad.quantidade || 1}x {ad.item_nome}
                            {ad.preco_unitario_centavos > 0
                              ? ` (+R$ ${formatCurrency(
                                  (ad.preco_unitario_centavos *
                                    (ad.quantidade || 1)) /
                                    100
                                )})`
                              : ''}
                          </div>
                        ))}
                    </div>
                  ))}

                {/* Opcionais/Adicionais do Produto Convencional */}
                {item.tipo_item !== 'combo' &&
                  Array.isArray(item.opcoes_escolhidas) &&
                  item.opcoes_escolhidas.map((op: any, oIdx: number) => (
                    <div
                      key={oIdx}
                      style={{
                        marginLeft: '8px',
                        fontSize: is58 ? '10.5px' : '11.5px',
                        fontWeight: 600,
                      }}
                    >
                      • {op.quantidade || 1}x {op.opcao}
                    </div>
                  ))}

                {/* Observação individual do item */}
                {item.observacao && (
                  <div
                    style={{
                      marginLeft: '8px',
                      marginTop: '2px',
                      fontSize: is58 ? '10px' : '11px',
                      fontWeight: 700,
                    }}
                  >
                    OBS ITEM: {item.observacao}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div>Nenhum item informado</div>
        )}
      </div>

      {/* 5. OBSERVAÇÕES GERAIS DO PEDIDO */}
      {order.observacoes && (
        <div
          style={{
            border: '1.5px solid #000',
            padding: '4px 6px',
            margin: '6px 0',
            fontSize: is58 ? '11px' : '12px',
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>
            ATENÇÃO / OBSERVAÇÃO:
          </div>
          <div style={{ fontWeight: 700, marginTop: '2px' }}>
            {order.observacoes}
          </div>
        </div>
      )}

      {/* 6. TALHERES / DESCARTÁVEIS */}
      <div
        style={{
          margin: '4px 0',
          fontSize: is58 ? '11px' : '12px',
          fontWeight: 800,
        }}
      >
        TALHERES: {cutlery ? '[ SIM - ENVIAR ]' : '[ NÃO PRECISA ]'}
      </div>

      <div style={{ textAlign: 'center', margin: '2px 0' }}>{divider}</div>

      {/* 7. VALORES E TOTAL */}
      <div style={{ margin: '4px 0', fontSize: is58 ? '11px' : '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>R$ {formatCurrency(subtotal)}</span>
        </div>

        {Number(order.desconto_cupom) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cupom ({order.cupom_codigo || 'Desconto'}):</span>
            <span>-R$ {formatCurrency(order.desconto_cupom)}</span>
          </div>
        )}

        {Number(order.valor_desconto_pontos) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Desconto Fidelidade:</span>
            <span>-R$ {formatCurrency(order.valor_desconto_pontos)}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Taxa de Entrega:</span>
          <span>
            {Number(order.frete) > 0
              ? `R$ ${formatCurrency(order.frete)}`
              : 'R$ 0,00 (Grátis)'}
          </span>
        </div>

        <div style={{ textAlign: 'center', margin: '2px 0' }}>{doubleDivider}</div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 900,
            fontSize: is58 ? '14px' : '16px',
            margin: '2px 0',
          }}
        >
          <span>TOTAL:</span>
          <span>R$ {formatCurrency(order.total)}</span>
        </div>

        <div style={{ textAlign: 'center', margin: '2px 0' }}>{doubleDivider}</div>
      </div>

      {/* 8. FORMA DE PAGAMENTO & TROCO */}
      <div style={{ margin: '4px 0', fontSize: is58 ? '11px' : '12px' }}>
        <div>
          <span style={{ fontWeight: 800 }}>PAGAMENTO: </span>
          <span style={{ fontWeight: 900, textTransform: 'uppercase' }}>
            {paymentMethodLabel(order.metodo_pagamento)}
          </span>
        </div>

        {isCash && trocoPara > 0 && (
          <div style={{ marginTop: '2px' }}>
            <div>
              <span style={{ fontWeight: 800 }}>Troco para: </span>
              <span>R$ {formatCurrency(trocoPara)}</span>
            </div>
            {levarTroco > 0 && (
              <div style={{ fontWeight: 900, fontSize: is58 ? '12px' : '13px' }}>
                LEVAR DE TROCO: R$ {formatCurrency(levarTroco)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', margin: '4px 0 2px 0' }}>{divider}</div>

      {/* 9. RODAPÉ */}
      <div
        style={{
          textAlign: 'center',
          fontSize: is58 ? '9.5px' : '10.5px',
          marginTop: '4px',
        }}
      >
        <div>PodeVir Delivery</div>
        <div>Impresso em {formatDateTime(new Date())}</div>
      </div>
    </div>
  );
}

export default function PrintOrder({
  order,
  storeName,
  paperWidth = '80mm',
  buttonLabel = 'Imprimir comanda',
  buttonClassName,
  hideButton = false,
  onBeforePrint,
}: PrintOrderProps) {
  const handlePrint = () => {
    if (onBeforePrint) {
      onBeforePrint();
    }
    // Small timeout ensures any active order state is rendered in print DOM
    setTimeout(() => {
      window.print();
    }, 50);
  };

  return (
    <>
      {!hideButton && (
        <button
          type="button"
          onClick={handlePrint}
          className={
            buttonClassName ||
            'flex items-center justify-center gap-1.5 w-full bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs text-xs cursor-pointer'
          }
          title="Imprimir comanda térmica"
        >
          <Printer className="w-4 h-4" />
          <span>{buttonLabel}</span>
        </button>
      )}

      {/* ÁREA DE IMPRESSÃO (ESCONDIDA NA TELA, APARECE EXCLUSIVAMENTE NA IMPRESSÃO) */}
      <div
        id="thermal-receipt-root"
        className="hidden print:block"
        style={{
          '--receipt-paper-width': paperWidth === '58mm' ? '54mm' : '76mm',
        } as React.CSSProperties}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                @page {
                  margin: 0 !important;
                  size: auto !important;
                }
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #fff !important;
                  color: #000 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                body * {
                  visibility: hidden !important;
                }
                #thermal-receipt-root,
                #thermal-receipt-root * {
                  visibility: visible !important;
                }
                #thermal-receipt-root {
                  display: block !important;
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: ${paperWidth === '58mm' ? '54mm' : '76mm'} !important;
                  max-width: ${paperWidth === '58mm' ? '54mm' : '76mm'} !important;
                  margin: 0 !important;
                  padding: 1.5mm !important;
                  background: #fff !important;
                  color: #000 !important;
                  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
                  box-sizing: border-box !important;
                }
              }
            `,
          }}
        />

        {order && (
          <ThermalReceiptContent
            order={order}
            storeName={storeName}
            paperWidth={paperWidth}
          />
        )}
      </div>
    </>
  );
}
