"use client";

import { useCallback } from "react";
import { fetchHealthSummary } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";

/**
 * Estado del motor de visión de un local a partir de /api/analytics/health
 * (polling cada 15s). Multi-cámara: el servidor ya decide "online" por cámara
 * con la antigüedad calculada de su lado (ver STALE_SECONDS en la ruta), acá
 * solo se agrega para mostrar "N de M cámaras en línea".
 */
export function useDeviceStatus(storeId: string): {
  online: boolean;
  onlineCount: number;
  totalCount: number;
} {
  const fetcher = useCallback((signal: AbortSignal) => fetchHealthSummary(storeId, signal), [storeId]);
  const { data } = usePolling(storeId, fetcher);

  return {
    online: (data?.onlineCount ?? 0) > 0,
    onlineCount: data?.onlineCount ?? 0,
    totalCount: data?.totalCount ?? 0,
  };
}
