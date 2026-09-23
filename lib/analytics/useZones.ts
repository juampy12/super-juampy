"use client";

import { useCallback } from "react";
import { fetchZones } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import type { ZoneSeconds } from "@/lib/analytics/types";

const NO_ZONES: ZoneSeconds[] = [];

/**
 * Permanencia del día por zona (de mayor a menor), refrescada por polling cada
 * 15s desde /api/analytics/zones.
 */
export function useZones(storeId: string): {
  zones: ZoneSeconds[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchZones(storeId, signal), [storeId]);
  const { data, loading, error, refetch } = usePolling(storeId, fetcher);

  return { zones: data ?? NO_ZONES, loading, error, refetch };
}
