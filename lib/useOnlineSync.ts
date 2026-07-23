"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getQueue, syncQueue } from "./offlineQueue";
import { ensureSession } from "./offlineAuth";
import { isOfflineSession } from "./posSession";

// El evento "online" del navegador avisa que la interfaz de red subió
// (asociación WiFi, DHCP en curso) — NO que ya haya internet real (falta
// DNS, ruta a internet). Un solo intento en ese instante puede fallar por
// una ventana de varios segundos. Por eso: se espera un poco antes del
// primer intento, se reintenta con backoff corto si sigue quedando cola, y
// un latido de fondo actúa como red de seguridad para que la cola nunca
// quede dormida esperando un evento "online" que ya pasó (cubre también
// quedarse offline toda la noche sin que nadie vuelva a tocar la pantalla).
const RECONNECT_DELAY_MS = 4_000;
const RETRY_BACKOFF_MS = [10_000, 30_000, 60_000];
const HEARTBEAT_MS = 60_000;

export function useOnlineSync(opts?: {
  onReconnect?: () => void;
  onReauthenticated?: () => void;
  onSessionDeactivated?: () => void;
  onNeedsPin?: () => void;
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
  const onNeedsPinRef = useRef(opts?.onNeedsPin);
  useEffect(() => { onReconnectRef.current = opts?.onReconnect; }, [opts?.onReconnect]);
  useEffect(() => { onReauthenticatedRef.current = opts?.onReauthenticated; }, [opts?.onReauthenticated]);
  useEffect(() => { onDeactivatedRef.current = opts?.onSessionDeactivated; }, [opts?.onSessionDeactivated]);
  useEffect(() => { onNeedsPinRef.current = opts?.onNeedsPin; }, [opts?.onNeedsPin]);

  const updatePending = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  // Lee isOnlineRef (no el estado) para evitar race condition en reconexión:
  // setIsOnline(true) es asíncrono; isOnlineRef.current se actualiza antes de llamar sync().
  const initialSyncDone = useRef(false);

  // Placeholder actualizado por el efecto de abajo apenas sync() se define —
  // permite que scheduleRetry() (definido antes que sync por el orden de
  // dependencias de useCallback) siempre invoque la versión más reciente sin
  // crear un ciclo sync↔scheduleRetry en los arrays de dependencias.
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryStepRef = useRef(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetryTimer();
    const step = Math.min(retryStepRef.current, RETRY_BACKOFF_MS.length - 1);
    retryStepRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void syncRef.current();
    }, RETRY_BACKOFF_MS[step]);
  }, [clearRetryTimer]);

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
      if (result === "needs_pin") {
        // Ni la memoria ni el respaldo cifrado tienen credenciales para
        // reintentar en silencio (TTL vencido, storage corrupto, etc.). No
        // tiene sentido pegarle igual al servidor — pausamos y le pedimos al
        // cajero que confirme su PIN; la cola queda intacta mientras tanto.
        onNeedsPinRef.current?.();
        return;
      }
      // "offline": no se pudo re-autenticar todavía (sin red real pese al
      // evento "online"). Seguimos igual: syncQueue() trata el 401 resultante
      // como transitorio, sin consumir intentos ni perder la venta.
    }

    const count = getQueue().length;
    if (count === 0) {
      retryStepRef.current = 0;
      clearRetryTimer();
      return;
    }
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

      if (getQueue().length > 0 && isOnlineRef.current) {
        // Sigue quedando cola (típicamente 401/red transitorio, p. ej. justo
        // después del evento "online" sin internet real todavía): reintentar
        // con backoff corto en vez de esperar al próximo evento o al latido.
        scheduleRetry();
      } else {
        retryStepRef.current = 0;
        clearRetryTimer();
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, updatePending, clearRetryTimer, scheduleRetry]);

  useEffect(() => { syncRef.current = sync; }, [sync]);

  useEffect(() => {
    const online = navigator.onLine;
    isOnlineRef.current = online;
    setIsOnline(online);
    updatePending();

    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      if (online && getQueue().length > 0) void syncRef.current();
    }

    const handleOnline = () => {
      isOnlineRef.current = true;  // actualizar ref síncronamente ANTES de llamar sync()
      setIsOnline(true);
      // No sincronizar en el instante mismo del evento: dar tiempo a que
      // haya internet real (DNS/DHCP), no solo la interfaz de red arriba.
      clearRetryTimer();
      retryStepRef.current = 0;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void syncRef.current();
      }, RECONNECT_DELAY_MS);
      onReconnectRef.current?.();
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
      clearRetryTimer();
      retryStepRef.current = 0;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Latido de fondo: red de seguridad para cuando no hubo (o no bastó) un
    // evento "online" — p. ej. la pestaña quedó abierta con la cola pendiente
    // y la conexión volvió sin que el navegador emitiera el evento.
    const heartbeat = setInterval(() => {
      if (navigator.onLine && getQueue().length > 0) void syncRef.current();
    }, HEARTBEAT_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(heartbeat);
      clearRetryTimer();
    };
  }, [updatePending, clearRetryTimer]);

  return { isOnline, pendingCount, syncing, sync, updatePending };
}
