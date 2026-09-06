import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleFactory<Props extends object> = () => Promise<{ default: ComponentType<Props> }>;

export type PreloadableLazyComponent<Props extends object> = LazyExoticComponent<ComponentType<Props>> & {
  preload: () => Promise<{ default: ComponentType<Props> }>;
};

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /chunk|dynamically imported module|failed to fetch/i.test(message);
}

export function lazyWithPreload<Props extends object>(
  factory: ModuleFactory<Props>,
): PreloadableLazyComponent<Props> {
  let pending: Promise<{ default: ComponentType<Props> }> | null = null;

  const load = () => {
    if (pending) return pending;
    pending = factory().catch(async (error) => {
      pending = null;
      if (!isChunkLoadError(error)) throw error;
      return factory();
    });
    return pending;
  };

  const Component = lazy(load) as PreloadableLazyComponent<Props>;
  Component.preload = load;
  return Component;
}
