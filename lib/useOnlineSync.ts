"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getQueue, syncQueue } from "./offlineQueue";
import { ensureSession } from "./offlineAuth";
import { isOfflineSession } from "./posSession";

export function useOnlineSync(opts?: {
  onReconnect?: () => void;
  onReauthenticated?: () => void;
  onSessionDeactivated?: () => void;
}) {
  const [isOnline, setIsOnline] = useState(true);
  // Ref espejo de isOnline: se actualiza síncronamente antes que el estado React,
  // para que sync() lo lea correctamente cuando se llama desde el handler de "online".
  const isOnlineRef = useRef(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const onReconnectRef = useRef(opts?.onReconnect);
  const onReauthenticatedRef = useRef(opts?.onReauthenticated);
  const onDeactivatedRef = useRef(opts?.onSessionDeactivated);
  useEffect(() => { onReconnectRef.current = opts?.onReconnect; }, [opts?.onReconnect]);
  useEffect(() => { onReauthenticatedRef.current = opts?.onReauthenticated; }, [opts?.onReauthenticated]);
  useEffect(() => { onDeactivatedRef.current = opts?.onSessionDeactivated; }, [opts?.onSessionDeactivated]);

  const updatePending = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  // Lee isOnlineRef (no el estado) para evitar race condition en reconexión:
  // setIsOnline(true) es asíncrono; isOnlineRef.current se actualiza antes de llamar sync().
  const initialSyncDone = useRef(false);

  const sync = useCallback(async () => {
    if (syncing || !isOnlineRef.current) return;

    // Gate proactivo: si esta pestaña arrancó con un login offline, esperar a
    // que ensureSession() consiga la cookie real ANTES de disparar el POST de
    // confirmación. Evita la carrera donde el sync le gana de mano al re-login
    // silencioso y pega contra el servidor sin sesión válida.
    if (isOfflineSession()) {
      const result = await ensureSession();
      if (result === "deactivated") {
        onDeactivatedRef.current?.();
        return;
      }
      if (result === "ok") {
        onReauthenticatedRef.current?.();
      }
      // "offline": no se pudo re-autenticar todavía (sin red real pese al
      // evento "online", o el cajero recargó la pestaña y se perdió el PIN en
      // memoria). Seguimos igual: syncQueue() trata el 401 resultante como
      // transitorio, sin consumir intentos ni perder la venta.
    }

    const count = getQueue().length;
    if (count === 0) return;
    setSyncing(true);
    try {
      const { synced, failed, review } = await syncQueue();
      updatePending();
      if (synced > 0) {
        toast.success(`${synced} venta${synced > 1 ? "s" : ""} sincronizada${synced > 1 ? "s" : ""} correctamente.`);
      }
      if (review > 0) {
        toast.error(
          `⚠️ ${review} venta${review > 1 ? "s" : ""} requiere${review > 1 ? "n" : ""} revisión manual. Abrí "Ventas con error".`,
          { duration: 10000 },
        );
      }
      if (failed > 0) {
        toast.error(`${failed} venta${failed > 1 ? "s" : ""} no se pudo${failed > 1 ? "n" : ""} sincronizar. Revisá la conexión.`);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, updatePending]);

  useEffect(() => {
    const online = navigator.onLine;
    isOnlineRef.current = online;
    setIsOnline(online);
    updatePending();

    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      if (online && getQueue().length > 0) sync();
    }

    const handleOnline = () => {
      isOnlineRef.current = true;  // actualizar ref síncronamente ANTES de llamar sync()
      setIsOnline(true);
      sync();
      onReconnectRef.current?.();
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync, updatePending]);

  return { isOnline, pendingCount, syncing, sync, updatePending };
}
