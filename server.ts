// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

// Importando os Models
import Product from './src/models/Product.js';
import Order from './src/models/Order.js';
import User from './src/models/User.js';
import Category from './src/models/Category.js';
import StoreSettings from './src/models/StoreSettings.js';
import Coupon from './src/models/Coupon.js';
import AuditLog from './src/models/AuditLog.js';
import Admin from './src/models/Admin.js'; // Model para Administradores
import HomeBlock from './src/models/HomeBlock.js';
import { createStoreTheme } from './src/lib/theme.js';
import apiRouter from './server/routes/index.js';
import { requestContext } from './server/middleware/requestContext.js';
import { errorHandler } from './server/middleware/errors.js';
import { connectDatabase, databaseReady } from './server/db/connect.js';
import Tenant from './server/models/Tenant.js';
import { createTenantUpload } from './server/services/storageService.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET_TOKEN;
const legacyCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado');
}

if (!ADMIN_SECRET_TOKEN) {
  throw new Error('ADMIN_SECRET_TOKEN não configurado');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
      connectSrc: ["'self'", 'https://*.supabase.co'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
const forwardedIpKey = (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: forwardedIpKey }));
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: forwardedIpKey }));

// ConexÃƒÆ’Ã‚Â£o com MongoDB
if (process.env.MONGO_URI) {
  connectDatabase()

    .catch(err => console.error('ÃƒÂ¢Ã‚ÂÃ…â€™ Erro ao conectar no MongoDB:', err));
} else {
  console.warn('ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â MONGO_URI nÃƒÆ’Ã‚Â£o definida no .env. O banco de dados nÃƒÆ’Ã‚Â£o serÃƒÆ’Ã‚Â¡ conectado.');
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.status(databaseReady() ? 200 : 503).json({ status: databaseReady() ? 'ready' : 'not_ready' }));
app.use('/api', async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});
app.use('/api', apiRouter);

// Endpoints legados removidos por permitirem tomada de conta ou exposicao de dados.
app.post('/api/auth/identificar', (_req, res) => res.status(410).json({ sucesso: false, erro: 'Identificacao somente por telefone foi desativada por seguranca.' }));
app.post('/api/auth/recuperar-senha', (_req, res) => res.status(410).json({ sucesso: false, erro: 'Use o fluxo seguro de recuperacao com verificacao de posse.' }));
app.post('/api/admin/setup', (_req, res) => res.status(404).json({ sucesso: false, erro: 'Rota inexistente.' }));
app.get('/api/pedidos/tracking/:id', (_req, res) => res.status(410).json({ sucesso: false, erro: 'Use o rastreio por token seguro.' }));

// Middleware de AutenticaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o Cliente
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = req.cookies?.legacy_customer_session || (authHeader && authHeader.split(' ')[1]);

  if (!token) return res.status(401).json({ sucesso: false, erro: 'Acesso negado. Token nÃƒÆ’Ã‚Â£o fornecido.' });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ sucesso: false, erro: 'Token invÃƒÆ’Ã‚Â¡lido ou expirado.' });
    const account = await User.findOne({ _id: user.id }).select('_id').lean();
    if (!account) return res.status(401).json({ sucesso: false, erro: 'Conta inativa ou inexistente.' });
    req.user = user;
    next();
  });
};

// Middleware de AutenticaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o Admin (JWT Profissional)
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = req.cookies?.legacy_admin_session || (authHeader && authHeader.split(' ')[1]);

  if (!token) return res.status(401).json({ sucesso: false, erro: 'Acesso negado. Token nÃƒÆ’Ã‚Â£o fornecido.' });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ sucesso: false, erro: 'SessÃƒÆ’Ã‚Â£o administrativa expirada.' });
    if (user.role !== 'admin' && user.role !== 'master') return res.status(403).json({ sucesso: false, erro: 'PermissÃƒÆ’Ã‚Âµes insuficientes.' });
    const account = await Admin.findOne({ _id: user.id, ativo: true }).select('role').lean();
    if (!account || account.role !== user.role) return res.status(401).json({ sucesso: false, erro: 'Conta ou permissao revogada.' });
    req.admin = user;
    next();
  });
};

// FunÃƒÆ’Ã‚Â§ao Auxiliar para Logs de Auditoria com AtribuiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de UsuÃƒÆ’Ã‚Â¡rio
const logAction = async (acao, tabela, detalhes, documentoId = '', adminId = null) => {
  try {
    await AuditLog.create({
      acao,
      tabela,
      detalhes,
      documentoId,
      responsavelId: adminId
    });
  } catch (err) { console.error('Erro ao gravar log audit:', err); }
};

const getCategoryProductQuery = (categoryId) => {
  if (!categoryId) {
    return { $or: [{ categoriaId: null }, { categoriaId: { $exists: false } }] };
  }

  return { categoriaId };
};

const getProductCategoryOrder = (product) => {
  const localOrder = Number(product?.ordem_categoria);
  if (Number.isFinite(localOrder)) return localOrder;

  const legacyOrder = Number(product?.ordem);
  if (Number.isFinite(legacyOrder)) return legacyOrder;

  return 999;
};

const sortProductsByCategoryOrder = (a, b) => {
  const orderDiff = getProductCategoryOrder(a) - getProductCategoryOrder(b);
  if (orderDiff !== 0) return orderDiff;

  const createdAtDiff = new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
  if (createdAtDiff !== 0) return createdAtDiff;

  return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
};

const mapCatalogProduct = (product, categoryNameById = new Map()) => {
  const rawCategoryId = product?.categoriaId?._id || product?.categoriaId || null;
  const categoryId = rawCategoryId ? String(rawCategoryId) : null;
  const ordemCategoria = getProductCategoryOrder(product);

  return {
    id: String(product._id),
    _id: String(product._id),
    nome: product.nome,
    descricao: product.descricao || '',
    preco: product.preco || 0,
    preco_antigo: product.preco_antigo || 0,
    imagem: product.imagem || '',
    personalizavel: product.personalizavel || false,
    quantidade_total_opcoes: product.quantidade_total_opcoes || 0,
    opcoes_disponiveis: product.opcoes_disponiveis || [],
    controlar_estoque: product.controlar_estoque || false,
    estoque: product.estoque || 0,
    esgotado: product.esgotado || false,
    categoriaId: categoryId,
    categoriaNome: categoryId ? categoryNameById.get(categoryId) || product?.categoriaId?.nome || null : null,
    ativo: product.ativo !== false,
    ordem: Number(product?.ordem) || ordemCategoria,
    ordem_categoria: ordemCategoria,
    destaque: product.destaque || false,
    selo_destaque: product.selo_destaque || '',
    promocao: product.promocao || false,
    pode_resgatar: product.pode_resgatar || false,
    pontos_resgate: product.pontos_resgate || 0,
    grupos_adicionais: product.grupos_adicionais || []
  };
};

const getNextProductOrder = async (categoryId) => {
  const produtosDaCategoria = await Product.find(getCategoryProductQuery(categoryId))
    .select('ordem_categoria ordem createdAt')
    .lean();

  if (!produtosDaCategoria.length) return 0;

  return produtosDaCategoria.reduce((maxOrder, item) => {
    const currentOrder = getProductCategoryOrder(item);
    return currentOrder > maxOrder ? currentOrder : maxOrder;
  }, -1) + 1;
};

// ==========================================
// ROTAS DE AUTENTICAÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã†â€™O (Mongoose + JWT)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, telefone, senha } = req.body;
    if (!nome || !telefone || !senha) return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos' });

    const userExists = await User.findOne({ telefone });
    if (userExists) return res.status(400).json({ sucesso: false, erro: 'Telefone jÃƒÆ’Ã‚Â¡ cadastrado' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);

    const newUser = await User.create({ nome, telefone, senha: hashedPassword });
    const token = jwt.sign({ id: newUser._id, telefone: newUser.telefone }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('legacy_customer_session', token, { ...legacyCookieOptions, maxAge: 7 * 24 * 60 * 60_000 });
    res.status(201).json({ sucesso: true, user: { id: newUser._id, nome: newUser.nome, telefone: newUser.telefone } });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao registrar usuÃƒÆ’Ã‚Â¡rio' });
  }
});

app.post('/api/auth/identificar', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ sucesso: false, erro: 'Telefone obrigatÃƒÆ’Ã‚Â³rio' });

    const rawPhone = telefone.replace(/\D/g, '');
    let searchVariations = [telefone];

    if (rawPhone.length >= 10) {
      let treated = rawPhone;
      if (treated.startsWith('55') && treated.length >= 12) treated = treated.substring(2);

      const ddd = treated.substring(0, 2);
      const is9 = treated.length === 11;
      const part1 = is9 ? treated.substring(2, 7) : treated.substring(2, 6);
      const part2 = treated.substring(treated.length - 4);

      searchVariations = [
        telefone,
        treated,
        `55${treated}`,
        `+55${treated}`,
        `+55 ${ddd} ${part1}-${part2}`,
        `(${ddd}) ${part1}-${part2}`,
        `(${ddd}) ${part1}${part2}`,
        `${ddd} ${part1}-${part2}`
      ];
    }

    let users = await User.find({ telefone: { $in: searchVariations } }).sort({ createdAt: 1 });
    let user = null;

    if (users.length > 0) {
      // Prioridade real: Contas com endereÃƒÆ’Ã‚Â§os > Contas com nome real > Conta mais antiga (para recuperar Orders)
      user = users.find(u => u.enderecos && u.enderecos.length > 0) ||
        users.find(u => u.nome && u.nome.toLowerCase() !== 'visitante') ||
        users[0];
    }

    // Se nÃƒÆ’Ã‚Â£o existir, cria uma sessÃƒÆ’Ã‚Â£o leve/silenciosa equivalente ao Visitante
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('sem_senha_provisoria', salt);
      // Padroniza salvamento do novo para o formato mais comum (XX) XXXXX-XXXX
      let formatado = telefone;
      if (rawPhone.length >= 10) {
        let t = rawPhone.startsWith('55') && rawPhone.length >= 12 ? rawPhone.substring(2) : rawPhone;
        formatado = `(${t.substring(0, 2)}) ${t.length === 11 ? t.substring(2, 7) : t.substring(2, 6)}-${t.substring(t.length - 4)}`;
      }
      user = await User.create({ nome: 'Visitante', telefone: formatado, senha: hashedPassword });
    }

    const token = jwt.sign({ id: user._id, telefone: user.telefone }, JWT_SECRET, { expiresIn: '30d' });

    // Retorna user logado
    res.json({
      sucesso: true,
      token,
      user: {
        id: user._id,
        nome: user.nome,
        telefone: user.telefone,
        email: user.email,
        nascimento: user.nascimento,
        genero: user.genero,
        pontos: user.pontos,
        enderecos: user.enderecos
      }
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao identificar telefone' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { telefone, senha } = req.body;
    if (!telefone || !senha) return res.status(400).json({ sucesso: false, erro: 'Preencha telefone e senha' });

    const rawPhone = telefone.replace(/\D/g, '');
    let searchVariations = [telefone];
    if (rawPhone.length >= 10) {
      let t = rawPhone;
      if (t.startsWith('55') && t.length >= 12) t = t.substring(2);
      const ddd = t.substring(0, 2);
      const p1 = t.length === 11 ? t.substring(2, 7) : t.substring(2, 6);
      const p2 = t.substring(t.length - 4);
      searchVariations = [telefone, t, `55${t}`, `+55${t}`, `+55 ${ddd} ${p1}-${p2}`, `(${ddd}) ${p1}-${p2}`, `(${ddd}) ${p1}${p2}`, `${ddd} ${p1}-${p2}`];
    }

    const users = await User.find({ telefone: { $in: searchVariations } }).sort({ createdAt: 1 });
    let user = null;
    if (users.length > 0) {
      user = users.find(u => u.enderecos && u.enderecos.length > 0) ||
        users.find(u => u.nome && u.nome.toLowerCase() !== 'visitante') ||
        users[0];
    }

    if (!user) return res.status(401).json({ sucesso: false, erro: 'Credenciais invÃƒÆ’Ã‚Â¡lidas' });

    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(401).json({ sucesso: false, erro: 'Credenciais invÃƒÆ’Ã‚Â¡lidas' });

    const token = jwt.sign({ id: user._id, telefone: user.telefone }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('legacy_customer_session', token, { ...legacyCookieOptions, maxAge: 7 * 24 * 60 * 60_000 });
    res.json({
      sucesso: true,
      user: {
        id: user._id,
        nome: user.nome,
        telefone: user.telefone,
        email: user.email,
        nascimento: user.nascimento,
        genero: user.genero,
        pontos: user.pontos,
        enderecos: user.enderecos
      }
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao fazer login' });
  }
});

// NOVA ROTA: RecuperaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de Senha Segura (via validaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de telefone registrado)
app.post('/api/auth/recuperar-senha', async (req, res) => {
  try {
    const { telefone, novaSenha } = req.body;
    const user = await User.findOne({ telefone });
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Telefone nÃƒÆ’Ã‚Â£o encontrado no sistema.' });

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(novaSenha, salt);
    user.senha = hashed;
    await user.save();

    res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso!' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao redefinir senha' });
  }
});

app.get('/api/auth/perfil', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-senha');
    if (!user) return res.status(404).json({ sucesso: false, erro: 'UsuÃƒÆ’Ã‚Â¡rio nÃƒÆ’Ã‚Â£o encontrado' });
    res.json({ sucesso: true, user });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar perfil' });
  }
});

app.post('/api/auth/enderecos', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'UsuÃƒÆ’Ã‚Â¡rio nÃƒÆ’Ã‚Â£o encontrado' });

    user.enderecos.push(req.body);
    await user.save();
    res.status(201).json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao adicionar endereÃƒÆ’Ã‚Â§o' });
  }
});

app.put('/api/auth/enderecos/:index', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'UsuÃƒÆ’Ã‚Â¡rio nÃƒÆ’Ã‚Â£o encontrado' });

    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= user.enderecos.length) return res.status(400).json({ sucesso: false, erro: 'ÃƒÆ’Ã‚Ândice invÃƒÆ’Ã‚Â¡lido' });

    user.enderecos[index] = { ...user.enderecos[index].toObject(), ...req.body };
    await user.save();
    res.json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar endereÃƒÆ’Ã‚Â§o' });
  }
});

app.delete('/api/auth/enderecos/:index', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'UsuÃƒÆ’Ã‚Â¡rio nÃƒÆ’Ã‚Â£o encontrado' });

    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= user.enderecos.length) return res.status(400).json({ sucesso: false, erro: 'ÃƒÆ’Ã‚Ândice invÃƒÆ’Ã‚Â¡lido' });

    user.enderecos.splice(index, 1);
    await user.save();
    res.json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao remover endereÃƒÆ’Ã‚Â§o' });
  }
});

// ==========================================
// ROTAS DE VITRINE / HOME BLOCKS (Mongoose)
// ==========================================

app.get('/api/blocos_home', async (req, res) => {
  try {
    const blocos = await HomeBlock.find({ ativo: true }).sort({ ordem: 1, createdAt: -1 });
    res.json({ sucesso: true, blocos: Array.isArray(blocos) ? blocos : [] });
  } catch (error) {
    console.error('CRITICAL ERROR em /api/blocos_home:', error);
    res.json({ sucesso: true, blocos: [] }); // Fallback seguro (array vazio) para nÃƒÆ’Ã‚Â£o quebrar a index
  }
});

app.get('/api/admin/blocos_home', authenticateAdmin, async (req, res) => {
  try {
    const blocos = await HomeBlock.find().sort({ ordem: 1, createdAt: -1 });
    res.json({ sucesso: true, blocos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar blocos da home' });
  }
});

app.post('/api/admin/blocos_home', authenticateAdmin, async (req, res) => {
  try {
    const novoBloco = await HomeBlock.create(req.body);
    res.status(201).json({ sucesso: true, bloco: novoBloco });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao criar bloco' });
  }
});

app.put('/api/admin/blocos_home/:id', authenticateAdmin, async (req, res) => {
  try {
    const { _id, ...updateData } = req.body;
    const blocoAtualizado = await HomeBlock.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ sucesso: true, bloco: blocoAtualizado });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar bloco' });
  }
});

app.delete('/api/admin/blocos_home/:id', authenticateAdmin, async (req, res) => {
  try {
    await HomeBlock.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true, mensagem: 'Bloco excluÃƒÆ’Ã‚Â­do com sucesso' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir bloco' });
  }
});

app.post('/api/admin/blocos_home/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array obrigatÃƒÆ’Ã‚Â³rio' });

    const operations = updates.map(u => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $set: { ordem: u.ordem, ativo: u.ativo } }
      }
    }));

    await HomeBlock.bulkWrite(operations);
    await logAction('ORDEM_HOME_BLOCKS', 'HOMEBLOCK_BATCH', `Ordem de ${updates.length} blocos atualizada.`);
    res.json({ sucesso: true });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro no batch update de blocos' });
  }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const categorias = await Category.find().sort({ ordem: 1, nome: 1 }).lean();
    const formatted = categorias.map(c => ({
      id: String(c._id),
      _id: String(c._id),
      nome: c.nome,
      descricao: c.descricao || '',
      ordem: c.ordem
    }));
    res.json(formatted);
  } catch (error) {
    console.error('SERVER ERROR: /api/categorias -', error);
    res.json([]);
  }
});

// NOVA ROTA: AtualizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o em Lote de Categorias (Batch Update)
app.post('/api/admin/categorias/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array de updates obrigatÃƒÆ’Ã‚Â³rio' });

    const operations = updates.map(u => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $set: { ordem: u.ordem } }
      }
    }));

    await Category.bulkWrite(operations);
    await logAction('ORDEM_CATEGORIA', 'CAT_BATCH', `AtualizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o em massa da ordem de ${updates.length} categorias.`);
    res.json({ sucesso: true });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro no batch update de categorias' });
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const [produtos, categorias] = await Promise.all([
      Product.find({ ativo: true }).lean(),
      Category.find().select('nome').lean().catch(() => [])
    ]);

    const categoryNameById = new Map(
      categorias.map((categoria) => [String(categoria._id), categoria.nome])
    );

    const formatted = [...produtos]
      .sort(sortProductsByCategoryOrder)
      .map((product) => mapCatalogProduct(product, categoryNameById));
    res.json(formatted);
  } catch (error) {
    console.error('SERVER ERROR: /api/produtos -', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar produtos' });
  }
});

// ==========================================
// ROTA: CRIAR PEDIDO (Mongoose + Estoque)
// ==========================================
app.post('/api/pedidos', authenticateToken, async (req, res) => {
  try {
    const {
      cliente, itens, metodo_pagamento, frete, tipo_entrega,
      observacoes, troco_para,
      cupom_codigo, pontos_resgate
    } = req.body;
    const usuarioId = req.user.id;

    const user = await User.findById(usuarioId);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'UsuÃƒÆ’Ã‚Â¡rio nÃƒÆ’Ã‚Â£o encontrado.' });

    const settings = await StoreSettings.findOne();

    let totalPedido = frete || 0;
    const itensProcessados = [];
    const produtosParaAtualizar = [];

    for (const item of itens) {
      const produtoDB = await Product.findById(item.produtoId);
      if (!produtoDB) return res.status(404).json({ sucesso: false, erro: `Produto nÃƒÆ’Ã‚Â£o encontrado.` });

      if (produtoDB.controlar_estoque) {
        if (produtoDB.estoque < item.quantidade) return res.status(400).json({ sucesso: false, erro: `Estoque insuficiente.` });
        produtoDB.estoque -= item.quantidade;
        produtosParaAtualizar.push(produtoDB);
      }

      const subtotalItem = item.preco_unitario * item.quantidade;
      totalPedido += subtotalItem;

      itensProcessados.push({
        produtoId: produtoDB._id,
        nome: produtoDB.nome,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: subtotalItem,
        opcoes_escolhidas: item.opcoes_escolhidas || []
      });
    }

    let descontoCupom = 0;
    let cupomAplicado = '';

    // Processamento de Cupom
    if (cupom_codigo) {
      const coupon = await Coupon.findOne({ codigo: cupom_codigo.toUpperCase(), ativo: true });
      if (coupon) {
        // Valida validade e usos...
        if (coupon.validade && new Date(coupon.validade) < new Date()) {
          // Cupom expirado - ignora ou retorna erro?
        } else if (coupon.usos_restantes === 0) {
          // Cupom esgotado
        } else if (totalPedido - (frete || 0) < coupon.minimo_pedido) {
          // Valor mÃƒÆ’Ã‚Â­nimo nÃƒÆ’Ã‚Â£o atingido
        } else {
          if (coupon.tipo === 'fixo') {
            descontoCupom = coupon.valor;
          } else {
            descontoCupom = (totalPedido - (frete || 0)) * (coupon.valor / 100);
          }
          cupomAplicado = coupon.codigo;
          if (coupon.usos_restantes > 0) coupon.usos_restantes -= 1;
          await coupon.save();
        }
      }
    }

    let descontoPontos = 0;
    let pontosUtilizados = 0;

    // Processamento de Resgate de Pontos
    if (pontos_resgate && settings && settings.fidelidade_ativa) {
      const pts = parseInt(pontos_resgate);
      if (pts > 0 && user.pontos >= pts) {
        descontoPontos = pts * (settings.valor_ponto_reais || 0.05);
        pontosUtilizados = pts;
        user.pontos -= pts;
        await user.save();
      }
    }

    // Calcula o total final
    totalPedido = Math.max(0, totalPedido - descontoCupom - descontoPontos);

    for (const p of produtosParaAtualizar) await p.save();

    const novoPedido = new Order({
      usuarioId,
      cliente,
      itens: itensProcessados,
      total: totalPedido,
      metodo_pagamento,
      frete,
      tipo_entrega,
      status: 'Pendente',
      observacoes,
      troco_para,
      desconto_cupom: descontoCupom,
      cupom_codigo: cupomAplicado,
      pontos_utilizados: pontosUtilizados,
      valor_desconto_pontos: descontoPontos,
      historico_status: [{ status: 'Pendente', data: new Date() }]
    });

    await novoPedido.save();
    res.status(201).json({ sucesso: true, pedido: novoPedido });

  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro interno ao processar o pedido.' });
  }
});

app.get('/api/pedidos/tracking/:id', async (req, res) => {
  try {
    const pedido = await Order.findById(req.params.id);
    if (!pedido) return res.status(404).json({ sucesso: false, erro: 'Pedido nÃƒÆ’Ã‚Â£o encontrado.' });
    res.json({ sucesso: true, pedido });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar rastreio.' });
  }
});

app.get('/api/pedidos/meus', authenticateToken, async (req, res) => {
  try {
    const settings = await StoreSettings.findOne();
    const pedidos = await Order.find({ usuarioId: req.user.id }).sort({ createdAt: -1 });

    // Fallback para o nÃƒÆ’Ã‚Âºmero da loja caso nÃƒÆ’Ã‚Â£o esteja configurado
    const zapDaLoja = settings?.whatsapp || '';

    const formatted = pedidos.map(p => ({
      id: p._id, _id: p._id, total: p.total, frete: p.frete, status: p.status, data: p.createdAt, createdAt: p.createdAt,
      cliente: p.cliente, metodo_pagamento: p.metodo_pagamento, tipo_entrega: p.tipo_entrega, itens: p.itens,
      historico_status: p.historico_status, desconto_cupom: p.desconto_cupom,
      loja_whatsapp: zapDaLoja
    }));

    res.json({ sucesso: true, pedidos: formatted });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar pedidos' });
  }
});

// ==========================================
// ROTAS DE ADMINISTRADORES (MULTIUSUÃƒÆ’Ã‚ÂRIO)
// ==========================================

app.get('/api/admin/check-setup', async (req, res) => {
  try {
    const adminCount = await Admin.countDocuments();
    res.json({ sucesso: true, needsSetup: adminCount === 0 });
  } catch (e) {
    res.json({ sucesso: true, needsSetup: false });
  }
});

app.post('/api/admin/setup', async (req, res) => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) return res.status(403).json({ sucesso: false, erro: 'O sistema jÃƒÆ’Ã‚Â¡ possui administradores.' });

    const { nome, email, senha } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(senha, salt);

    await Admin.create({ nome, email, senha: hashed, role: 'master' });
    res.json({ sucesso: true, mensagem: 'Primeiro administrador master criado com sucesso!' });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: 'Erro no setup' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const admin = await Admin.findOne({ email, ativo: true });

    if (!admin) return res.status(401).json({ sucesso: false, erro: 'Credenciais administrativas invÃƒÆ’Ã‚Â¡lidas.' });

    const isMatch = await bcrypt.compare(senha, admin.senha);
    if (!isMatch) return res.status(401).json({ sucesso: false, erro: 'Credenciais administrativas invÃƒÆ’Ã‚Â¡lidas.' });

    const token = jwt.sign(
      { id: admin._id, nome: admin.nome, role: admin.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.cookie('legacy_admin_session', token, { ...legacyCookieOptions, maxAge: 12 * 60 * 60_000 });

    res.json({
      sucesso: true,
      admin: {
        id: admin._id,
        nome: admin.nome,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao fazer login no painel.' });
  }
});

app.get('/api/admin/session', authenticateAdmin, async (req, res) => {
  const admin = await Admin.findById(req.admin.id).select('nome email role').lean();
  res.json({ sucesso: true, admin: { id: admin?._id, nome: admin?.nome, email: admin?.email, role: admin?.role } });
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const allowed = {
      nome: typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 120) : undefined,
      email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : undefined,
      genero: typeof req.body?.genero === 'string' ? req.body.genero.slice(0, 40) : undefined,
      nascimento: typeof req.body?.nascimento === 'string' ? req.body.nascimento.slice(0, 20) : undefined,
    };
    const update = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined));
    const user = await User.findOneAndUpdate({ _id: req.user.id }, { $set: update }, { new: true, runValidators: true }).select('-senha').lean();
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuario nao encontrado.' });
    res.json({ sucesso: true, user });
  } catch {
    res.status(400).json({ sucesso: false, erro: 'Nao foi possivel atualizar o perfil.' });
  }
});

app.put('/api/auth/password', authenticateToken, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    if (typeof senhaAtual !== 'string' || typeof novaSenha !== 'string' || novaSenha.length < 8) return res.status(400).json({ sucesso: false, erro: 'A nova senha deve ter pelo menos 8 caracteres.' });
    const user = await User.findById(req.user.id).select('+senha');
    if (!user || !await bcrypt.compare(senhaAtual, user.senha)) return res.status(400).json({ sucesso: false, erro: 'Senha atual incorreta.' });
    if (await bcrypt.compare(novaSenha, user.senha)) return res.status(400).json({ sucesso: false, erro: 'A nova senha deve ser diferente.' });
    user.senha = await bcrypt.hash(novaSenha, 12);
    await user.save();
    res.json({ sucesso: true });
  } catch {
    res.status(500).json({ sucesso: false, erro: 'Nao foi possivel alterar a senha.' });
  }
});

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('legacy_admin_session', legacyCookieOptions);
  res.json({ sucesso: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('legacy_customer_session', legacyCookieOptions);
  res.json({ sucesso: true });
});

app.put('/api/admin/me/password', authenticateAdmin, async (req, res) => {
  try {
    const { email, senhaAtual, novaSenha, confirmarNovaSenha } = req.body || {};

    if (!email || !senhaAtual || !novaSenha || !confirmarNovaSenha) {
      return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos obrigatorios.' });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({ sucesso: false, erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    if (novaSenha !== confirmarNovaSenha) {
      return res.status(400).json({ sucesso: false, erro: 'A confirmacao da nova senha nao confere.' });
    }

    const admin = await Admin.findById(req.admin.id);
    if (!admin || admin.ativo === false) {
      return res.status(404).json({ sucesso: false, erro: 'Administrador nao encontrado.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const currentAdminEmail = String(admin.email || '').trim().toLowerCase();

      if (normalizedEmail !== currentAdminEmail) {
        return res.status(400).json({ sucesso: false, erro: 'O e-mail informado nao corresponde ao admin logado.' });
      }

      const isCurrentPasswordValid = await bcrypt.compare(senhaAtual, admin.senha);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ sucesso: false, erro: 'A senha atual esta incorreta.' });
      }

    const isSamePassword = await bcrypt.compare(novaSenha, admin.senha);
    if (isSamePassword) {
      return res.status(400).json({ sucesso: false, erro: 'A nova senha precisa ser diferente da senha atual.' });
    }

    const salt = await bcrypt.genSalt(10);
    admin.senha = await bcrypt.hash(novaSenha, salt);
    await admin.save();

    await logAction(
      'ALTERAR_SENHA_ADMIN',
      'ADMIN',
      `Senha alterada com sucesso para o administrador ${admin.email}.`,
      admin._id,
      admin._id
    );

    res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso!' });
  } catch (error) {
    console.error('SERVER ERROR: /api/admin/me/password -', error);
    res.status(500).json({ sucesso: false, erro: 'Erro interno ao alterar a senha.' });
  }
});

// Listar Clientes
app.get('/api/admin/clientes', authenticateAdmin, async (req, res) => {
  try {
    const clientes = await User.find().select('-senha');
    const pedidos = await Order.find();

    // Calcular LTV e total de pedidos para cada cliente
    const clientesComStatus = clientes.map(c => {
      const pedidosC = pedidos.filter(p => p.cliente?.telefone === c.telefone);
      return {
        ...c.toObject(),
        total_pedidos: pedidosC.length,
        total_gasto: pedidosC.reduce((acc, p) => acc + (p.total || 0), 0)
      };
    });

    res.json({ sucesso: true, clientes: clientesComStatus });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar clientes' });
  }
});

// Atualizar Pontos de Fidelidade
app.patch('/api/admin/clientes/:id/pontos', authenticateAdmin, async (req, res) => {
  try {
    const { pontos } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { pontos }, { new: true });
    await logAction('AJUSTE_PONTOS', 'User', `Pontos ajustados para ${pontos}`, user._id, req.admin.id);
    res.json({ sucesso: true, user });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar pontos' });
  }
});

app.get('/api/configuracoes/publica', async (req, res) => {
  try {
    let settings;
    try {
      settings = await StoreSettings.findOne();
      if (!settings) {
        settings = { is_open: true, nome_loja: 'Stitch Delivery', fidelidade_ativa: false };
      }
    } catch (dbErr) {
      console.error('Erro de BD ao buscar StoreSettings:', dbErr);
      settings = { is_open: true, nome_loja: 'Delivery', fidelidade_ativa: false };
    }

    let is_open_computado = settings.is_open !== false;
    let fallback_msg = settings.mensagem_fechado || 'Estamos fechados no momento.';

    try {
      if (settings.abertura_automatica && settings.horarios_funcionamento && settings.is_open) {
        const dataHoraAtual = new Date();
        dataHoraAtual.setHours(dataHoraAtual.getHours() - 3); // BRT (UTC-3)

        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const diaAtualStr = dias[dataHoraAtual.getUTCDay()];

        const hh = String(dataHoraAtual.getUTCHours()).padStart(2, '0');
        const mm = String(dataHoraAtual.getUTCMinutes()).padStart(2, '0');
        const horaMinutoAtual = `${hh}:${mm}`;

        const configDia = settings.horarios_funcionamento[diaAtualStr];
        if (configDia && typeof configDia === 'object' && configDia.aberto) {
          if (configDia.inicio && configDia.fim && horaMinutoAtual >= configDia.inicio && horaMinutoAtual <= configDia.fim) {
            is_open_computado = true;
          } else {
            is_open_computado = false;
          }
        } else {
          is_open_computado = false;
        }
      }
    } catch (calcErr) {
      console.error('Erro ao calcular abertura_automatica:', calcErr);
      is_open_computado = settings.is_open !== false;
    }

    res.json({
      sucesso: true,
      nome_loja: settings.nome_loja || 'Stitch Delivery',
      tagline: settings.tagline || '',
      logo_url: settings.logo_url || '',
      capa_url: settings.capa_url || '',
      logoShape: settings.logoShape || 'squircle',
      theme: createStoreTheme(settings.theme),
      secondaryBanners: Array.isArray(settings.secondaryBanners) ? settings.secondaryBanners : [],
      logisticsOptions: settings.logisticsOptions || { allowPickup: true, allowDelivery: true },
      tempo_entrega: settings.tempo_entrega || '45 min',
      is_open: is_open_computado,
      mensagem_fechado: fallback_msg,
      whatsapp: settings.whatsapp || '',
      // Dados de frete para o carrinho
      cep_loja: settings.cep_loja || '',
      rua_loja: settings.rua_loja || '',
      numero_loja: settings.numero_loja || '',
      bairro_loja: settings.bairro_loja || '',
      cidade_loja: settings.cidade_loja || '',
      estado_loja: settings.estado_loja || '',
      faixas_entrega: Array.isArray(settings.faixas_entrega) ? settings.faixas_entrega : [],
      sobre_texto: settings.sobre_texto || '',
      instagram_url: settings.instagram_url || '',
      horarios_funcionamento: settings.horarios_funcionamento || null,
      abertura_automatica: !!settings.abertura_automatica,

      // Regras Comerciais
      pedido_minimo: Number(settings.pedido_minimo) || 0,
      frete_gratis_acima_de: Number(settings.frete_gratis_acima_de) || 0,
      pagamento_pix: settings.pagamento_pix !== false,
      pagamento_cartao: settings.pagamento_cartao !== false,
      pagamento_dinheiro: settings.pagamento_dinheiro !== false,
      chave_pix: settings.chave_pix || '',
      instrucoes_pix: settings.instrucoes_pix || '',

      // Marketing
      banner_ativo: settings.banner_ativo === true,
      banner_texto: settings.banner_texto || '',

      // Fidelidade
      fidelidade_ativa: settings.fidelidade_ativa === true,
      pontos_por_real: Number(settings.pontos_por_real) || 1,
      valor_ponto_reais: Number(settings.valor_ponto_reais) || 0.05
    });
  } catch (error) {
    console.error('CRITICAL ERROR em /api/configuracoes/publica:', error);
    // Garante retorno de um objeto seguro para nÃƒÆ’Ã‚Â£o quebrar JSON.parse no frontend e nem estado
    res.json({
      sucesso: false,
      // fallback controlando campos vitais do front:
      nome_loja: 'Volta logo!',
      theme: createStoreTheme(),
      tagline: 'O serviÃƒÆ’Ã‚Â§o estÃƒÆ’Ã‚Â¡ se ajustando.',
      faixas_entrega: [],
      secondaryBanners: [],
      is_open: false,
      tempo_entrega: '1 min',
      whatsapp: ''
    });
  }
});

app.get('/api/admin/configuracoes', authenticateAdmin, async (req, res) => {
  try {
    let settings = await StoreSettings.findOne();
    if (!settings) settings = await StoreSettings.create({ is_open: true, nome_loja: 'Stitch Delivery' });
    const settingsObject = settings.toObject ? settings.toObject() : settings;
    settingsObject.theme = createStoreTheme(settingsObject.theme);
    res.json({ sucesso: true, settings: settingsObject });
  } catch (error) {
    console.error('SERVER ERROR: /api/admin/configuracoes -', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
  }
});

app.put('/api/admin/configuracoes', authenticateAdmin, async (req, res) => {
  try {
    const {
      nome_loja, tagline, logo_url, capa_url, is_open, tempo_entrega, whatsapp, sobre_texto, instagram_url,
      cep_loja, rua_loja, numero_loja, bairro_loja, cidade_loja, estado_loja, faixas_entrega,
      abertura_automatica, mensagem_fechado, horarios_funcionamento,
      pedido_minimo, frete_gratis_acima_de, pagamento_pix, pagamento_cartao, pagamento_dinheiro, chave_pix, instrucoes_pix,
      banner_ativo, banner_texto,
      fidelidade_ativa, pontos_por_real, valor_ponto_reais,
      logoShape, secondaryBanners, logisticsOptions, theme
    } = req.body;

    let settings = await StoreSettings.findOne() || new StoreSettings();

    if (nome_loja !== undefined) settings.nome_loja = nome_loja;
    if (tagline !== undefined) settings.tagline = tagline;
    if (logo_url !== undefined) settings.logo_url = logo_url;
    if (capa_url !== undefined) settings.capa_url = capa_url;
    if (is_open !== undefined) settings.is_open = is_open;
    if (tempo_entrega !== undefined) settings.tempo_entrega = tempo_entrega;
    if (whatsapp !== undefined) settings.whatsapp = whatsapp;
    if (sobre_texto !== undefined) settings.sobre_texto = sobre_texto;
    if (instagram_url !== undefined) settings.instagram_url = instagram_url;

    if (abertura_automatica !== undefined) settings.abertura_automatica = abertura_automatica;
    if (mensagem_fechado !== undefined) settings.mensagem_fechado = mensagem_fechado;
    if (horarios_funcionamento !== undefined) settings.horarios_funcionamento = horarios_funcionamento;

    // Atualizando o EndereÃƒÆ’Ã‚Â§o e as Faixas
    if (cep_loja !== undefined) settings.cep_loja = cep_loja;
    if (rua_loja !== undefined) settings.rua_loja = rua_loja;
    if (numero_loja !== undefined) settings.numero_loja = numero_loja;
    if (bairro_loja !== undefined) settings.bairro_loja = bairro_loja;
    if (cidade_loja !== undefined) settings.cidade_loja = cidade_loja;
    if (estado_loja !== undefined) settings.estado_loja = estado_loja;
    if (faixas_entrega !== undefined) settings.faixas_entrega = faixas_entrega;

    // Regras Comerciais
    if (pedido_minimo !== undefined) settings.pedido_minimo = pedido_minimo;
    if (frete_gratis_acima_de !== undefined) settings.frete_gratis_acima_de = frete_gratis_acima_de;
    if (pagamento_pix !== undefined) settings.pagamento_pix = pagamento_pix;
    if (pagamento_cartao !== undefined) settings.pagamento_cartao = pagamento_cartao;
    if (pagamento_dinheiro !== undefined) settings.pagamento_dinheiro = pagamento_dinheiro;
    if (chave_pix !== undefined) settings.chave_pix = chave_pix;
    if (instrucoes_pix !== undefined) settings.instrucoes_pix = instrucoes_pix;

    if (banner_ativo !== undefined) settings.banner_ativo = banner_ativo;
    if (banner_texto !== undefined) settings.banner_texto = banner_texto;

    if (fidelidade_ativa !== undefined) settings.fidelidade_ativa = fidelidade_ativa;
    if (pontos_por_real !== undefined) settings.pontos_por_real = pontos_por_real;
    if (valor_ponto_reais !== undefined) settings.valor_ponto_reais = valor_ponto_reais;

    // Vitrine & LogÃƒÆ’Ã‚Â­stica (Admin)
    if (logoShape !== undefined) settings.logoShape = logoShape;
    if (theme !== undefined) settings.theme = createStoreTheme(theme);
    if (secondaryBanners !== undefined) settings.secondaryBanners = secondaryBanners;
    if (logisticsOptions !== undefined) settings.logisticsOptions = logisticsOptions;

    await settings.save();
    await logAction('EDITAR_CONFIG', 'CONFIG', `ConfiguraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes da loja atualizadas por ADMIN`);
    res.json({ sucesso: true, settings });

  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao salvar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
  }
});

app.patch('/api/admin/configuracoes/toggle-loja', authenticateAdmin, async (req, res) => {
  try {
    let settings = await StoreSettings.findOne();
    if (!settings) settings = await StoreSettings.create({ is_open: true });
    settings.is_open = !settings.is_open;
    await settings.save();
    res.json({ sucesso: true, is_open: settings.is_open });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao alterar status da loja' });
  }
});

app.get('/api/admin/pedidos', authenticateAdmin, async (req, res) => {
  try {
    const pedidos = await Order.find().sort({ createdAt: -1 }).populate('usuarioId', 'nome telefone');
    res.json({ sucesso: true, pedidos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar pedidos' });
  }
});

app.patch('/api/admin/pedidos/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const pedido = await Order.findById(id);
    if (!pedido) return res.status(404).json({ sucesso: false, erro: 'Pedido nÃƒÆ’Ã‚Â£o encontrado' });

    if (status === 'Cancelado' && pedido.status !== 'Cancelado') {
      for (const item of pedido.itens) {
        const produto = await Product.findById(item.produtoId);
        if (produto && produto.controlar_estoque) {
          produto.estoque += item.quantidade;
          await produto.save();
        }
      }
    }
    if (status === 'Entregue' && pedido.status !== 'Entregue') {
      const userToAward = await User.findById(pedido.usuarioId);
      const settings = await StoreSettings.findOne();
      if (userToAward && settings && settings.fidelidade_ativa) {
        // Ganha pontos sobre o subtotal (Total - Frete + Descontos aplicados se vocÃƒÆ’Ã‚Âª quiser, mas geralmente ÃƒÆ’Ã‚Â© sobre o valor pago em produtos)
        const subtotalParaPontos = Math.max(0, pedido.total - (pedido.frete || 0));
        const pontosGanhos = Math.floor(subtotalParaPontos * (settings.pontos_por_real || 1));
        if (pontosGanhos > 0) {
          userToAward.pontos = (userToAward.pontos || 0) + pontosGanhos;
          await userToAward.save();
        }
      }
    }
    await Order.updateOne(
      { _id: id },
      {
        $set: { status: status },
        $push: { historico_status: { status: status, data: new Date() } }
      }
    );

    await logAction('MUDAR_STATUS', 'PEDIDO', `Pedido #${id.slice(-6).toUpperCase()} alterado para ${status}`, id);

    res.json({ sucesso: true, mensagem: "Status atualizado" });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar status do pedido' });
  }
});

// NOVA ROTA: Listar Logs de Auditoria (ADMIN)
app.get('/api/admin/logs', authenticateAdmin, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
    res.json({ sucesso: true, logs });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro buscar logs' });
  }
});

app.get('/api/admin/produtos', authenticateAdmin, async (req, res) => {
  try {
    const produtos = await Product.find().populate('categoriaId').lean();
    produtos.sort((a, b) => {
      const categoryA = String(a?.categoriaId?._id || a?.categoriaId || '');
      const categoryB = String(b?.categoriaId?._id || b?.categoriaId || '');

      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB, 'pt-BR');
      }

      return sortProductsByCategoryOrder(a, b);
    });

    res.json({ sucesso: true, produtos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar produtos' });
  }
});

app.post('/api/admin/produtos', authenticateAdmin, async (req, res) => {
  try {
    const { preco, preco_antigo } = req.body;
    const productData = { ...req.body };

    if (preco_antigo && Number(preco_antigo) > 0 && Number(preco_antigo) <= Number(preco)) {
      return res.status(400).json({ sucesso: false, erro: 'O preÃƒÆ’Ã‚Â§o original deve ser estritamente maior que o preÃƒÆ’Ã‚Â§o atual.' });
    }

    if (productData.categoriaId === '') {
      productData.categoriaId = null;
    }

    if (productData.ordem_categoria === undefined) {
      const fallbackOrder =
        productData.ordem !== undefined && Number.isFinite(Number(productData.ordem))
          ? Number(productData.ordem)
          : await getNextProductOrder(productData.categoriaId || null);

      productData.ordem_categoria = fallbackOrder;
      productData.ordem = fallbackOrder;
    }

    const novoProduto = await Product.create(productData);
    res.status(201).json({ sucesso: true, produto: novoProduto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao criar produto' });
  }
});

app.put('/api/admin/produtos/:id', authenticateAdmin, async (req, res) => {
  try {
    const { _id, ...updateData } = req.body;
    const existing = await Product.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ sucesso: false, erro: 'Produto nao encontrado' });
    }

    if (updateData.preco !== undefined || updateData.preco_antigo !== undefined) {
        const pAtual = updateData.preco !== undefined ? updateData.preco : existing.preco;
        const pAntigo = updateData.preco_antigo !== undefined ? updateData.preco_antigo : existing.preco_antigo;

        if (pAntigo > 0 && Number(pAntigo) <= Number(pAtual)) {
          return res.status(400).json({ sucesso: false, erro: 'O preÃƒÆ’Ã‚Â§o original deve ser estritamente maior que o preÃƒÆ’Ã‚Â§o atual.' });
        }
    }

    if (updateData.categoriaId === '') {
      updateData.categoriaId = null;
    }

    const previousCategoryId = existing.categoriaId ? String(existing.categoriaId) : '';
    const nextCategoryId = updateData.categoriaId !== undefined
      ? (updateData.categoriaId ? String(updateData.categoriaId) : '')
      : previousCategoryId;

    if (updateData.ordem_categoria === undefined) {
      if (previousCategoryId !== nextCategoryId) {
        const nextOrder = await getNextProductOrder(updateData.categoriaId || null);
        updateData.ordem_categoria = nextOrder;
        updateData.ordem = nextOrder;
      } else if (existing.ordem_categoria === undefined || existing.ordem_categoria === null) {
        updateData.ordem_categoria = getProductCategoryOrder(existing);
        updateData.ordem = updateData.ordem_categoria;
      }
    } else {
      updateData.ordem = Number(updateData.ordem_categoria);
    }

    const produtoAtualizado = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ sucesso: true, produto: produtoAtualizado });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar produto' });
  }
});

// NOVA ROTA: AtualizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o em Lote (Batch Update) para Vitrine e OrdenaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
app.post('/api/admin/produtos/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array de updates obrigatÃƒÆ’Ã‚Â³rio' });

    const operations = updates.map(u => ({
      updateOne: {
        filter: { _id: u.id },
        update: {
          $set: {
            ordem: Number.isFinite(Number(u.ordem_categoria)) ? Number(u.ordem_categoria) : Number(u.ordem),
            ordem_categoria: Number.isFinite(Number(u.ordem_categoria)) ? Number(u.ordem_categoria) : Number(u.ordem),
            destaque: !!u.destaque,
            ...(u.promocao !== undefined ? { promocao: !!u.promocao } : {})
          }
        }
      }
    }));

    await Product.bulkWrite(operations);

    await logAction('ORDEM_VITRINE', 'PROD_BATCH', `AtualizaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o em massa da ordem de ${updates.length} produtos.`);

    res.json({ sucesso: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ sucesso: false, erro: 'Erro no batch update' });
  }
});

// ExclusÃƒÆ’Ã‚Â£o Definitiva (Segura com E-mail + Senha)
app.get('/api/admin/catalogo/estrutura', authenticateAdmin, async (req, res) => {
  try {
    const [categorias, produtos] = await Promise.all([
      Category.find().sort({ ordem: 1, nome: 1 }).lean(),
      Product.find().populate('categoriaId', 'nome').lean()
    ]);

    const categoryNameById = new Map(
      categorias.map((categoria) => [String(categoria._id), categoria.nome])
    );

    const sortedProducts = [...produtos].sort(sortProductsByCategoryOrder);
    const productsByCategory = new Map();
    const semCategoria = [];

    for (const product of sortedProducts) {
      const mappedProduct = mapCatalogProduct(product, categoryNameById);

      if (mappedProduct.categoriaId && categoryNameById.has(mappedProduct.categoriaId)) {
        if (!productsByCategory.has(mappedProduct.categoriaId)) {
          productsByCategory.set(mappedProduct.categoriaId, []);
        }

        productsByCategory.get(mappedProduct.categoriaId).push(mappedProduct);
      } else {
        semCategoria.push(mappedProduct);
      }
    }

    const estrutura = categorias.map((categoria) => {
      const categoryId = String(categoria._id);
      const categoryProducts = productsByCategory.get(categoryId) || [];

      return {
        id: categoryId,
        _id: categoryId,
        nome: categoria.nome,
        descricao: categoria.descricao || '',
        ordem: categoria.ordem ?? 999,
        totalProdutos: categoryProducts.length,
        produtos: categoryProducts
      };
    });

    res.json({
      sucesso: true,
      categorias: estrutura,
      semCategoria
    });
  } catch (error) {
    console.error('SERVER ERROR: /api/admin/catalogo/estrutura -', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao carregar a estrutura do catalogo.' });
  }
});

app.post('/api/admin/catalogo/estrutura', authenticateAdmin, async (req, res) => {
  try {
    const { categories = [], productOrders = [] } = req.body || {};

    if (!Array.isArray(categories) || !Array.isArray(productOrders)) {
      return res.status(400).json({ sucesso: false, erro: 'Estrutura enviada em formato invalido.' });
    }

    if (categories.length) {
      await Category.bulkWrite(
        categories.map((category) => ({
          updateOne: {
            filter: { _id: category.id },
            update: { $set: { ordem: Number(category.ordem) || 0 } }
          }
        }))
      );
    }

    if (productOrders.length) {
      await Product.bulkWrite(
        productOrders.map((product) => {
          const nextOrder = Number(product.ordem_categoria);
          return {
            updateOne: {
              filter: { _id: product.id },
              update: {
                $set: {
                  ordem_categoria: Number.isFinite(nextOrder) ? nextOrder : 999,
                  ordem: Number.isFinite(nextOrder) ? nextOrder : 999,
                  ...(product.destaque !== undefined ? { destaque: !!product.destaque } : {})
                }
              }
            }
          };
        })
      );
    }

    await logAction(
      'ESTRUTURA_CATALOGO',
      'CATALOGO',
      `Estrutura do catalogo atualizada com ${categories.length} categorias e ${productOrders.length} produtos.`,
      '',
      req.admin.id
    );

    res.json({ sucesso: true, mensagem: 'Estrutura do catalogo salva com sucesso!' });
  } catch (error) {
    console.error('SERVER ERROR: /api/admin/catalogo/estrutura [POST] -', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao salvar a estrutura do catalogo.' });
  }
});

app.delete('/api/admin/produtos/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, senha } = req.body;

    if (!email || !senha) return res.status(400).json({ sucesso: false, erro: 'E-mail e senha exigidos.' });

    const admin = await Admin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ sucesso: false, erro: 'Admin nÃƒÆ’Ã‚Â£o encontrado.' });

    // Verifica se o e-mail digitado confere com o do admin logado (dupla checagem)
    if (admin.email !== email) {
      return res.status(401).json({ sucesso: false, erro: 'O e-mail digitado nÃƒÆ’Ã‚Â£o corresponde ao seu acesso.' });
    }

    const match = await bcrypt.compare(senha, admin.senha);
    if (!match) return res.status(401).json({ sucesso: false, erro: 'Senha incorreta.' });

    const p = await Product.findByIdAndDelete(id);
    if (!p) return res.status(404).json({ sucesso: false, erro: 'Produto nÃƒÆ’Ã‚Â£o encontrado.' });

    await logAction(
      'EXCLUIR_PRODUTO',
      'PRODUTOS',
      `EXCLUSÃƒÆ’Ã†â€™O DEFINITIVA: O administrador ${admin.nome} (${admin.email}) deletou o produto ${p.nome}`,
      id,
      admin._id
    );

    res.json({ sucesso: true, mensagem: 'Produto excluÃƒÆ’Ã‚Â­do permanentemente!' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro interno na exclusÃƒÆ’Ã‚Â£o.' });
  }
});

app.patch('/api/admin/produtos/:id/toggle-ativo', authenticateAdmin, async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ sucesso: false, erro: 'Produto nÃƒÆ’Ã‚Â£o encontrado' });
    produto.ativo = !produto.ativo;
    await produto.save();
    res.json({ sucesso: true, produto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao alternar status' });
  }
});

// ... (seu cÃƒÆ’Ã‚Â³digo de produtos que jÃƒÆ’Ã‚Â¡ estÃƒÆ’Ã‚Â¡ aÃƒÆ’Ã‚Â­) ...

// ==========================================
// PROXY DE GEOLOCALIZAÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã†â€™O (Bypass CORS e User-Agent)
// ==========================================
app.get('/api/geolocalizacao', async (req, res) => {
  try {
    const { q, cep } = req.query;

    // Tenta primeiro por CEP na BrasilAPI (Backend nÃƒÆ’Ã‚Â£o tem CORS)
    if (cep && cep.length === 8) {
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.location?.coordinates?.latitude) {
            return res.json({ sucesso: true, lat: parseFloat(d.location.coordinates.latitude), lon: parseFloat(d.location.coordinates.longitude) });
          }
        }
      } catch (e) { }
    }

    // Se nÃƒÆ’Ã‚Â£o for CEP ou BrasilAPI falhar, vai pro Nominatim
    // O SEGREDO: No backend o Node pode passar o User-Agent que o OSM exige
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=1`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'StitchDeliveryApp/1.0 (contato@stitchdelivery.com)'
      }
    });

    if (!response.ok) return res.json({ sucesso: false, erro: 'Provedor indisponÃƒÆ’Ã‚Â­vel' });

    const data = await response.json();
    if (data && data.length > 0) {
      res.json({ sucesso: true, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
    } else {
      res.json({ sucesso: false, erro: 'EndereÃƒÆ’Ã‚Â§o nÃƒÆ’Ã‚Â£o localizado' });
    }
  } catch (error) {
    res.json({ sucesso: false, erro: 'Erro interno geoproxy' });
  }
});

app.patch('/api/admin/produtos/:id/toggle-esgotado', authenticateAdmin, async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ sucesso: false, erro: 'Produto nÃƒÆ’Ã‚Â£o encontrado' });
    produto.esgotado = !produto.esgotado;
    await produto.save();
    res.json({ sucesso: true, produto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao alternar status de esgotado' });
  }
});

// ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¡ COLE EXATAMENTE AQUI, A PARTIR DESTA LINHA ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¡

// ==========================================
// GESTÃƒÆ’Ã†â€™O DE CUPONS (ADMIN)
// ==========================================
app.get('/api/admin/cupons', authenticateAdmin, async (req, res) => {
  try {
    const cupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ sucesso: true, cupons });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar cupons' });
  }
});

app.post('/api/admin/cupons', authenticateAdmin, async (req, res) => {
  try {
    const novoCupom = await Coupon.create({ ...req.body, codigo: req.body.codigo.toUpperCase() });
    res.status(201).json({ sucesso: true, cupom: novoCupom });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao criar cupom' });
  }
});

app.delete('/api/admin/cupons/:id', authenticateAdmin, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true, mensagem: 'Cupom excluÃƒÆ’Ã‚Â­do' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir cupom' });
  }
});

// ValidaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o pÃƒÆ’Ã‚Âºblica de cupom
app.post('/api/cupons/validar', async (req, res) => {
  try {
    const { codigo, subtotal } = req.body;
    const normalizedCode = String(codigo || '').trim().toUpperCase();
    const normalizedSubtotal = Number(subtotal || 0);

    if (!normalizedCode) {
      return res.json({ sucesso: false, erro: 'Informe um codigo de cupom.' });
    }

    const coupon = await Coupon.findOne({ codigo: normalizedCode, ativo: true });

    if (!coupon) return res.json({ sucesso: false, erro: 'Cupom nao encontrado.' });
    if (coupon.validade && new Date(coupon.validade) < new Date()) return res.json({ sucesso: false, erro: 'Este cupom ja expirou.' });
    if (coupon.usos_restantes === 0) return res.json({ sucesso: false, erro: 'Este cupom atingiu o limite de usos.' });
    if (normalizedSubtotal < coupon.minimo_pedido) {
      return res.json({
        sucesso: false,
        erro: `Valor minimo para este cupom e R$ ${coupon.minimo_pedido.toFixed(2).replace('.', ',')}`,
      });
    }

    res.json({ sucesso: true, cupom: coupon });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao validar cupom' });
  }
});

// ==========================================
// GESTÃƒÆ’Ã†â€™O DE CATEGORIAS (ADMIN)
// ==========================================

app.post('/api/admin/categorias', authenticateAdmin, async (req, res) => {
  try {
    const novaCategoria = await Category.create(req.body);
    res.status(201).json({ sucesso: true, categoria: novaCategoria });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao criar categoria' });
  }
});

app.put('/api/admin/categorias/:id', authenticateAdmin, async (req, res) => {
  try {
    const categoriaAtualizada = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ sucesso: true, categoria: categoriaAtualizada });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar categoria' });
  }
});

app.delete('/api/admin/categorias/:id', authenticateAdmin, async (req, res) => {
  try {
    // Trava de seguranÃƒÆ’Ã‚Â§a: impede apagar categoria se tiver produto nela
    const produtosVinculados = await Product.countDocuments({ categoriaId: req.params.id });
    if (produtosVinculados > 0) {
      return res.status(400).json({ sucesso: false, erro: 'Existem produtos vinculados a esta categoria.' });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true, mensagem: 'Categoria excluÃƒÆ’Ã‚Â­da' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir categoria' });
  }
});


// ==========================================
// VERCEL STATIC EXPORT COM INJEÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã†â€™O DE NOME DINÃƒÆ’Ã¢â‚¬Å¡MICO
// ==========================================
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Esta rota intercepta qualquer acesso ao site
app.get('/*splat', async (req, res) => {
  try {
    // 1. Busca o nome da loja que vocÃƒÆ’Ã‚Âª salvou no Painel Admin
    const slug = req.path.split('/').filter(Boolean)[0] || process.env.DEFAULT_TENANT_SLUG;
    const tenant = slug ? await Tenant.findOne({ slug }).select('_id displayName').lean() : null;
    const settings = tenant ? await StoreSettings.findOne({ tenantId: tenant._id }).select('nome_loja').lean() : null;
    const nomeAtualDaLoja = escapeHtml(settings?.nome_loja || tenant?.displayName || 'Delivery');

    // 2. LÃƒÆ’Ã‚Âª o arquivo index.html (o "molde" do site)
    let html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

    // 3. MÃƒÆ’Ã‚ÂGICA: Substitui os tÃƒÆ’Ã‚Â­tulos e as tags do WhatsApp pelo nome real
    html = html.replace(/<title>.*?<\/title>/g, `<title>${nomeAtualDaLoja}</title>`);
    html = html.replace(/content="My Google AI Studio App"/g, `content="${nomeAtualDaLoja}"`);
    html = html.replace(/property="og:title" content=".*?"/g, `property="og:title" content="${nomeAtualDaLoja}"`);

    // 4. Envia o site jÃƒÆ’Ã‚Â¡ com o nome certo para o cliente ou para o WhatsApp
    res.send(html);
  } catch (error) {
    // Se der qualquer erro na leitura, ele entrega o arquivo normal sem o nome dinÃƒÆ’Ã‚Â¢mico
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

app.post('/api/admin/uploads/sign', authenticateAdmin, async (req, res) => {
  try {
    const { target, mimeType, size } = req.body || {};
    if (!['product', 'store'].includes(target) || mimeType !== 'image/webp' || !Number.isSafeInteger(size)) {
      return res.status(400).json({ sucesso: false, erro: 'Arquivo invalido.' });
    }
    const tenant = await Tenant.findOne({ slug: process.env.DEFAULT_TENANT_SLUG || 'loja-piloto' }).select('_id').lean();
    if (!tenant) return res.status(409).json({ sucesso: false, erro: 'Execute a migracao inicial da loja antes de enviar imagens.' });
    const upload = await createTenantUpload(tenant._id, target, size);
    res.status(201).json({ sucesso: true, upload });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ sucesso: false, erro: status === 500 ? 'Falha ao preparar upload.' : error.message });
  }
});

app.use(errorHandler);

export default app;
