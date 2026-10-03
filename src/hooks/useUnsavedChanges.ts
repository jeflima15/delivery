import { useEffect, useRef } from 'react';

export function useUnsavedChanges(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  const callback = useRef(onDirtyChange);
  callback.current = onDirtyChange;
  useEffect(() => { callback.current?.(dirty); return () => callback.current?.(false); }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  return () => !dirty || window.confirm('Existem alterações não salvas. Descartar e continuar?');
}
