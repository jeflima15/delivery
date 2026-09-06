import { describe, expect, it, vi } from 'vitest';
import { lazyWithPreload } from '../../src/components/tenant-admin/lazyWithPreload';

const TestComponent = () => null;

describe('lazyWithPreload', () => {
  it('reutiliza a mesma importacao entre preload e renderizacao', async () => {
    const factory = vi.fn().mockResolvedValue({ default: TestComponent });
    const LazyComponent = lazyWithPreload(factory);

    const [first, second] = await Promise.all([LazyComponent.preload(), LazyComponent.preload()]);

    expect(first.default).toBe(TestComponent);
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('repete uma vez quando o navegador falha ao baixar um chunk', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: TestComponent });
    const LazyComponent = lazyWithPreload(factory);

    await expect(LazyComponent.preload()).resolves.toEqual({ default: TestComponent });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('nao repete erros que nao sao de carregamento de chunk', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('Modulo invalido'));
    const LazyComponent = lazyWithPreload(factory);

    await expect(LazyComponent.preload()).rejects.toThrow('Modulo invalido');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
