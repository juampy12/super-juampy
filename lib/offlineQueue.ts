export type QueuedSale = {
  id: string;
  payload: {
    items: unknown[];
    total: number;
    payment: unknown;
    store_id: string;
    register_id: string | null;
    idempotency_key: string;
  };
  queuedAt: number;
  attempts: number;
};

// Venta que agotó los reintentos automáticos por un rechazo de negocio (4xx
// que no es de sesión): nunca se descarta sola, queda visible acá para que
// un humano decida — reintentar tras corregir el dato en el servidor, o
// descartar explícitamente sabiendo que la venta no se puede recuperar.
export type FailedSale = QueuedSale & {
  failedAt: number;
  lastError: string;
};

const QUEUE_KEY = "pos_offline_queue_v1";
const FAILED_QUEUE_KEY = "failed_sales_queue_v1";
const MAX_ATTEMPTS = 3;
// Nombre del candado Web Locks compartido entre pestañas del mismo origen.
const SYNC_LOCK_NAME = "sj_pos_offline_sync";

/**
 * Error al leer/escribir la cola en localStorage (memoria del navegador llena,
 * o lista dañada que no se pudo respaldar). Quien encola una venta DEBE
 * atraparlo y avisar al cajero: la venta no quedó guardada en ningún lado.
 */
export class OfflineQueueStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OfflineQueueStorageError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regla de oro de este módulo (fix C1, venta perdida durante el sync):
//
// NUNCA se guarda una copia vieja de la lista. Cada escritura pasa por
// mutateList(), que lee la lista REAL en ese instante, aplica el cambio sobre
// la venta afectada (por id) y guarda — todo sincrónico, sin ningún `await`
// en el medio. JavaScript ejecuta un solo código a la vez por pestaña, así
// que entre esa lectura y esa escritura no puede colarse ningún addToQueue()
// ni retryFailedSale(). Toda la espera de red queda FUERA de mutateList().
//
// Antes, syncQueue() leía la lista una vez al arrancar y, tras cada fetch
// (segundos con internet lento), guardaba esa foto vieja: cualquier venta
// encolada mientras tanto se pisaba y desaparecía sin rastro.
// ─────────────────────────────────────────────────────────────────────────────

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

type ReadResult<T> = { list: T[]; ok: boolean };

/**
 * Lee una lista de localStorage. Si el contenido está dañado (no es JSON o no
 * es un array), lo MUEVE a una clave de respaldo `<key>_corrupt_<timestamp>`
 * en vez de tratarlo como "vacío" y dejar que la próxima escritura lo pise.
 * `ok=false` significa que ni siquiera se pudo respaldar: en ese caso no hay
 * que escribir sobre la clave original.
 */
function readList<T>(key: string): ReadResult<T> {
  if (!hasStorage()) return { list: [], ok: true };

  const raw = localStorage.getItem(key);
  if (raw === null) return { list: [], ok: true };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { list: parsed as T[], ok: true };
  } catch {
    // cae al respaldo de abajo
  }

  try {
    localStorage.setItem(`${key}_corrupt_${Date.now()}`, raw);
    // Recién con el respaldo escrito se libera la clave original (si no, cada
    // lectura —el contador de pendientes lee seguido— crearía otro respaldo).
    localStorage.removeItem(key);
    console.error(`[offlineQueue] Lista "${key}" dañada: respaldada y reiniciada.`);
    return { list: [], ok: true };
  } catch (e) {
    console.error(`[offlineQueue] Lista "${key}" dañada y sin espacio para respaldarla.`, e);
    return { list: [], ok: false };
  }
}

/**
 * Lee-modifica-guarda atómico (dentro de la pestaña) de una lista. Tira
 * OfflineQueueStorageError si no se puede leer con seguridad o si el
 * navegador rechaza la escritura (cuota llena).
 */
function mutateList<T>(key: string, fn: (list: T[]) => T[]): void {
  if (!hasStorage()) {
    throw new OfflineQueueStorageError("localStorage no disponible");
  }
  const { list, ok } = readList<T>(key);
  if (!ok) {
    throw new OfflineQueueStorageError(`No se pudo leer "${key}" de forma segura`);
  }
  try {
    localStorage.setItem(key, JSON.stringify(fn(list)));
  } catch (e) {
    throw new OfflineQueueStorageError(`No se pudo guardar "${key}"`, { cause: e });
  }
}

// ── Cola activa ──────────────────────────────────────────────────────────────

export function getQueue(): QueuedSale[] {
  return readList<QueuedSale>(QUEUE_KEY).list;
}

/**
 * Encola una venta para sincronizar después.
 * @param idempotencyKey UUID estable de esta venta. Si se pasó ya al servidor
 *   (y la respuesta no llegó), enviar el mismo key permite que el servidor
 *   detecte la venta como duplicada y devuelva la existente.
 *   Si no se provee, se genera uno nuevo a partir del id de cola.
 * @throws OfflineQueueStorageError si la venta NO se pudo guardar.
 */
export function addToQueue(
  payload: Omit<QueuedSale["payload"], "idempotency_key">,
  idempotencyKey?: string,
): string {
  const id = crypto.randomUUID();
  const key = idempotencyKey ?? id;
  const sale: QueuedSale = {
    id,
    payload: { ...payload, idempotency_key: key },
    queuedAt: Date.now(),
    attempts: 0,
  };
  mutateList<QueuedSale>(QUEUE_KEY, (q) => [...q, sale]);
  return id;
}

export function removeFromQueue(id: string) {
  mutateList<QueuedSale>(QUEUE_KEY, (q) => q.filter((s) => s.id !== id));
}

// ── Cola de ventas con error (revisión manual) ──────────────────────────────

export function getFailedQueue(): FailedSale[] {
  return readList<FailedSale>(FAILED_QUEUE_KEY).list;
}

/**
 * Pasa una venta de la cola activa a "Ventas con error". Orden deliberado:
 * PRIMERO se escribe en la lista de errores, DESPUÉS se saca de la activa.
 * Si el navegador se cierra (o falla el storage) en el medio, la venta queda
 * en las dos listas — nunca en ninguna. Estar en las dos es inofensivo: el
 * servidor deduplica por idempotency_key.
 */
function moveToReview(sale: QueuedSale, lastError: string) {
  mutateList<FailedSale>(FAILED_QUEUE_KEY, (list) =>
    list.some((s) => s.id === sale.id)
      ? list
      : [...list, { ...sale, failedAt: Date.now(), lastError }],
  );
  mutateList<QueuedSale>(QUEUE_KEY, (q) => q.filter((s) => s.id !== sale.id));
}

// Reintento manual desde la UI de revisión (ej. tras corregir el producto o
// el precio en el servidor): vuelve a la cola activa con los intentos en
// cero para que el próximo syncQueue() la procese de nuevo. Mismo orden
// seguro que moveToReview: primero se agrega a la activa, después se saca de
// la de errores. Al pasar por mutateList() es seguro aunque haya un sync en
// curso (antes, el sync la pisaba y se perdía de las dos listas).
export function retryFailedSale(id: string) {
  const sale = getFailedQueue().find((s) => s.id === id);
  if (!sale) return;
  const queued: QueuedSale = {
    id: sale.id,
    payload: sale.payload,
    queuedAt: sale.queuedAt,
    attempts: 0,
  };
  mutateList<QueuedSale>(QUEUE_KEY, (q) =>
    q.some((s) => s.id === id) ? q : [...q, queued],
  );
  mutateList<FailedSale>(FAILED_QUEUE_KEY, (list) => list.filter((s) => s.id !== id));
}

// Descarte explícito por decisión humana (ej. la venta se anuló o se
// re-cargó a mano) — a diferencia del sync automático, que nunca descarta
// nada por su cuenta.
export function discardFailedSale(id: string) {
  mutateList<FailedSale>(FAILED_QUEUE_KEY, (list) => list.filter((s) => s.id !== id));
}

// ── Sincronización ───────────────────────────────────────────────────────────

type SyncResult = { synced: number; failed: number; review: number };
const NOTHING: SyncResult = { synced: 0, failed: 0, review: 0 };

// Mutex de módulo: impide que dos llamadas concurrentes a syncQueue en la
// MISMA pestaña procesen la misma venta (ej. evento "online" disparado dos
// veces seguidas en móvil). Entre pestañas lo cubre el candado Web Locks.
let _syncing = false;

export async function syncQueue(): Promise<SyncResult> {
  if (_syncing) return NOTHING;
  _syncing = true;

  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks && typeof locks.request === "function") {
      // ifAvailable: si otra pestaña ya está sincronizando, no esperamos —
      // devolvemos "nada que hacer" y el backoff/latido reintentará luego.
      return await locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) =>
        lock ? runSync() : NOTHING,
      );
    }
    // Navegador sin Web Locks: queda solo el mutex por pestaña (como antes).
    return await runSync();
  } finally {
    _syncing = false;
  }
}

async function runSync(): Promise<SyncResult> {
  // La foto inicial se usa SOLO para saber qué ventas intentar enviar en
  // esta pasada — nunca se guarda. Las que entren durante el sync quedan
  // intactas en la lista real y las toma la próxima pasada (useOnlineSync
  // vuelve a mirar getQueue() al terminar y programa otro intento).
  const ids = getQueue().map((s) => s.id);
  if (ids.length === 0) return NOTHING;

  let synced = 0;
  let failed = 0;
  let review = 0;

  for (const id of ids) {
    // Releer la venta fresca: pudo sincronizarla otra pestaña o moverla
    // a revisión entre la foto y ahora.
    const sale = getQueue().find((s) => s.id === id);
    if (!sale) continue;

    try {
      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // offline_resync: true avisa al server que el precio pudo cambiar
        // (oferta vencida, etc.) entre que se cobró en el local y este
        // reintento — tolera un faltante acotado en vez de rechazar y
        // perder la venta ya cobrada.
        body: JSON.stringify({ ...sale.payload, offline_resync: true }),
      });

      if (res.ok) {
        // Quitar SOLO esta venta, sobre la lista real del momento. Se guarda
        // inmediatamente: si el tab se cierra antes de terminar el loop, las
        // ventas ya procesadas no se re-envían.
        mutateList<QueuedSale>(QUEUE_KEY, (q) => q.filter((s) => s.id !== id));
        synced++;
      } else if (res.status === 401) {
        // Sesión expirada o todavía sin cookie real (p. ej. ensureSession()
        // no pudo re-autenticar y el cajero aún no reingresó su PIN):
        // transitorio, no consume intentos. La venta no se pierde.
        failed++;
      } else if (res.status < 500) {
        // 4xx de negocio (producto inactivo, datos inválidos, caja/sucursal
        // que ya no coincide con la sesión, etc.): un rechazo real del
        // servidor, no de sesión — sync() ya esperó a ensureSession() antes
        // de llegar acá.
        const json: unknown = await res.json().catch(() => ({}));
        const errField = (json as { error?: unknown } | null)?.error;
        const message = typeof errField === "string" ? errField : `HTTP ${res.status}`;

        // Desde acá hasta el final del bloque no hay ningún await: leer el
        // contador fresco y guardarlo es atómico dentro de la pestaña.
        const current = getQueue().find((s) => s.id === id);
        if (!current) continue;
        const newAttempts = current.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          moveToReview({ ...current, attempts: newAttempts }, message);
          review++;
        } else {
          mutateList<QueuedSale>(QUEUE_KEY, (q) =>
            q.map((s) => (s.id === id ? { ...s, attempts: newAttempts } : s)),
          );
          failed++;
        }
      } else {
        // 5xx: error transitorio (servidor caído), no cuenta como intento
        failed++;
      }
    } catch {
      // Sin conexión, timeout, o fallo de storage al actualizar la cola: en
      // todos los casos la venta sigue en la cola activa (nunca se saca sin
      // haber escrito antes su destino). Transitorio, no cuenta como intento.
      failed++;
    }
  }

  return { synced, failed, review };
}
