"use client";

import { useCallback } from "react";
import { fetchLatestHeatmap } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import type { HeatmapRow } from "@/lib/analytics/types";

/**
 * Última grilla de calor del local, refrescada por polling cada 15s desde
 * /api/analytics/heatmap.
 */
export function useLatestHeatmap(storeId: string): {
  heatmap: HeatmapRow | null;
  loading: boolean;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchLatestHeatmap(storeId, signal), [storeId]);
  const { data, loading } = usePolling(storeId, fetcher);

  return { heatmap: data, loading };
}
