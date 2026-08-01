import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export function useRemote<T>(loader: () => Promise<T>, dependencies: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    loader().then((result) => { if (active) setData(result); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao carregar os dados.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [...dependencies, refreshKey]);
  return { data, loading, error, refresh: () => setRefreshKey((value) => value + 1), setData };
}
