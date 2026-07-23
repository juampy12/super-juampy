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

export function getQueue(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); }
  catch { return []; }
}

/**
 * Encola una venta para sincronizar después.
 * @param idempotencyKey UUID estable de esta venta. Si se pasó ya al servidor
 *   (y la respuesta no llegó), enviar el mismo key permite que el servidor
 *   detecte la venta como duplicada y devuelva la existente.
 *   Si no se provee, se genera uno nuevo a partir del id de cola.
 */
export function addToQueue(
  payload: Omit<QueuedSale["payload"], "idempotency_key">,
  idempotencyKey?: string,
): string {
  const id = crypto.randomUUID();
  const key = idempotencyKey ?? id;
  const queue = getQueue();
  queue.push({ id, payload: { ...payload, idempotency_key: key }, queuedAt: Date.now(), attempts: 0 });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return id;
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter(s => s.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function getFailedQueue(): FailedSale[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAILED_QUEUE_KEY) ?? "[]"); }
  catch { return []; }
}

function writeFailedQueue(list: FailedSale[]) {
  localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(list));
}

function moveToReview(sale: QueuedSale, lastError: string) {
  writeFailedQueue([...getFailedQueue(), { ...sale, failedAt: Date.now(), lastError }]);
}

// Reintento manual desde la UI de revisión (ej. tras corregir el producto o
// el precio en el servidor): vuelve a la cola activa con los intentos en
// cero para que el próximo syncQueue() la procese de nuevo.
export function retryFailedSale(id: string) {
  const list = getFailedQueue();
  const sale = list.find(s => s.id === id);
  if (!sale) return;
  writeFailedQueue(list.filter(s => s.id !== id));
  const { failedAt, lastError, ...queued } = sale;
  const queue = getQueue();
  queue.push({ ...queued, attempts: 0 });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Descarte explícito por decisión humana (ej. la venta se anuló o se
// re-cargó a mano) — a diferencia del sync automático, que nunca descarta
// nada por su cuenta.
export function discardFailedSale(id: string) {
  writeFailedQueue(getFailedQueue().filter(s => s.id !== id));
}

// Mutex de módulo: impide que dos llamadas concurrentes a syncQueue procesen
// la misma venta (ej. evento "online" disparado dos veces seguidas en móvil).
let _syncing = false;

export async function syncQueue(): Promise<{ synced: number; failed: number; review: number }> {
  if (_syncing) return { synced: 0, failed: 0, review: 0 };
  _syncing = true;

  try {
    let queue = getQueue();
    if (queue.length === 0) return { synced: 0, failed: 0, review: 0 };

    let synced = 0;
    let failed = 0;
    let review = 0;

    for (const sale of [...queue]) {
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
          queue = queue.filter(s => s.id !== sale.id);
          // Persistir inmediatamente tras cada éxito: si el tab se cierra antes
          // de terminar el loop, las ventas ya procesadas no se re-envían.
          localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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
          const json = await res.json().catch(() => ({}));
          const message = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
          const newAttempts = sale.attempts + 1;
          if (newAttempts >= MAX_ATTEMPTS) {
            queue = queue.filter(s => s.id !== sale.id);
            moveToReview({ ...sale, attempts: newAttempts }, message);
            review++;
          } else {
            queue = queue.map(s => s.id === sale.id ? { ...s, attempts: newAttempts } : s);
            failed++;
          }
          localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        } else {
          // 5xx: error transitorio (servidor caído), no cuenta como intento
          failed++;
        }
      } catch {
        // Sin conexión o timeout: transitorio, no cuenta como intento
        failed++;
      }
    }

    return { synced, failed, review };
  } finally {
    _syncing = false;
  }
}
