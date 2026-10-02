"use client";

import { useCallback, useState } from "react";
import { fetchHealthSummary } from "@/lib/analytics/queries";
import { usePolling } from "@/lib/analytics/usePolling";
import { useTickingAge, type AgeBaseline } from "@/lib/analytics/useTickingAge";

/**
 * Estado del motor de visión de un local a partir de /api/analytics/health
 * (polling cada 15s). Multi-cámara: el servidor ya decide "online" por cámara
 * con la antigüedad calculada de su lado (ver STALE_SECONDS en la ruta), acá
 * solo se agrega para mostrar "N de M cámaras en línea".
 * `lastHeartbeatAgeSeconds` es la antigüedad en vivo del último latido del
 * local (para la alerta "motor sin señal"); `null` mientras carga o si el
 * local nunca tuvo latidos.
 */
export function useDeviceStatus(storeId: string): {
  online: boolean;
  onlineCount: number;
  totalCount: number;
  lastHeartbeatAgeSeconds: number | null;
} {
  const [ageBaseline, setAgeBaseline] = useState<AgeBaseline | null>(null);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetchHealthSummary(storeId, signal);
      if (!signal.aborted) {
        setAgeBaseline(
          res.lastHeartbeatAgeSeconds === null
            ? null
            : { seconds: res.lastHeartbeatAgeSeconds, capturedAtMs: Date.now() }
        );
      }
      return res;
    },
    [storeId]
  );
  const { data, loading } = usePolling(storeId, fetcher);
  const lastHeartbeatAgeSeconds = useTickingAge(ageBaseline);

  return {
    online: (data?.onlineCount ?? 0) > 0,
    onlineCount: data?.onlineCount ?? 0,
    totalCount: data?.totalCount ?? 0,
    // Al cambiar de local, el baseline anterior no vale hasta que llegue el nuevo.
    lastHeartbeatAgeSeconds: loading ? null : lastHeartbeatAgeSeconds,
  };
}
