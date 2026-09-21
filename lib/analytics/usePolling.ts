"use client";

import { useEffect, useState } from "react";

export const POLL_INTERVAL_MS = 15_000;

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
 */
export function usePolling<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs = POLL_INTERVAL_MS
): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<Polled<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

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
      try {
        const data = await fetcher(controller.signal);
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

  // Estado de otro recurso (store anterior) o primer poll pendiente => cargando.
  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
  };
}
