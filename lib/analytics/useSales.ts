"use client";

import { useCallback } from "react";
import { fetchSales } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import type { SalesResponse } from "@/lib/analytics/types";

const EMPTY: SalesResponse = { totalSales: 0, totalRevenue: 0, perHour: [] };

/**
 * Ventas confirmadas de hoy (hora de Argentina) de un local, por polling cada
 * 15s desde /api/analytics/sales. Solo lectura de `public.sales`.
 */
export function useSales(storeId: string): {
  sales: SalesResponse;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchSales(storeId, signal), [storeId]);
  const { data, loading, error, refetch } = usePolling(storeId, fetcher);

  return { sales: data ?? EMPTY, loading, error, refetch };
}
