"use client";
import { useEffect, useState, useCallback } from "react";
import { getQueue, syncQueue } from "./offlineQueue";

export function useOnlineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const updatePending = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  const sync = useCallback(async () => {
    if (syncing || !isOnline) return;
    const count = getQueue().length;
    if (count === 0) return;
    setSyncing(true);
    try {
      const { synced, failed } = await syncQueue();
      updatePending();
      if (synced > 0) {
        alert(`✅ ${synced} venta${synced > 1 ? "s" : ""} sincronizada${synced > 1 ? "s" : ""} correctamente.`);
      }
      if (failed > 0) {
        alert(`⚠️ ${failed} venta${failed > 1 ? "s" : ""} no se pudo${failed > 1 ? "n" : ""} sincronizar. Revisá la conexión.`);
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
