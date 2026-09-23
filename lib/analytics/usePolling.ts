"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_INTERVAL_MS = 15_000;
// Cada tanto se ignora cualquier atajo incremental (ej. afterId) y se vuelve a
// pedir todo: red de seguridad si un delta se perdió silenciosamente en algún
// poll (fetch abortado, respuesta parcial) y el polling quedó desalineado.
const FULL_REFETCH_EVERY = 20;

interface Polled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Consulta `fetcher` al montar y cada `intervalMs`. Se pausa con la pestaña
 * oculta o sin conexión, y refresca de inmediato al volver. `key` identifica el
 * recurso (ej. el store): al cambiar, el resultado anterior deja de mostrarse.
 * Si un poll falla, se conserva el último dato bueno y se informa el error.
 * `fetcher` recibe además `forceFull`, en true cada ~20 polls (ver
 * FULL_REFETCH_EVERY), para que un fetcher con estado incremental propio
 * (ej. useTodayCounts) pueda resincronizarse desde cero.
 */
export function usePolling<T>(
  key: string,
  fetcher: (signal: AbortSignal, forceFull: boolean) => Promise<T>,
  intervalMs = POLL_INTERVAL_MS
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [state, setState] = useState<Polled<T> | null>(null);
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let pollCount = 0;

    const schedule = () => {
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    async function tick() {
      clearTimeout(timer);
      if (document.visibilityState === "hidden" || !navigator.onLine) {
        schedule();
        return;
      }
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const forceFull = pollCount > 0 && pollCount % FULL_REFETCH_EVERY === 0;
      pollCount++;
      try {
        const data = await fetcher(controller.signal, forceFull);
        if (!cancelled) setState({ key, data, error: null });
      } catch (e) {
        if (!cancelled) {
          const error = e instanceof Error ? e.message : String(e);
          setState((s) => ({ key, data: s?.key === key ? s.data : null, error }));
        }
      } finally {
        inFlight = false;
      }
      schedule();
    }

    triggerRef.current = () => {
      clearTimeout(timer);
      void tick();
    };

    const wake = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [key, fetcher, intervalMs]);

  const refetch = useCallback(() => triggerRef.current(), []);

  // Estado de otro recurso (store anterior) o primer poll pendiente => cargando.
  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    refetch,
  };
}
