import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Product from '../../src/models/Product.js';
import Order from '../../src/models/Order.js';
import Coupon from '../../src/models/Coupon.js';
import ComplementGroup from '../../src/models/ComplementGroup.js';
import StoreSettings from '../../src/models/StoreSettings.js';
import User from '../../src/models/User.js';
import OrderSequence from '../models/OrderSequence.js';
import DailyOrderSequence from '../models/DailyOrderSequence.js';
import ShippingQuote from '../models/ShippingQuote.js';
import IdempotencyRecord from '../models/IdempotencyRecord.js';
import { reaisToCents } from '../domain/money.js';
import { HttpError } from '../middleware/errors.js';
import { computeIsStoreOpen } from '../../src/lib/storeStatus.js';
import { getOperationalDate } from '../domain/operationalDay.js';
import { hashAddress } from './geocodingService.js';
import { calculateDeliveryEstimate, readEstimateSettings } from '../../src/lib/deliveryEstimates.js';

export type CreateOrderInput = {
  items: Array<{
    productId: string;
    quantity: number;
    redeem?: boolean;
    options: Array<{ groupId: string; itemId: string; quantity: number }>;
    comboSelections?: Array<{
      stageId: string;
      selectedProductId: string;
      options: Array<{ groupId: string; itemId: string; quantity: number }>;
    }>;
  }>;
  deliveryType: 'pickup' | 'delivery' | 'dine_in' | 'local';
  paymentMethod: 'pix' | 'card' | 'credit_card' | 'debit_card' | 'cash' | 'food_voucher' | 'meal_voucher';
  addressId?: string;
  deliveryAddress?: { logradouro: string; numero: string; complemento?: string; referencia?: string; bairro: string; cidade: string; estado: string; cep: string; latitude?: number; longitude?: number; locationConfirmed?: boolean };
  shippingQuoteId?: string;
  couponCode?: string;
  notes?: string;
  changeForCents?: number;
  cutlery?: boolean;
};

function requestHash(input: CreateOrderInput): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function productUnavailable(product: any) {
  return !product || product.ativo === false || product.esgotado === true || (product.controlar_estoque && Number(product.estoque || 0) <= 0);
}

function getProductEffectiveGroups(product: any, globalGroups: any[] = []) {
  const ownGroups = Array.from(product.grupos_adicionais || []) as any[];
  const productId = String(product._id);
  const categoryId = product.categoriaId?._id ? String(product.categoriaId._id) : product.categoriaId ? String(product.categoriaId) : null;
  const matchingGlobals = globalGroups.filter((g) => {
    const matchesProduct = Array.isArray(g.produtos_vinculados) && g.produtos_vinculados.some((id: any) => String(id) === productId);
    const matchesCategory = categoryId && Array.isArray(g.categorias_vinculadas) && g.categorias_vinculadas.some((id: any) => String(id) === categoryId);
    return matchesProduct || matchesCategory;
  });
  return [...ownGroups, ...matchingGlobals];
}

function validateProductOptions(
  product: any,
  selectedOptions: Array<{ groupId: string; itemId: string; quantity: number }>,
  charge: boolean,
  globalGroups: any[] = [],
) {
  const groups = getProductEffectiveGroups(product, globalGroups);
  const knownGroups = new Set(groups.map((group) => String(group._id)));
  if (selectedOptions.some((option) => !knownGroups.has(option.groupId))) {
    throw new HttpError(409, `Adicional invalido em ${product.nome}.`, 'INVALID_OPTIONS');
  }
  const uniqueOptions = new Set<string>();
  let totalCents = 0;
  const snapshots: Array<Record<string, unknown>> = [];
  for (const group of groups) {
    const groupId = String(group._id);
    const chosen = selectedOptions.filter((option) => option.groupId === groupId);
    const count = chosen.reduce((sum, option) => sum + option.quantity, 0);
    const minimum = Number(group.minimo || (group.obrigatorio ? 1 : 0));
    if (count < minimum || count > Number(group.maximo || 1)) {
      throw new HttpError(409, `Selecao invalida em ${group.nome}.`, 'INVALID_OPTIONS');
    }
    for (const option of chosen) {
      const identity = `${groupId}:${option.itemId}`;
      if (uniqueOptions.has(identity)) throw new HttpError(409, `Adicional duplicado em ${group.nome}.`, 'INVALID_OPTIONS');
      uniqueOptions.add(identity);
      const item = Array.from(group.itens || []).find((candidate: any) => String(candidate._id) === option.itemId) as any;
      if (!item || item.ativo === false) throw new HttpError(409, 'Adicional indisponivel.', 'OPTION_UNAVAILABLE');
      const itemMax = Number(item.maximo || 0);
      if (itemMax > 0 && option.quantity > itemMax) {
        throw new HttpError(409, `Limite maximo excedido para ${item.nome} (maximo ${itemMax}).`, 'ITEM_LIMIT_EXCEEDED');
      }
      const configuredCents = Number.isSafeInteger(item.preco_centavos) && (item.preco_centavos > 0 || !item.preco) ? item.preco_centavos : reaisToCents(item.preco || 0);
      const chargedCents = charge ? configuredCents : 0;
      totalCents += chargedCents * option.quantity;
      snapshots.push({
        groupId: group._id,
        itemId: item._id,
        grupo_nome: group.nome,
        item_nome: item.nome,
        opcao: `${group.nome}: ${item.nome}`,
        quantidade: option.quantity,
        preco_centavos: chargedCents,
        preco_unitario_centavos: chargedCents,
      });
    }
  }
  return { totalCents, snapshots };
}

export async function createAuthoritativeOrder(
  tenantId: mongoose.Types.ObjectId,
  accountId: mongoose.Types.ObjectId,
  idempotencyKey: string,
  input: CreateOrderInput,
  options: { timezone?: string; now?: Date } = {},
) {
  const hash = requestHash(input);
  const previous = await IdempotencyRecord.findOne({ tenantId, scope: 'create-order', key: idempotencyKey }).lean();
  if (previous) {
    if (previous.requestHash !== hash) throw new HttpError(409, 'Idempotency-Key reutilizada com outro pedido.', 'IDEMPOTENCY_CONFLICT');
    if (previous.status === 'completed') return previous.responseBody;
    throw new HttpError(409, 'Pedido com esta chave ainda esta em processamento.', 'IDEMPOTENCY_PROCESSING');
  }

  const session = await mongoose.startSession();
  const trackingToken = crypto.randomBytes(32).toString('base64url');
  try {
    let response: Record<string, unknown> = {};
    await session.withTransaction(async () => {
      await IdempotencyRecord.create([{ tenantId, scope: 'create-order', key: idempotencyKey, requestHash: hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
      const settings = await StoreSettings.findOne({ tenantId }).session(session).lean();
      const isStoreOpen = computeIsStoreOpen(settings);
      if (!settings || !isStoreOpen) {
        throw new HttpError(409, settings?.mensagem_fechado || 'A loja esta fechada.', 'STORE_CLOSED');
      }
      if (input.deliveryType === 'pickup' && settings.logisticsOptions?.allowPickup === false) throw new HttpError(409, 'Retirada indisponivel.', 'PICKUP_DISABLED');
      if (input.deliveryType === 'delivery' && settings.logisticsOptions?.allowDelivery === false) throw new HttpError(409, 'Entrega indisponivel.', 'DELIVERY_DISABLED');
      if ((input.deliveryType === 'dine_in' || input.deliveryType === 'local') && settings.logisticsOptions?.allowDineIn === false) throw new HttpError(409, 'Consumo no local indisponivel.', 'DINE_IN_DISABLED');
      const legacyCardEnabled = settings.pagamento_cartao !== false;
      const creditCardEnabled = typeof settings.pagamento_cartao_credito === 'boolean'
        ? settings.pagamento_cartao_credito
        : legacyCardEnabled;
      const debitCardEnabled = typeof settings.pagamento_cartao_debito === 'boolean'
        ? settings.pagamento_cartao_debito
        : legacyCardEnabled;
      const allowedPayment = {
        pix: settings.pagamento_pix,
        card: creditCardEnabled || debitCardEnabled,
        credit_card: creditCardEnabled,
        debit_card: debitCardEnabled,
        cash: settings.pagamento_dinheiro,
        food_voucher: settings.pagamento_vale_alimentacao,
        meal_voucher: settings.pagamento_vale_refeicao,
      };
      if (!allowedPayment[input.paymentMethod]) throw new HttpError(409, 'Forma de pagamento indisponivel.', 'PAYMENT_DISABLED');
      const customer = await User.findOne({ _id: accountId, tenantId }).session(session);
      if (!customer) throw new HttpError(401, 'Conta nao encontrada.', 'INVALID_SESSION');
      const savedAddress = input.deliveryType === 'delivery' && input.addressId ? customer.enderecos.id(input.addressId) : null;
      const address = savedAddress || (input.deliveryType === 'delivery' ? input.deliveryAddress : null);
      if (input.deliveryType === 'delivery' && !address) throw new HttpError(409, 'Selecione ou informe um endereco.', 'ADDRESS_REQUIRED');
      let addressSnapshot = 'Retirada na loja';
      if (input.deliveryType === 'delivery') {
        addressSnapshot = address ? `${address.logradouro}, ${address.numero}${address.complemento ? ` - ${address.complemento}` : ''} - ${address.bairro}, ${address.cidade}/${address.estado} - ${address.cep}${address.referencia ? ` (Referencia: ${address.referencia})` : ''}` : 'Entrega';
      } else if (input.deliveryType === 'dine_in' || input.deliveryType === 'local') {
        addressSnapshot = 'Comer no local (Consumo no estabelecimento)';
      }

      const parentIds = [...new Set(input.items.map((item) => item.productId))];
      const componentIds = [...new Set(input.items.flatMap((item) => (item.comboSelections || []).map((selection) => selection.selectedProductId)))];
      const catalogIds = [...new Set([...parentIds, ...componentIds])];
      const [products, globalGroups] = await Promise.all([
        Product.find({ _id: { $in: catalogIds }, tenantId }).populate('categoriaId', 'nome').session(session),
        ComplementGroup.find({ tenantId, ativo: { $ne: false } }).session(session).lean(),
      ]);
      const byId = new Map(products.map((product) => [product._id.toString(), product]));
      if (parentIds.some((id) => !byId.has(id))) throw new HttpError(409, 'Um ou mais produtos estao indisponiveis.', 'PRODUCT_UNAVAILABLE');
      let subtotalCents = 0;
      let pointsToRedeem = 0;
      const snapshots: Array<Record<string, unknown>> = [];
      const stockDemand = new Map<string, number>();
      const addStockDemand = (productId: string, quantity: number) => stockDemand.set(productId, (stockDemand.get(productId) || 0) + quantity);

      for (const selected of input.items) {
        const product = byId.get(selected.productId)!;
        if (productUnavailable(product)) throw new HttpError(409, `${product.nome} esta indisponivel.`, 'PRODUCT_UNAVAILABLE');
        const productType = product.tipo === 'combo' ? 'combo' : 'produto';
        const redeeming = Boolean(selected.redeem);
        if (productType === 'combo') {
          if (redeeming) throw new HttpError(409, 'Combos nao podem ser resgatados por pontos.', 'COMBO_REDEMPTION_UNAVAILABLE');
          if (selected.options.length > 0) throw new HttpError(409, 'Configuracao invalida do combo.', 'INVALID_COMBO_SELECTIONS');
          const configuredStages = [...(product.combo_etapas || [])].sort((a: any, b: any) => Number(a.ordem || 0) - Number(b.ordem || 0));
          const selections = selected.comboSelections || [];
          const selectedStageIds = selections.map((selection) => selection.stageId);
          if (configuredStages.length === 0 || selections.length !== configuredStages.length || new Set(selectedStageIds).size !== selectedStageIds.length) {
            throw new HttpError(409, 'Complete todas as etapas do combo.', 'INCOMPLETE_COMBO');
          }
          let comboUnitCents = 0;
          const stageSnapshots: Array<Record<string, unknown>> = [];
          for (const stage of configuredStages) {
            const stageId = String(stage._id);
            const selection = selections.find((item) => item.stageId === stageId);
            if (!selection) throw new HttpError(409, `Complete a etapa ${stage.nome}.`, 'INCOMPLETE_COMBO');
            const configuredOption = Array.from(stage.opcoes || []).find((option: any) => String(option.produtoId) === selection.selectedProductId) as any;
            if (!configuredOption) throw new HttpError(409, `Produto invalido na etapa ${stage.nome}.`, 'INVALID_COMBO_PRODUCT');
            const component = byId.get(selection.selectedProductId);
            if (!component || component.tipo === 'combo') throw new HttpError(409, 'Produto do combo invalido.', 'INVALID_COMBO_PRODUCT');
            if (productUnavailable(component)) throw new HttpError(409, `${component.nome} esta indisponivel.`, 'PRODUCT_UNAVAILABLE');
            const additions = validateProductOptions(component, selection.options || [], stage.cobrar_complementos !== false, globalGroups);
            const stageCents = Number(stage.valor_etapa_centavos || 0);
            const extraCents = Number(configuredOption.acrescimo_centavos || 0);
            comboUnitCents += stageCents + extraCents + additions.totalCents;
            addStockDemand(String(component._id), selected.quantity);
            stageSnapshots.push({
              stageId: stage._id,
              nome: stage.nome,
              valor_etapa_centavos: stageCents,
              cobrar_complementos: stage.cobrar_complementos !== false,
              produtoId: component._id,
              produto_nome: component.nome,
              acrescimo_centavos: extraCents,
              adicionais: additions.snapshots,
            });
          }
          const itemTotalCents = comboUnitCents * selected.quantity;
          subtotalCents += itemTotalCents;
          const category = product.categoriaId as any;
          snapshots.push({
            produtoId: product._id,
            nome: product.nome,
            categoriaId: category?._id || category || null,
            categoria_nome: category?.nome || '',
            quantidade: selected.quantity,
            tipo_item: 'combo',
            combo_snapshot: { etapas: stageSnapshots },
            opcoes_escolhidas: [],
            preco_unitario: comboUnitCents / 100,
            preco_unitario_centavos: comboUnitCents,
            subtotal: itemTotalCents / 100,
            subtotal_centavos: itemTotalCents,
            resgatado: false,
          });
          continue;
        }
        if (product.exclusivo_combo) throw new HttpError(409, `${product.nome} e exclusivo para combos e nao pode ser comprado avulso.`, 'ITEM_EXCLUSIVE_TO_COMBO');
        if ((selected.comboSelections || []).length > 0) throw new HttpError(409, 'Configuracao de combo enviada para um produto comum.', 'INVALID_COMBO_SELECTIONS');
        if (redeeming && (!settings.fidelidade_ativa || !product.pode_resgatar || Number(product.pontos_resgate || 0) <= 0)) throw new HttpError(409, `${product.nome} nao esta disponivel para resgate.`, 'REDEMPTION_UNAVAILABLE');
        const baseCents = redeeming ? 0 : (Number.isSafeInteger(product.preco_centavos) ? product.preco_centavos : reaisToCents(product.preco));
        if (redeeming) pointsToRedeem += Number(product.pontos_resgate) * selected.quantity;
        const additions = validateProductOptions(product, selected.options, !redeeming, globalGroups);
        const unitCents = baseCents + additions.totalCents;
        const itemTotalCents = unitCents * selected.quantity;
        subtotalCents += itemTotalCents;
        const category = product.categoriaId as any;
        snapshots.push({
          produtoId: product._id,
          nome: product.nome,
          categoriaId: category?._id || category || null,
          categoria_nome: category?.nome || '',
          quantidade: selected.quantity,
          tipo_item: 'produto',
          opcoes_escolhidas: additions.snapshots,
          preco_unitario: unitCents / 100,
          preco_unitario_centavos: unitCents,
          subtotal: itemTotalCents / 100,
          subtotal_centavos: itemTotalCents,
          resgatado: redeeming,
          pontos_resgate: redeeming ? Number(product.pontos_resgate || 0) : 0,
          valor_resgate_centavos: redeeming ? (Number.isSafeInteger(product.preco_centavos) ? product.preco_centavos : reaisToCents(product.preco)) * selected.quantity : 0,
        });
        addStockDemand(String(product._id), selected.quantity);
      }

      for (const [productId, quantity] of stockDemand) {
        const product = byId.get(productId)!;
        if (product.controlar_estoque) {
          const changed = await Product.updateOne(
            { _id: product._id, tenantId, estoque: { $gte: quantity } },
            [{ $set: { estoque: { $subtract: ['$estoque', quantity] }, esgotado: { $or: ['$esgotado', { $lte: [{ $subtract: ['$estoque', quantity] }, 0] }] } } }],
          { session, updatePipeline: true },
          );
          if (changed.modifiedCount !== 1) throw new HttpError(409, `Estoque insuficiente para ${product.nome}.`, 'OUT_OF_STOCK');
        }
      }

      if (pointsToRedeem > 0) {
        const debited = await User.updateOne({ _id: customer._id, tenantId, pontos: { $gte: pointsToRedeem } }, { $inc: { pontos: -pointsToRedeem } }, { session });
        if (debited.modifiedCount !== 1) throw new HttpError(409, 'Saldo de pontos insuficiente.', 'INSUFFICIENT_POINTS');
      }

      let shippingCents = 0;
      const preparation = calculateDeliveryEstimate(readEstimateSettings(settings), 'pickup');
      if (input.deliveryType !== 'delivery' && settings.prazo_entrega_modo === 'preparo_deslocamento' && preparation.deliveryTimeMin == null) {
        throw new HttpError(409, 'Configuracao de prazo invalida.', 'INVALID_DELIVERY_ESTIMATE');
      }
      let deliveryTimeMin = preparation.deliveryTimeMin;
      let deliveryTimeMax = preparation.deliveryTimeMax;
      let estimateMode = settings.prazo_entrega_modo || 'total';
      let deliveryRegionName = '';
      let deliveryLocation: { latitude: number; longitude: number } | undefined;
      if (input.deliveryType === 'delivery') {
        if (!input.shippingQuoteId || !mongoose.isValidObjectId(input.shippingQuoteId)) throw new HttpError(409, 'Cotacao de entrega obrigatoria.', 'SHIPPING_QUOTE_REQUIRED');
        const normalizedAddressHash = hashAddress({
          postalCode: address.cep,
          street: address.logradouro,
          number: address.numero,
          district: address.bairro,
          city: address.cidade,
          state: address.estado,
        });
        const quote = await ShippingQuote.findOneAndUpdate({ _id: input.shippingQuoteId, tenantId, normalizedAddressHash, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { returnDocument: 'after', session });
        if (!quote) throw new HttpError(409, 'Cotacao de entrega invalida ou expirada.', 'INVALID_SHIPPING_QUOTE');
        shippingCents = quote.feeCents;
        deliveryTimeMin = quote.deliveryTimeMin;
        deliveryTimeMax = quote.deliveryTimeMax;
        estimateMode = quote.estimateMode || 'total';
        deliveryRegionName = String(quote.regionName || '');
        if (Number.isFinite(quote.destination?.latitude) && Number.isFinite(quote.destination?.longitude)) {
          deliveryLocation = { latitude: Number(quote.destination?.latitude), longitude: Number(quote.destination?.longitude) };
        }
        if (settings.frete_gratis_acima_de > 0 && subtotalCents >= reaisToCents(settings.frete_gratis_acima_de)) shippingCents = 0;
      }

      let discountCents = 0;
      let normalizedCoupon = '';
      if (input.couponCode) {
        if (pointsToRedeem > 0) {
          throw new HttpError(409, 'Nao e possivel usar cupom de desconto em pedidos com resgate de pontos.', 'COUPON_WITH_POINTS');
        }
        normalizedCoupon = input.couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({
          tenantId,
          normalizedCode: normalizedCoupon,
          ativo: true,
          $and: [
            { $or: [{ validade: null }, { validade: { $gte: new Date() } }] },
            { $or: [{ usos_restantes: -1 }, { usos_restantes: { $gt: 0 } }] },
          ],
        }).session(session);
        if (!coupon) throw new HttpError(409, 'Cupom invalido.', 'INVALID_COUPON');
        const minimumCents = reaisToCents(coupon.minimo_pedido || 0);
        if (subtotalCents < minimumCents) throw new HttpError(409, 'Pedido abaixo do minimo do cupom.', 'COUPON_MINIMUM');
        discountCents = coupon.tipo === 'porcentagem' ? Math.round(subtotalCents * Math.min(coupon.valor, 100) / 100) : (coupon.valor_centavos ?? reaisToCents(coupon.valor));
        discountCents = Math.min(discountCents, subtotalCents);
        if (coupon.usos_restantes > 0) coupon.usos_restantes -= 1;
        await coupon.save({ session });
      }

      const minimumOrderCents = reaisToCents(settings.pedido_minimo || 0);
      if (subtotalCents < minimumOrderCents) throw new HttpError(409, 'Pedido minimo nao atingido.', 'MINIMUM_ORDER');
      const hasEligibleCutleryItem = input.items.some((item) => Boolean(byId.get(item.productId)?.permite_talheres));
      const cutleryCents = input.cutlery && settings.talheres_ativo && hasEligibleCutleryItem
        ? reaisToCents(settings.talheres_valor || 0)
        : 0;
      if (input.cutlery && !cutleryCents && (!settings.talheres_ativo || !hasEligibleCutleryItem)) {
        throw new HttpError(409, 'Talheres indisponiveis para este pedido.', 'CUTLERY_UNAVAILABLE');
      }
      const totalCents = subtotalCents + shippingCents + cutleryCents - discountCents;
      if (input.paymentMethod === 'cash' && input.changeForCents && input.changeForCents < totalCents) throw new HttpError(409, 'O valor para troco deve ser maior ou igual ao total.', 'INVALID_CHANGE');
      const createdAt = options.now || new Date();
      const operationalDate = getOperationalDate(createdAt, options.timezone || 'America/Sao_Paulo');
      const sequence = await OrderSequence.findOneAndUpdate({ tenantId }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true });
      const dailySequence = await DailyOrderSequence.findOneAndUpdate(
        { tenantId, operationalDate },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true },
      );
      const [order] = await Order.create([{
        tenantId,
        orderNumber: sequence.value,
        dailyOrderNumber: dailySequence.value,
        operationalDate,
        createdAt,
        trackingTokenPrefix: trackingToken.slice(0, 12),
        trackingTokenHash: crypto.createHash('sha256').update(trackingToken).digest('hex'),
        trackingToken,
        usuarioId: customer._id,
        cliente: { nome: customer.nome, telefone: customer.telefone, endereco: addressSnapshot },
        itens: snapshots,
        total: totalCents / 100,
        total_centavos: totalCents,
        frete: shippingCents / 100,
        frete_centavos: shippingCents,
        prazo_entrega_min: deliveryTimeMin,
        prazo_entrega_modo: estimateMode,
        prazo_entrega_max: deliveryTimeMax,
        regiao_entrega: deliveryRegionName,
        localizacao_entrega: deliveryLocation,
        desconto_cupom: discountCents / 100,
        cupom_codigo: normalizedCoupon,
        metodo_pagamento: input.paymentMethod,
        tipo_entrega: input.deliveryType,
        observacoes: input.notes || '',
        troco_para: Number(input.changeForCents || 0) / 100,
        talheres: Boolean(input.cutlery) && Boolean(settings.talheres_ativo) && hasEligibleCutleryItem,
        talheres_valor_centavos: cutleryCents,
        pontos_utilizados: pointsToRedeem,
        historico_status: [{ status: 'Pendente' }],
      }], { session });
      response = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        dailyOrderNumber: order.dailyOrderNumber,
        operationalDate: order.operationalDate,
        trackingToken,
        totalCents,
      };
      await IdempotencyRecord.updateOne({ tenantId, scope: 'create-order', key: idempotencyKey }, { $set: { status: 'completed', responseStatus: 201, responseBody: response } }, { session });
    });
    return response;
  } catch (error) {
    await IdempotencyRecord.updateOne({ tenantId, scope: 'create-order', key: idempotencyKey, status: 'processing' }, { $set: { status: 'failed' } }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function getPublicTracking(tenantId: mongoose.Types.ObjectId, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const order = await Order.findOne({ tenantId, trackingTokenPrefix: token.slice(0, 12) }).select('+trackingTokenHash orderNumber dailyOrderNumber operationalDate status tipo_entrega historico_status createdAt updatedAt itens total frete metodo_pagamento prazo_entrega_min prazo_entrega_max regiao_entrega').lean();
  if (!order?.trackingTokenHash || !crypto.timingSafeEqual(Buffer.from(order.trackingTokenHash), Buffer.from(hash))) throw new HttpError(404, 'Pedido nao encontrado.', 'NOT_FOUND');
  return { orderNumber: order.orderNumber, dailyOrderNumber: order.dailyOrderNumber, operationalDate: order.operationalDate, status: order.status, deliveryType: order.tipo_entrega, history: order.historico_status, createdAt: order.createdAt, updatedAt: order.updatedAt, itens: order.itens, total: order.total, frete: order.frete, metodo_pagamento: order.metodo_pagamento, deliveryTimeMin: order.prazo_entrega_min, deliveryTimeMax: order.prazo_entrega_max, deliveryRegionName: order.regiao_entrega || '' };
}

