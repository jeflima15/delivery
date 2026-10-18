import mongoose from 'mongoose';
import { afterEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../server/db/connect.js';

afterEach(() => { globalThis.__mongooseConnection = undefined; vi.restoreAllMocks(); });

it('reutiliza conexao sem inventariar, criar, transformar ou remover indices', async () => {
  const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  const ddl = vi.spyOn(mongoose.connection, 'collection').mockImplementation(() => { throw new Error('DDL inesperado'); });
  const first = connectDatabase();
  expect(connectDatabase()).toBe(first);
  await first;
  expect(connect).toHaveBeenCalledTimes(1);
  expect(connect.mock.calls[0][1]).toMatchObject({ autoIndex: false, autoCreate: false, maxPoolSize: 10 });
  expect(ddl).not.toHaveBeenCalled();
});

it('libera cache para nova tentativa apos falha', async () => {
  const connect = vi.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(mongoose);
  await expect(connectDatabase()).rejects.toThrow('offline');
  await expect(connectDatabase()).resolves.toBe(mongoose);
  expect(connect).toHaveBeenCalledTimes(2);
});
