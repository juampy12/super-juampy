"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getQueue, syncQueue } from "./offlineQueue";

export function useOnlineSync(onReconnect?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  // Ref espejo de isOnline: se actualiza síncronamente antes que el estado React,
  // para que sync() lo lea correctamente cuando se llama desde el handler de "online".
  const isOnlineRef = useRef(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const updatePending = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  // Lee isOnlineRef (no el estado) para evitar race condition en reconexión:
  // setIsOnline(true) es asíncrono; isOnlineRef.current se actualiza antes de llamar sync().
  const sync = useCallback(async () => {
    if (syncing || !isOnlineRef.current) return;
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
  }, [syncing, updatePending]);

  useEffect(() => {
    const online = navigator.onLine;
    isOnlineRef.current = online;
    setIsOnline(online);
    updatePending();

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
