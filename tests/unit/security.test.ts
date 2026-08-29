import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { safeUrlSchema } from '../../server/routes/tenantOperations';
import { publicSettingsDto, publicProductDto, publicStoreProductsDto, publicCategoryDto, publicHomeBlockDto } from '../../server/routes/public';
import { getPublicTracking } from '../../server/services/orderService';
import { requireCsrf } from '../../server/middleware/csrf';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Order from '../../src/models/Order';
import crypto from 'node:crypto';

let mongo: MongoMemoryReplSet | undefined;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('Security Requirements Unit Tests', () => {
  describe('HomeBlock URL Schema Validation', () => {
    it('rejects javascript: schemes', () => {
      const res = safeUrlSchema.safeParse('javascript:alert(1)');
      expect(res.success).toBe(false);
    });

    it('rejects data: schemes', () => {
      const res = safeUrlSchema.safeParse('data:text/html,<script>alert(1)</script>');
      expect(res.success).toBe(false);
    });

    it('rejects vbscript: schemes', () => {
      const res = safeUrlSchema.safeParse('vbscript:msgbox("xss")');
      expect(res.success).toBe(false);
    });

    it('accepts valid https:// URLs', () => {
      const res = safeUrlSchema.safeParse('https://exemplo.com/pagina');
      expect(res.success).toBe(true);
      expect(res.data).toBe('https://exemplo.com/pagina');
    });

    it('accepts valid http:// URLs', () => {
      const res = safeUrlSchema.safeParse('http://exemplo.com');
      expect(res.success).toBe(true);
    });

    it('accepts valid relative path /cardapio', () => {
      const res = safeUrlSchema.safeParse('/cardapio');
      expect(res.success).toBe(true);
    });

    it('accepts valid relative hash #secao', () => {
      const res = safeUrlSchema.safeParse('#promocoes');
      expect(res.success).toBe(true);
    });
  });

  describe('Public API Explicit DTOs', () => {
    it('publicSettingsDto does not leak tenantId or internal DB timestamps', () => {
      const rawSettings = {
        _id: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        nome_loja: 'Loja Teste',
        is_open: true,
        __v: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const dto = publicSettingsDto(rawSettings);
      expect(dto).not.toBeNull();
      expect(dto).not.toHaveProperty('tenantId');
      expect(dto).not.toHaveProperty('__v');
      expect(dto).not.toHaveProperty('createdAt');
      expect(dto).not.toHaveProperty('updatedAt');
      expect(dto?.nome_loja).toBe('Loja Teste');
    });

    it('publicProductDto does not leak tenantId or internal stock quantities', () => {
      const rawProduct = {
        _id: new mongoose.Types.ObjectId(),
        tenantId: new mongoose.Types.ObjectId(),
        nome: 'Hambúrguer X',
        preco: 30,
        controlar_estoque: true,
        estoque: 15,
        estoque_minimo: 5,
        __v: 0,
        createdAt: new Date(),
      };
      const dto = publicProductDto(rawProduct);
      expect(dto).not.toHaveProperty('tenantId');
      expect(dto).not.toHaveProperty('controlar_estoque');
      expect(dto).not.toHaveProperty('estoque');
      expect(dto).not.toHaveProperty('estoque_minimo');
      expect(dto).not.toHaveProperty('__v');
      expect(dto.nome).toBe('Hambúrguer X');
      expect(dto.esgotado).toBe(false);
      expect(dto.estoque_baixo).toBe(false);
    });

    it('store bootstrap preserves combo stages and component additional groups', () => {
      const componentId = new mongoose.Types.ObjectId();
      const stageId = new mongoose.Types.ObjectId();
      const products = publicStoreProductsDto([
        {
          _id: componentId,
          tipo: 'produto',
          nome: 'X-Bacon',
          preco: 30,
          grupos_adicionais: [{
            _id: new mongoose.Types.ObjectId(),
            nome: 'Extras',
            obrigatorio: false,
            minimo: 0,
            maximo: 2,
            itens: [{ _id: new mongoose.Types.ObjectId(), nome: 'Bacon', preco: 4, ativo: true }],
          }],
        },
        {
          _id: new mongoose.Types.ObjectId(),
          tipo: 'combo',
          nome: 'Combo X-Bacon',
          preco: 30,
          combo_etapas: [{
            _id: stageId,
            nome: 'Escolha o lanche',
            ordem: 0,
            valor_etapa_centavos: 3000,
            cobrar_complementos: true,
            opcoes: [{ produtoId: componentId, acrescimo_centavos: 0, ordem: 0 }],
          }],
        },
      ]);

      expect(products[0].grupos_adicionais[0].itens[0].nome).toBe('Bacon');
      expect(products[1].combo_etapas[0].nome).toBe('Escolha o lanche');
      expect(products[1].combo_etapas[0].opcoes[0].produtoId).toBe(String(componentId));
    });

    it('publicCategoryDto & publicHomeBlockDto exclude tenantId and internal timestamps', () => {
      const catDto = publicCategoryDto({ _id: 'cat1', tenantId: 't1', nome: 'Bebidas', __v: 0 });
      expect(catDto).not.toHaveProperty('tenantId');
      expect(catDto).not.toHaveProperty('__v');
      expect(catDto.nome).toBe('Bebidas');

      const blockDto = publicHomeBlockDto({ _id: 'b1', tenantId: 't1', titulo: 'Promo', __v: 0 });
      expect(blockDto).not.toHaveProperty('tenantId');
      expect(blockDto).not.toHaveProperty('__v');
      expect(blockDto.titulo).toBe('Promo');
    });
  });

  describe('CSRF Structured Origin Validation', () => {
    const originalAppOrigin = process.env.APP_ORIGIN;

    afterEach(() => {
      process.env.APP_ORIGIN = originalAppOrigin;
    });

    it('rejects origin with matching substring host (e.g. evil-loja.com when host is loja.com)', () => {
      process.env.APP_ORIGIN = 'https://loja.com';
      let errorPassed: any = null;
      const req: any = {
        originalUrl: '/api/tenant/stores/loja/settings',
        query: {},
        cookies: { delivery_csrf: 'token123' },
        get: (h: string) => {
          if (h === 'x-csrf-token') return 'token123';
          if (h === 'origin') return 'https://evil-loja.com';
          if (h === 'host') return 'loja.com';
          if (h === 'x-forwarded-proto') return 'https';
          return undefined;
        },
      };
      const res: any = {};
      const next = (err?: any) => { errorPassed = err; };

      requireCsrf(req, res, next);
      expect(errorPassed).not.toBeNull();
      expect(errorPassed?.code).toBe('CSRF_FAILED');
    });

    it('accepts legitimate matching origin', () => {
      process.env.APP_ORIGIN = 'https://loja.com';
      let errorPassed: any = null;
      let nextCalled = false;
      const req: any = {
        originalUrl: '/api/tenant/stores/loja/settings',
        query: {},
        cookies: { delivery_csrf: 'token123' },
        get: (h: string) => {
          if (h === 'x-csrf-token') return 'token123';
          if (h === 'origin') return 'https://loja.com';
          if (h === 'host') return 'loja.com';
          if (h === 'x-forwarded-proto') return 'https';
          return undefined;
        },
      };
      const res: any = {};
      const next = (err?: any) => {
        errorPassed = err;
        nextCalled = true;
      };

      requireCsrf(req, res, next);
      expect(errorPassed).toBeUndefined();
      expect(nextCalled).toBe(true);
    });
  });

  describe('Public Tracking DTO (No PII)', () => {
    it('getPublicTracking returns order details without customer PII', async () => {
      const tenantId = new mongoose.Types.ObjectId();
      const token = 'abcdef1234567890abcdef1234567890abcdef1234567890';
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      await Order.create({
        tenantId,
        orderNumber: 1001,
        trackingTokenPrefix: token.slice(0, 12),
        trackingTokenHash: hash,
        trackingToken: token,
        status: 'Pendente',
        tipo_entrega: 'delivery',
        historico_status: [{ status: 'Pendente' }],
        itens: [{ produtoId: new mongoose.Types.ObjectId(), nome: 'Pizza', quantidade: 1, preco_unitario: 50, subtotal: 50 }],
        total: 55,
        frete: 5,
        metodo_pagamento: 'pix',
        cliente: {
          nome: 'João Silva',
          telefone: '11999999999',
          endereco: 'Rua Secreta, 123',
        },
      });

      const tracking = await getPublicTracking(tenantId, token);

      expect(tracking).toBeDefined();
      expect(tracking.orderNumber).toBe(1001);
      expect(tracking.status).toBe('Pendente');
      expect(tracking.deliveryType).toBe('delivery');
      expect(tracking.total).toBe(55);
      expect(tracking).not.toHaveProperty('cliente');
      expect(tracking).not.toHaveProperty('nome');
      expect(tracking).not.toHaveProperty('telefone');
      expect(tracking).not.toHaveProperty('endereco');
    });
  });
});
