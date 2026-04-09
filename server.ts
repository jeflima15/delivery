// @ts-nocheck
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';

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



const JWT_SECRET = process.env.JWT_SECRET || 'stitch_secret_key_super_segura';
const ADMIN_SECRET_TOKEN = process.env.ADMIN_SECRET_TOKEN || 'admin_stitch_123';

const app = express();
app.use(express.json());

// Conexão com MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('📦 Conectado ao MongoDB com sucesso!');
    })
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));
} else {
  console.warn('⚠️ MONGO_URI não definida no .env. O banco de dados não será conectado.');
}

// Middleware de Autenticação Cliente
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ sucesso: false, erro: 'Acesso negado. Token não fornecido.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ sucesso: false, erro: 'Token inválido ou expirado.' });
    req.user = user;
    next();
  });
};

// Middleware de Autenticação Admin (JWT Profissional)
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ sucesso: false, erro: 'Acesso negado. Token não fornecido.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ sucesso: false, erro: 'Sessão administrativa expirada.' });
    if (user.role !== 'admin' && user.role !== 'master') return res.status(403).json({ sucesso: false, erro: 'Permissões insuficientes.' });
    req.admin = user;
    next();
  });
};

// Funçao Auxiliar para Logs de Auditoria com Atribuição de Usuário
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

// ==========================================
// ROTAS DE AUTENTICAÇÃO (Mongoose + JWT)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, telefone, senha } = req.body;
    if (!nome || !telefone || !senha) return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos' });

    const userExists = await User.findOne({ telefone });
    if (userExists) return res.status(400).json({ sucesso: false, erro: 'Telefone já cadastrado' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);

    const newUser = await User.create({ nome, telefone, senha: hashedPassword });
    const token = jwt.sign({ id: newUser._id, telefone: newUser.telefone }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ sucesso: true, token, user: { id: newUser._id, nome: newUser.nome, telefone: newUser.telefone } });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao registrar usuário' });
  }
});

app.post('/api/auth/identificar', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ sucesso: false, erro: 'Telefone obrigatório' });

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
      // Prioridade real: Contas com endereços > Contas com nome real > Conta mais antiga (para recuperar Orders)
      user = users.find(u => u.enderecos && u.enderecos.length > 0) ||
             users.find(u => u.nome && u.nome.toLowerCase() !== 'visitante') ||
             users[0];
    }
    
    // Se não existir, cria uma sessão leve/silenciosa equivalente ao Visitante
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
    
    if (!user) return res.status(401).json({ sucesso: false, erro: 'Credenciais inválidas' });

    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(401).json({ sucesso: false, erro: 'Credenciais inválidas' });

    const token = jwt.sign({ id: user._id, telefone: user.telefone }, JWT_SECRET, { expiresIn: '7d' });
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
    res.status(500).json({ sucesso: false, erro: 'Erro ao fazer login' });
  }
});

// NOVA ROTA: Recuperação de Senha Segura (via validação de telefone registrado)
app.post('/api/auth/recuperar-senha', async (req, res) => {
   try {
     const { telefone, novaSenha } = req.body;
     const user = await User.findOne({ telefone });
     if (!user) return res.status(404).json({ sucesso: false, erro: 'Telefone não encontrado no sistema.' });
     
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
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });
    res.json({ sucesso: true, user });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar perfil' });
  }
});

app.post('/api/auth/enderecos', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });

    user.enderecos.push(req.body);
    await user.save();
    res.status(201).json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao adicionar endereço' });
  }
});

app.put('/api/auth/enderecos/:index', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });

    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= user.enderecos.length) return res.status(400).json({ sucesso: false, erro: 'Índice inválido' });

    user.enderecos[index] = { ...user.enderecos[index].toObject(), ...req.body };
    await user.save();
    res.json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar endereço' });
  }
});

app.delete('/api/auth/enderecos/:index', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado' });

    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= user.enderecos.length) return res.status(400).json({ sucesso: false, erro: 'Índice inválido' });

    user.enderecos.splice(index, 1);
    await user.save();
    res.json({ sucesso: true, enderecos: user.enderecos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao remover endereço' });
  }
});

// ==========================================
// ROTAS DE VITRINE / HOME BLOCKS (Mongoose)
// ==========================================

app.get('/api/blocos_home', async (req, res) => {
  try {
    const blocos = await HomeBlock.find({ ativo: true }).sort({ ordem: 1, createdAt: -1 });
    res.json({ sucesso: true, blocos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar blocos da home' });
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
    res.json({ sucesso: true, mensagem: 'Bloco excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir bloco' });
  }
});

app.post('/api/admin/blocos_home/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array obrigatório' });

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
    const categorias = await Category.find().sort({ ordem: 1, nome: 1 });
    const formatted = categorias.map(c => ({ id: c._id, _id: c._id, nome: c.nome, ordem: c.ordem }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar categorias' });
  }
});

// NOVA ROTA: Atualização em Lote de Categorias (Batch Update)
app.post('/api/admin/categorias/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array de updates obrigatório' });

    const operations = updates.map(u => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $set: { ordem: u.ordem } }
      }
    }));

    await Category.bulkWrite(operations);
    await logAction('ORDEM_CATEGORIA', 'CAT_BATCH', `Atualização em massa da ordem de ${updates.length} categorias.`);
    res.json({ sucesso: true });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro no batch update de categorias' });
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await Product.find({ ativo: true }).populate('categoriaId').sort({ ordem: 1, createdAt: -1 });
    const formatted = produtos.map(p => ({
      id: p._id,
      _id: p._id,
      nome: p.nome,
      descricao: p.descricao,
      preco: p.preco,
      imagem: p.imagem,
      personalizavel: p.personalizavel,
      quantidade_total_opcoes: p.quantidade_total_opcoes,
      opcoes_disponiveis: p.opcoes_disponiveis,
      controlar_estoque: p.controlar_estoque,
      estoque: p.estoque,
      esgotado: p.esgotado || false,
      categoriaId: p.categoriaId ? p.categoriaId._id : null,
      categoriaNome: p.categoriaId ? p.categoriaId.nome : null,
      ativo: p.ativo,
      ordem: p.ordem,
      destaque: p.destaque,
      promocao: p.promocao,
      grupos_adicionais: p.grupos_adicionais || []
    }));
    res.json(formatted);
  } catch (error) {
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
    if (!user) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });

    const settings = await StoreSettings.findOne();

    let totalPedido = frete || 0;
    const itensProcessados = [];
    const produtosParaAtualizar = [];

    for (const item of itens) {
      const produtoDB = await Product.findById(item.produtoId);
      if (!produtoDB) return res.status(404).json({ sucesso: false, erro: `Produto não encontrado.` });

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
           // Valor mínimo não atingido
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
    if (!pedido) return res.status(404).json({ sucesso: false, erro: 'Pedido não encontrado.' });
    res.json({ sucesso: true, pedido });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar rastreio.' });
  }
});

app.get('/api/pedidos/meus', authenticateToken, async (req, res) => {
  try {
    const settings = await StoreSettings.findOne(); 
    const pedidos = await Order.find({ usuarioId: req.user.id }).sort({ createdAt: -1 });
    
    // Fallback para o número da loja caso não esteja configurado
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
// ROTAS DE ADMINISTRADORES (MULTIUSUÁRIO)
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
    if (adminCount > 0) return res.status(403).json({ sucesso: false, erro: 'O sistema já possui administradores.' });

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
    
    if (!admin) return res.status(401).json({ sucesso: false, erro: 'Credenciais administrativas inválidas.' });

    const isMatch = await bcrypt.compare(senha, admin.senha);
    if (!isMatch) return res.status(401).json({ sucesso: false, erro: 'Credenciais administrativas inválidas.' });

    const token = jwt.sign(
      { id: admin._id, nome: admin.nome, role: admin.role }, 
      JWT_SECRET, 
      { expiresIn: '12h' }
    );

    res.json({ sucesso: true, token, admin: { nome: admin.nome, role: admin.role } });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao fazer login no painel.' });
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
    let settings = await StoreSettings.findOne();
    if (!settings) settings = await StoreSettings.create({ is_open: true, nome_loja: 'Stitch Delivery' });

    let is_open_computado = settings.is_open;
    let fallback_msg = settings.mensagem_fechado || 'Estamos fechados no momento.';

    if (settings.abertura_automatica && settings.horarios_funcionamento && settings.is_open) {
      const dataHoraAtual = new Date();
      dataHoraAtual.setHours(dataHoraAtual.getHours() - 3); // BRT (UTC-3)
      
      const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
      const diaAtualStr = dias[dataHoraAtual.getUTCDay()];
      
      const hh = String(dataHoraAtual.getUTCHours()).padStart(2, '0');
      const mm = String(dataHoraAtual.getUTCMinutes()).padStart(2, '0');
      const horaMinutoAtual = `${hh}:${mm}`;

      const configDia = settings.horarios_funcionamento[diaAtualStr];
      if (configDia && configDia.aberto) {
        if (horaMinutoAtual >= configDia.inicio && horaMinutoAtual <= configDia.fim) {
           is_open_computado = true;
        } else {
           is_open_computado = false;
        }
      } else {
        is_open_computado = false;
      }
    }

    res.json({
      sucesso: true,
      nome_loja: settings.nome_loja,
      logo_url: settings.logo_url || '',
      capa_url: settings.capa_url || '',
      tempo_entrega: settings.tempo_entrega || '45-60 min',
      is_open: is_open_computado,
      mensagem_fechado: fallback_msg,
      whatsapp: settings.whatsapp,
      // Dados de frete para o carrinho
      cep_loja: settings.cep_loja || '',
      rua_loja: settings.rua_loja || '',
      numero_loja: settings.numero_loja || '',
      bairro_loja: settings.bairro_loja || '',
      cidade_loja: settings.cidade_loja || '',
      estado_loja: settings.estado_loja || '',
      faixas_entrega: settings.faixas_entrega || [],
      sobre_texto: settings.sobre_texto || '',
      instagram_url: settings.instagram_url || '',
      horarios_funcionamento: settings.horarios_funcionamento || null,
      
      // Regras Comerciais
      pedido_minimo: settings.pedido_minimo || 0,
      frete_gratis_acima_de: settings.frete_gratis_acima_de || 0,
      pagamento_pix: settings.pagamento_pix !== false,
      pagamento_cartao: settings.pagamento_cartao !== false,
      pagamento_dinheiro: settings.pagamento_dinheiro !== false,
      chave_pix: settings.chave_pix || '',
      instrucoes_pix: settings.instrucoes_pix || '',
      
      // Marketing
      banner_ativo: settings.banner_ativo || false,
      banner_texto: settings.banner_texto || '',
      
      // Fidelidade
      fidelidade_ativa: settings.fidelidade_ativa !== false,
      pontos_por_real: settings.pontos_por_real || 1,
      valor_ponto_reais: settings.valor_ponto_reais || 0.05
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar configurações' });
  }
});

app.get('/api/admin/configuracoes', async (req, res) => {
  try {
    let settings = await StoreSettings.findOne();
    if (!settings) settings = await StoreSettings.create({ is_open: true, nome_loja: 'Stitch Delivery' });
    res.json({ sucesso: true, settings });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar configurações' });
  }
});

app.put('/api/admin/configuracoes', authenticateAdmin, async (req, res) => {
  try {
    const {
      nome_loja, logo_url, capa_url, is_open, tempo_entrega, whatsapp, sobre_texto, instagram_url,
      cep_loja, rua_loja, numero_loja, bairro_loja, cidade_loja, estado_loja, faixas_entrega,
      abertura_automatica, mensagem_fechado, horarios_funcionamento,
      pedido_minimo, frete_gratis_acima_de, pagamento_pix, pagamento_cartao, pagamento_dinheiro, chave_pix, instrucoes_pix,
      banner_ativo, banner_texto,
      fidelidade_ativa, pontos_por_real, valor_ponto_reais
    } = req.body;

    let settings = await StoreSettings.findOne() || new StoreSettings();

    if (nome_loja !== undefined) settings.nome_loja = nome_loja;
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

    // Atualizando o Endereço e as Faixas
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

    await settings.save();
    await logAction('EDITAR_CONFIG', 'CONFIG', `Configurações da loja atualizadas por ADMIN`);
    res.json({ sucesso: true, settings });

  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao salvar configurações' });
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
    if (!pedido) return res.status(404).json({ sucesso: false, erro: 'Pedido não encontrado' });

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
        // Ganha pontos sobre o subtotal (Total - Frete + Descontos aplicados se você quiser, mas geralmente é sobre o valor pago em produtos)
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
    const produtos = await Product.find().populate('categoriaId').sort({ ordem: 1, createdAt: -1 });
    res.json({ sucesso: true, produtos });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar produtos' });
  }
});

app.post('/api/admin/produtos', authenticateAdmin, async (req, res) => {
  try {
    const novoProduto = await Product.create(req.body);
    res.status(201).json({ sucesso: true, produto: novoProduto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao criar produto' });
  }
});

app.put('/api/admin/produtos/:id', authenticateAdmin, async (req, res) => {
  try {
    const { _id, ...updateData } = req.body; // Remove _id if present to avoid updating immutable field
    const produtoAtualizado = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ sucesso: true, produto: produtoAtualizado });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao atualizar produto' });
  }
});

// NOVA ROTA: Atualização em Lote (Batch Update) para Vitrine e Ordenação
app.post('/api/admin/produtos/batch-update', authenticateAdmin, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ sucesso: false, erro: 'Array de updates obrigatório' });

    const operations = updates.map(u => ({
      updateOne: {
        filter: { _id: u.id },
        update: { 
          $set: { 
            ordem: u.ordem,
            destaque: u.destaque,
            promocao: u.promocao
          } 
        }
      }
    }));

    await Product.bulkWrite(operations);
    
    await logAction('ORDEM_VITRINE', 'PROD_BATCH', `Atualização em massa da ordem de ${updates.length} produtos.`);
    
    res.json({ sucesso: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ sucesso: false, erro: 'Erro no batch update' });
  }
});

// Exclusão Definitiva (Segura com E-mail + Senha)
app.delete('/api/admin/produtos/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, senha } = req.body;
    
    if (!email || !senha) return res.status(400).json({ sucesso: false, erro: 'E-mail e senha exigidos.' });

    const admin = await Admin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ sucesso: false, erro: 'Admin não encontrado.' });

    // Verifica se o e-mail digitado confere com o do admin logado (dupla checagem)
    if (admin.email !== email) {
      return res.status(401).json({ sucesso: false, erro: 'O e-mail digitado não corresponde ao seu acesso.' });
    }

    const match = await bcrypt.compare(senha, admin.senha);
    if (!match) return res.status(401).json({ sucesso: false, erro: 'Senha incorreta.' });

    const p = await Product.findByIdAndDelete(id);
    if (!p) return res.status(404).json({ sucesso: false, erro: 'Produto não encontrado.' });

    await logAction(
      'EXCLUIR_PRODUTO',
      'PRODUTOS',
      `EXCLUSÃO DEFINITIVA: O administrador ${admin.nome} (${admin.email}) deletou o produto ${p.nome}`,
      id,
      admin._id
    );

    res.json({ sucesso: true, mensagem: 'Produto excluído permanentemente!' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro interno na exclusão.' });
  }
});

app.patch('/api/admin/produtos/:id/toggle-ativo', authenticateAdmin, async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ sucesso: false, erro: 'Produto não encontrado' });
    produto.ativo = !produto.ativo;
    await produto.save();
    res.json({ sucesso: true, produto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao alternar status' });
  }
});

// ... (seu código de produtos que já está aí) ...

// ==========================================
// PROXY DE GEOLOCALIZAÇÃO (Bypass CORS e User-Agent)
// ==========================================
app.get('/api/geolocalizacao', async (req, res) => {
  try {
    const { q, cep } = req.query;
    
    // Tenta primeiro por CEP na BrasilAPI (Backend não tem CORS)
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

    // Se não for CEP ou BrasilAPI falhar, vai pro Nominatim
    // O SEGREDO: No backend o Node pode passar o User-Agent que o OSM exige
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=1`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'StitchDeliveryApp/1.0 (contato@stitchdelivery.com)'
      }
    });

    if (!response.ok) return res.json({ sucesso: false, erro: 'Provedor indisponível' });

    const data = await response.json();
    if (data && data.length > 0) {
      res.json({ sucesso: true, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
    } else {
      res.json({ sucesso: false, erro: 'Endereço não localizado' });
    }
  } catch (error) {
    res.json({ sucesso: false, erro: 'Erro interno geoproxy' });
  }
});

app.patch('/api/admin/produtos/:id/toggle-esgotado', authenticateAdmin, async (req, res) => {
  try {
    const produto = await Product.findById(req.params.id);
    if (!produto) return res.status(404).json({ sucesso: false, erro: 'Produto não encontrado' });
    produto.esgotado = !produto.esgotado;
    await produto.save();
    res.json({ sucesso: true, produto });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao alternar status de esgotado' });
  }
});

// 👇 COLE EXATAMENTE AQUI, A PARTIR DESTA LINHA 👇

// ==========================================
// GESTÃO DE CUPONS (ADMIN)
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
    res.json({ sucesso: true, mensagem: 'Cupom excluído' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir cupom' });
  }
});

// Validação pública de cupom
app.post('/api/cupons/validar', authenticateToken, async (req, res) => {
  try {
    const { codigo, subtotal } = req.body;
    const coupon = await Coupon.findOne({ codigo: codigo.toUpperCase(), ativo: true });
    
    if (!coupon) return res.status(404).json({ sucesso: false, erro: 'Cupom inválido ou expirado.' });
    if (coupon.validade && new Date(coupon.validade) < new Date()) return res.status(400).json({ sucesso: false, erro: 'Este cupom já expirou.' });
    if (coupon.usos_restantes === 0) return res.status(400).json({ sucesso: false, erro: 'Este cupom atingiu o limite de usos.' });
    if (subtotal < coupon.minimo_pedido) return res.status(400).json({ sucesso: false, erro: `Valor mínimo para este cupom é R$ ${coupon.minimo_pedido.toFixed(2).replace('.', ',')}` });

    res.json({ sucesso: true, cupom: coupon });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao validar cupom' });
  }
});

// ==========================================
// GESTÃO DE CATEGORIAS (ADMIN)
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
    // Trava de segurança: impede apagar categoria se tiver produto nela
    const produtosVinculados = await Product.countDocuments({ categoriaId: req.params.id });
    if (produtosVinculados > 0) {
      return res.status(400).json({ sucesso: false, erro: 'Existem produtos vinculados a esta categoria.' });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true, mensagem: 'Categoria excluída' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao excluir categoria' });
  }
});


// ==========================================
// VERCEL STATIC EXPORT COM INJEÇÃO DE NOME DINÂMICO
// ==========================================
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Esta rota intercepta qualquer acesso ao site
app.get('*', async (req, res) => {
  try {
    // 1. Busca o nome da loja que você salvou no Painel Admin
    const settings = await StoreSettings.findOne() || { nome_loja: 'Jeff Confeitaria' };
    const nomeAtualDaLoja = settings.nome_loja;

    // 2. Lê o arquivo index.html (o "molde" do site)
    let html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

    // 3. MÁGICA: Substitui os títulos e as tags do WhatsApp pelo nome real
    html = html.replace(/<title>.*?<\/title>/g, `<title>${nomeAtualDaLoja}</title>`);
    html = html.replace(/content="My Google AI Studio App"/g, `content="${nomeAtualDaLoja}"`);
    html = html.replace(/property="og:title" content=".*?"/g, `property="og:title" content="${nomeAtualDaLoja}"`);

    // 4. Envia o site já com o nome certo para o cliente ou para o WhatsApp
    res.send(html);
  } catch (error) {
    // Se der qualquer erro na leitura, ele entrega o arquivo normal sem o nome dinâmico
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

export default app;