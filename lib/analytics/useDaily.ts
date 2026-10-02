"use client";

import { useCallback } from "react";
import { fetchDaily } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import type { DailyResponse } from "@/lib/analytics/types";

export const TREND_DAYS = 14;
// La historia no cambia y "hoy" se mueve despacio: alcanza con un poll por minuto.
const DAILY_POLL_MS = 60_000;

/**
 * Tendencia diaria (visitas, tickets, facturación) de un local y las muestras
 * para "hoy vs. tu promedio", por polling desde /api/analytics/daily. `daily`
 * es `null` hasta la primera respuesta.
 */
export function useDaily(storeId: string): {
  daily: DailyResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchDaily(storeId, TREND_DAYS, signal), [storeId]);
  const { data, loading, error, refetch } = usePolling(storeId, fetcher, DAILY_POLL_MS);

  return { daily: data, loading, error, refetch };
}
