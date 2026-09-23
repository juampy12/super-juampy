"use client";

import { useCallback, useRef, useState } from "react";
import { fetchTodayCounts } from "@/lib/analytics/queries";
import { applyCounts, type CountsMemo } from "@/lib/analytics/countsMemo";
import { usePolling } from "@/lib/analytics/usePolling";
import { useTickingAge, type AgeBaseline } from "@/lib/analytics/useTickingAge";
import type { CountRow } from "@/lib/analytics/types";

interface State {
  rows: CountRow[];
  latest: CountRow | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Antigüedad en vivo (segundos) de `latest`, calculada desde el reloj del servidor. */
  latestAgeSeconds: number | null;
}

const NO_ROWS: CountRow[] = [];

/**
 * Conteos del día de un local, por polling cada 15s desde /api/analytics/counts.
 * La primera carga trae todo el día; los polls siguientes piden solo las filas
 * con id mayor al último recibido y las agregan a las que ya están en memoria.
 * Si cambia el día (hora de Argentina) descarta lo acumulado y vuelve a traer el
 * día completo. Cada ~20 polls (ver usePolling) se ignora el incremental como
 * red de seguridad, por si alguno se perdió silenciosamente.
 */
export function useTodayCounts(storeId: string): State {
  const memoRef = useRef<{ store: string; memo: CountsMemo } | null>(null);
  const [ageBaseline, setAgeBaseline] = useState<AgeBaseline | null>(null);

  const fetcher = useCallback(
    async (signal: AbortSignal, forceFull: boolean): Promise<CountRow[]> => {
      let memo = !forceFull && memoRef.current?.store === storeId ? memoRef.current.memo : null;

      let res = await fetchTodayCounts(storeId, { afterId: memo?.lastId, signal });
      if (memo && res.day !== memo.day) {
        // Cambió el día: lo acumulado es de ayer y esta respuesta es incremental.
        memo = null;
        res = await fetchTodayCounts(storeId, { signal });
      }
      // Cambio de local (o desmontaje) mientras esperaba: no pisar la memoria del nuevo.
      if (signal.aborted) return memo?.rows ?? NO_ROWS;

      const next = applyCounts(memo, res);
      memoRef.current = { store: storeId, memo: next };
      if (res.latestAgeSeconds !== null) {
        setAgeBaseline({ seconds: res.latestAgeSeconds, capturedAtMs: Date.now() });
      }
      return next.rows;
    },
    [storeId]
  );

  const { data, loading, error, refetch } = usePolling(storeId, fetcher);
  const latestAgeSeconds = useTickingAge(ageBaseline);

  const rows = data ?? NO_ROWS;
  return {
    rows,
    latest: rows.at(-1) ?? null,
    loading,
    error,
    refetch,
    latestAgeSeconds: loading ? null : latestAgeSeconds,
  };
}
