export type QueuedSale = {
  id: string;
  payload: {
    items: unknown[];
    total: number;
    payment: unknown;
    store_id: string;
    register_id: string | null;
  };
  queuedAt: number;
  attempts: number;
};

const QUEUE_KEY = "pos_offline_queue_v1";
const MAX_ATTEMPTS = 3;

export function getQueue(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); }
  catch { return []; }
}

export function addToQueue(payload: QueuedSale["payload"]): string {
  const queue = getQueue();
  const id = crypto.randomUUID();
  queue.push({ id, payload, queuedAt: Date.now(), attempts: 0 });
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

export async function syncQueue(): Promise<{ synced: number; failed: number; abandoned: number }> {
  let queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, abandoned: 0 };

  let synced = 0;
  let failed = 0;
  let abandoned = 0;

  for (const sale of [...queue]) {
    try {
      const res = await fetch("/api/pos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale.payload),
      });
      if (res.ok) {
        queue = queue.filter(s => s.id !== sale.id);
        synced++;
      } else if (res.status < 500) {
        // 4xx: error permanente (venta duplicada, producto inexistente, etc.)
        const newAttempts = sale.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          queue = queue.filter(s => s.id !== sale.id);
          abandoned++;
        } else {
          queue = queue.map(s => s.id === sale.id ? { ...s, attempts: newAttempts } : s);
          failed++;
        }
      } else {
        // 5xx: error transitorio (servidor caído), no cuenta como intento
        failed++;
      }
    } catch {
      // Sin conexión o timeout: transitorio, no cuenta como intento
      failed++;
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return { synced, failed, abandoned };
}
