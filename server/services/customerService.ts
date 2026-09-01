import type { Request } from 'express';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { HttpError } from '../middleware/errors.js';

export function customerDto(user: Record<string, any>) {
  return {
    id: String(user._id),
    nome: user.nome,
    telefone: user.telefone,
    email: user.email || '',
    nascimento: user.nascimento || '',
    genero: user.genero || '',
    hasPassword: Boolean(user.senha),
    pontos: Number(user.pontos || 0),
    enderecos: (user.enderecos || []).map((address: Record<string, any>) => ({
      id: String(address._id),
      titulo: address.titulo || '',
      logradouro: address.logradouro || '',
      numero: address.numero || '',
      complemento: address.complemento || '',
      referencia: address.referencia || '',
      bairro: address.bairro || '',
      cidade: address.cidade || '',
      estado: address.estado || '',
      cep: address.cep || '',
      latitude: address.latitude,
      longitude: address.longitude,
      locationConfirmed: Boolean(address.locationConfirmed),
      padrao: Boolean(address.padrao),
    })),
  };
}

export function identifiedCustomerDto(user: Record<string, any>) {
  return {
    id: String(user._id),
    nome: user.nome,
    telefone: user.telefone,
    hasPassword: Boolean(user.senha),
    email: '',
    nascimento: '',
    genero: '',
    pontos: 0,
    enderecos: [],
  };
}

export function assertCustomerTenant(req: Request): mongoose.Types.ObjectId {
  if (req.auth?.accountType !== 'customer' || req.auth.tenantId?.toString() !== req.tenant?._id.toString()) {
    throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN');
  }
  return req.auth.accountId;
}

export async function authenticatedCustomer(req: Request, select = '') {
  const accountId = assertCustomerTenant(req);
  const query = User.findOne({ _id: accountId, tenantId: req.tenant!._id });
  if (select) query.select(select);
  const user = await query;
  if (!user) throw new HttpError(401, 'Sessao invalida.', 'INVALID_SESSION');
  return user;
}
