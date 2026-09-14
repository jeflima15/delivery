import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

it('service worker displays notifications without an open page and restricts click URLs to same origin', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = { addEventListener: (name: string, callback: (event: any) => void) => { handlers[name] = callback; }, location: { origin: 'https://podevir.test' }, registration: { showNotification }, clients: { matchAll: async () => [], openWindow } };
  vm.runInNewContext(readFileSync('public/push-sw.js', 'utf8'), { self, URL });
  let work: Promise<unknown>;
  handlers.push({ data: { json: () => ({ body: 'Nova encomenda', tag: 'order-1', url: '/loja/admin/pedidos?order=1' }) }, waitUntil: (value: Promise<unknown>) => { work = value; } });
  await work!;
  expect(showNotification).toHaveBeenCalledWith('Pode Vir', expect.objectContaining({ body: 'Nova encomenda', tag: 'order-1', data: { url: '/loja/admin/pedidos?order=1' } }));
  handlers.notificationclick({ notification: { close: vi.fn(), data: { url: '/loja/admin/pedidos?order=1' } }, waitUntil: (value: Promise<unknown>) => { work = value; } });
  await work!;
  expect(openWindow).toHaveBeenCalledWith('https://podevir.test/loja/admin/pedidos?order=1');
  handlers.push({ data: { json: () => ({ url: 'https://evil.test' }) }, waitUntil: (value: Promise<unknown>) => { work = value; } });
  await work!;
  expect(showNotification).toHaveBeenLastCalledWith('Pode Vir', expect.objectContaining({ data: { url: '/' } }));
});
