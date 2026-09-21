"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLatestHealth } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";

const STALE_MS = 60_000; // sin latido por 60s => sin señal

/**
 * Estado del motor de visión de un local a partir del heartbeat
 * (/api/analytics/health, polling cada 15s).
 * online = último latido reciente y status "online".
 */
export function useDeviceStatus(storeId: string): {
  online: boolean;
  fps: number;
  lastSeen: string | null;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchLatestHealth(storeId, signal), [storeId]);
  const { data: health } = usePolling(storeId, fetcher);
  const [now, setNow] = useState(() => Date.now());

  // Reevalúa "reciente" cada 15s aunque un poll falle o esté pausado.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const fresh = !!health && now - new Date(health.ts).getTime() < STALE_MS;
  const online = fresh && health?.status === "online";

  return {
    online: !!online,
    fps: health?.fps ?? 0,
    lastSeen: health?.ts ?? null,
  };
}
