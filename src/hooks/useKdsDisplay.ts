import { useCallback, useEffect, useRef, useState } from 'react';

export function useKdsDisplay(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!active && document.fullscreenElement === containerRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [active]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    await containerRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    let disposed = false;
    let requestInFlight = false;
    const wakeLock = navigator.wakeLock;

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel) await sentinel.release().catch(() => undefined);
      if (!disposed) setWakeLockActive(false);
    };

    const requestWakeLock = () => {
      if (!active || !wakeLock || document.visibilityState !== 'visible' || wakeLockRef.current) return;
      if (requestInFlight) return;

      requestInFlight = true;
      void wakeLock.request('screen').then(async (sentinel) => {
        if (disposed || !active) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          if (!disposed) setWakeLockActive(false);
        }, { once: true });
      }).catch(() => {
        if (!disposed) setWakeLockActive(false);
      }).finally(() => {
        requestInFlight = false;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [active]);

  return { containerRef, isFullscreen, toggleFullscreen, wakeLockActive };
}
