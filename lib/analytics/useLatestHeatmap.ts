"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLatestHeatmap } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import { useTickingAge, type AgeBaseline } from "@/lib/analytics/useTickingAge";
import type { HeatmapRow } from "@/lib/analytics/types";

/**
 * Última grilla de calor del local, refrescada por polling cada 15s desde
 * /api/analytics/heatmap. `ageSeconds` es la antigüedad en vivo, calculada
 * desde el reloj del servidor (no el del navegador).
 */
export function useLatestHeatmap(storeId: string): {
  heatmap: HeatmapRow | null;
  loading: boolean;
  ageSeconds: number | null;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchLatestHeatmap(storeId, signal), [storeId]);
  const { data, loading } = usePolling(storeId, fetcher);
  const [baseline, setBaseline] = useState<AgeBaseline | null>(null);

  useEffect(() => {
    if (data?.ageSeconds != null) {
      setBaseline({ seconds: data.ageSeconds, capturedAtMs: Date.now() });
    } else if (!data?.heatmap) {
      setBaseline(null);
    }
  }, [data]);

  const ageSeconds = useTickingAge(baseline);

  return { heatmap: data?.heatmap ?? null, loading, ageSeconds: loading ? null : ageSeconds };
}
