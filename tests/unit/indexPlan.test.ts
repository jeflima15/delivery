import { expect, it } from 'vitest';
import { planIndexes, type IndexInventory } from '../../scripts/migrations/indexPlan.js';

const phone = { key: { tenantId: 1, normalizedPhone: 1 }, options: { unique: true, partialFilterExpression: { tenantId: { $exists: true }, normalizedPhone: { $type: 'string' } } } };
const inventory: IndexInventory[] = [{ collection: 'users', desired: [phone], existing: [
  { key: { _id: 1 }, name: '_id_' },
  { key: { telefone: 1 }, name: 'telefone_1', unique: true },
  { key: phone.key, ...phone.options, name: 'tenant_phone_unique' },
  { key: { email: 1 }, name: 'email_1', unique: true },
] }];

it('preserva todos os indices por padrao, incluindo globais e composto com outro nome', () => {
  const plan = planIndexes(inventory);
  expect(plan.create).toEqual([]);
  expect(plan.drop).toEqual([]);
  expect(plan.preserved).toHaveLength(4);
  expect(plan.candidates).toEqual(['users:telefone_1']);
});

it('somente seleciona definicao historica exata e explicitamente solicitada', () => {
  expect(planIndexes(inventory, ['users:telefone_1']).drop).toHaveLength(1);
  expect(planIndexes(inventory, ['users:email_1']).blockers).toHaveLength(1);
  expect(planIndexes([{ ...inventory[0], existing: [{ key: { telefone: 1 }, name: 'telefone_1', unique: true, sparse: true }] }], ['users:telefone_1']).blockers).toHaveLength(1);
});

it('nao confunde indice parcial inadequado com unicidade correta e bloqueia colisao por nome', () => {
  const existing = [{ key: phone.key, name: 'tenantId_1_normalizedPhone_1', unique: false }];
  expect(planIndexes([{ ...inventory[0], existing }]).blockers).toHaveLength(1);
  expect(planIndexes([{ ...inventory[0], existing: [] }]).create).toHaveLength(1);
  expect(planIndexes(inventory).fingerprint).not.toBe(planIndexes(inventory, ['users:telefone_1']).fingerprint);
});
