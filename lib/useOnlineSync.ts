"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getQueue, syncQueue } from "./offlineQueue";

export function useOnlineSync(onReconnect?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const updatePending = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  const sync = useCallback(async () => {
    if (syncing || !isOnline) return;
    const count = getQueue().length;
    if (count === 0) return;
    setSyncing(true);
    try {
      const { synced, failed, abandoned } = await syncQueue();
      updatePending();
      if (synced > 0) {
        toast.success(`${synced} venta${synced > 1 ? "s" : ""} sincronizada${synced > 1 ? "s" : ""} correctamente.`);
      }
      if (abandoned > 0) {
        toast.error("⚠️ Venta no pudo sincronizarse después de 3 intentos. Revisá el historial.", { duration: 8000 });
      }
      if (failed > 0) {
        toast.error(`${failed} venta${failed > 1 ? "s" : ""} no se pudo${failed > 1 ? "n" : ""} sincronizar. Revisá la conexión.`);
      }
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing, updatePending]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    updatePending();

    const handleOnline = () => {
      setIsOnline(true);
      sync();
      onReconnectRef.current?.();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync, updatePending]);

  return { isOnline, pendingCount, syncing, sync, updatePending };
}
