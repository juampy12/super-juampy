import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OfflineQueueStorageError,
  addToQueue,
  getFailedQueue,
  getQueue,
  retryFailedSale,
  syncQueue,
  type FailedSale,
  type QueuedSale,
} from "../offlineQueue";

// Fix C1: ninguna venta encolada mientras corre el sync puede perderse.
// Entorno node (sin DOM): se simulan localStorage, fetch "lento" controlable
// y el candado Web Locks entre pestañas.

const QUEUE_KEY = "pos_offline_queue_v1";
const FAILED_KEY = "failed_sales_queue_v1";

class MemStorage {
  map = new Map<string, string>();
  /** Si devuelve true para una clave, setItem tira QuotaExceededError. */
  failWrite: ((key: string) => boolean) | null = null;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.failWrite?.(k)) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(k, String(v));
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

// Candado Web Locks mínimo (mismo origen = mismo objeto), con ifAvailable.
class FakeLocks {
  held = new Set<string>();
  async request<T>(
    name: string,
    opts: { ifAvailable?: boolean },
    cb: (lock: { name: string } | null) => Promise<T>,
  ): Promise<T> {
    if (this.held.has(name)) {
      if (opts.ifAvailable) return cb(null);
      throw new Error("FakeLocks: espera no implementada");
    }
    this.held.add(name);
    try {
      return await cb({ name });
    } finally {
      this.held.delete(name);
    }
  }
}

// fetch que queda colgado hasta que el test lo resuelve a mano: así se puede
// "cobrar" una venta justo en el medio de un envío del sync.
type Pending = { body: { idempotency_key: string }; resolve: (r: Response) => void };
let pending: Pending[];
let fetchMock: ReturnType<typeof vi.fn>;
let storage: MemStorage;
let locks: FakeLocks;

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function payload(label: string) {
  return { items: [{ product_id: label, qty: 1 }], total: 100, payment: { method: "efectivo" }, store_id: "s1", register_id: "r1" };
}

function seedQueue(sales: Array<Partial<QueuedSale> & { id: string }>) {
  const full: QueuedSale[] = sales.map((s) => ({
    payload: { ...payload(s.id), idempotency_key: `key-${s.id}` },
    queuedAt: 1_700_000_000_000,
    attempts: 0,
    ...s,
  }));
  storage.setItem(QUEUE_KEY, JSON.stringify(full));
}

/** Resuelve el fetch pendiente número `i` (en orden de llamada). */
async function respond(i: number, res: Response) {
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(i));
  pending[i].resolve(res);
}

const queueKeys = () => getQueue().map((s) => s.payload.idempotency_key).sort();

beforeEach(() => {
  storage = new MemStorage();
  locks = new FakeLocks();
  pending = [];
  fetchMock = vi.fn((_url: string, init: { body: string }) =>
    new Promise<Response>((resolve) => {
      pending.push({ body: JSON.parse(init.body) as Pending["body"], resolve });
    }),
  );
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cola offline: ventas cobradas durante el sync", () => {
  it("1) venta cobrada durante un envío exitoso sigue en la cola", async () => {
    seedQueue([{ id: "A" }]);
    const run = syncQueue();

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    addToQueue(payload("D"), "key-D"); // el cajero cobra D mientras A viaja
    await respond(0, jsonResponse(200, { ok: true }));

    expect(await run).toEqual({ synced: 1, failed: 0, review: 0 });
    expect(queueKeys()).toEqual(["key-D"]);
  });

  it("2) venta cobrada durante un rechazo 4xx sigue en la cola; el intento se suma solo a la rechazada", async () => {
    seedQueue([{ id: "A" }]);
    const run = syncQueue();

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    addToQueue(payload("D"), "key-D");
    await respond(0, jsonResponse(400, { error: "Producto inactivo" }));

    expect(await run).toEqual({ synced: 0, failed: 1, review: 0 });
    const q = getQueue();
    expect(q.map((s) => s.payload.idempotency_key).sort()).toEqual(["key-A", "key-D"]);
    expect(q.find((s) => s.id === "A")!.attempts).toBe(1);
    expect(q.find((s) => s.payload.idempotency_key === "key-D")!.attempts).toBe(0);
  });

  it("3) venta cobrada mientras otra pasa a 'Ventas con error': ninguna se pierde", async () => {
    seedQueue([{ id: "A", attempts: 2 }]); // tercer rechazo → revisión
    const run = syncQueue();

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    addToQueue(payload("D"), "key-D");
    await respond(0, jsonResponse(409, { error: "Caja no coincide" }));

    expect(await run).toEqual({ synced: 0, failed: 0, review: 1 });
    expect(queueKeys()).toEqual(["key-D"]);
    const failed = getFailedQueue();
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe("A");
    expect(failed[0].attempts).toBe(3);
    expect(failed[0].lastError).toBe("Caja no coincide");
  });

  it("4) 'Reintentar' en Ventas con error durante el sync deja la venta en la cola activa", async () => {
    const failedSale: FailedSale = {
      id: "F",
      payload: { ...payload("F"), idempotency_key: "key-F" },
      queuedAt: 1_700_000_000_000,
      attempts: 3,
      failedAt: 1_700_000_100_000,
      lastError: "HTTP 400",
    };
    storage.setItem(FAILED_KEY, JSON.stringify([failedSale]));
    seedQueue([{ id: "A" }]);
    const run = syncQueue();

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    retryFailedSale("F"); // el supervisor toca "Reintentar" en pleno sync
    await respond(0, jsonResponse(200, { ok: true }));
    await run;

    expect(getFailedQueue()).toHaveLength(0);
    const q = getQueue();
    expect(q.map((s) => s.id)).toEqual(["F"]);
    expect(q[0].attempts).toBe(0);
  });

  it("5) 10 ventas cobradas durante un sync de 5: quedan las 10 nuevas y ninguna de las 5 enviadas", async () => {
    seedQueue(["A", "B", "C", "D", "E"].map((id) => ({ id })));
    const run = syncQueue();

    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(pending).toHaveLength(i + 1));
      addToQueue(payload(`N${2 * i}`), `key-N${2 * i}`);
      addToQueue(payload(`N${2 * i + 1}`), `key-N${2 * i + 1}`);
      pending[i].resolve(jsonResponse(200, { ok: true }));
    }

    expect(await run).toEqual({ synced: 5, failed: 0, review: 0 });
    const expected = Array.from({ length: 10 }, (_, i) => `key-N${i}`).sort();
    expect(queueKeys()).toEqual(expected);
    // Se envió cada venta original exactamente una vez, ninguna nueva en esta pasada.
    expect(pending.map((p) => p.body.idempotency_key)).toEqual(["key-A", "key-B", "key-C", "key-D", "key-E"]);
  });

  it("errores transitorios (5xx, red caída, 401) no sacan la venta ni consumen intentos", async () => {
    seedQueue([{ id: "A" }, { id: "B" }, { id: "C" }]);
    const run = syncQueue();

    await respond(0, jsonResponse(503));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    addToQueue(payload("D"), "key-D");
    pending[1].resolve(jsonResponse(401));
    await respond(2, jsonResponse(500));

    expect(await run).toEqual({ synced: 0, failed: 3, review: 0 });
    expect(queueKeys()).toEqual(["key-A", "key-B", "key-C", "key-D"]);
    expect(getQueue().every((s) => s.attempts === 0)).toBe(true);
  });
});

describe("cola offline: lista dañada y navegador sin espacio", () => {
  it("6) lista dañada no se pisa: se respalda y la cola sigue funcionando", () => {
    storage.setItem(QUEUE_KEY, "{esto no es json");

    expect(getQueue()).toEqual([]);
    const backups = [...storage.map.keys()].filter((k) => k.startsWith(`${QUEUE_KEY}_corrupt_`));
    expect(backups).toHaveLength(1);
    expect(storage.getItem(backups[0])).toBe("{esto no es json");

    addToQueue(payload("D"), "key-D");
    expect(queueKeys()).toEqual(["key-D"]);
  });

  it("6b) lista dañada sin espacio para respaldarla: no se escribe encima y avisa con error", () => {
    storage.setItem(QUEUE_KEY, "{dañada");
    storage.failWrite = (k) => k.includes("_corrupt_");

    expect(() => addToQueue(payload("D"), "key-D")).toThrow(OfflineQueueStorageError);
    expect(storage.getItem(QUEUE_KEY)).toBe("{dañada");
  });

  it("8) navegador sin espacio: addToQueue tira OfflineQueueStorageError (la UI avisa al cajero)", () => {
    storage.failWrite = (k) => k === QUEUE_KEY;
    expect(() => addToQueue(payload("D"), "key-D")).toThrow(OfflineQueueStorageError);
  });

  it("si no se puede escribir en 'Ventas con error', la venta NO sale de la cola activa", async () => {
    seedQueue([{ id: "A", attempts: 2 }]);
    storage.failWrite = (k) => k === FAILED_KEY;
    const run = syncQueue();

    await respond(0, jsonResponse(400, { error: "x" }));
    await run;

    expect(getQueue().map((s) => s.id)).toEqual(["A"]);
  });
});

describe("cola offline: syncs concurrentes", () => {
  it("7) dos syncs a la vez en la misma pestaña: cada venta se envía una sola vez", async () => {
    seedQueue([{ id: "A" }, { id: "B" }]);
    const first = syncQueue();
    const second = await syncQueue(); // mutex de pestaña: vuelve sin hacer nada

    expect(second).toEqual({ synced: 0, failed: 0, review: 0 });
    await respond(0, jsonResponse(200));
    await respond(1, jsonResponse(200));
    expect(await first).toEqual({ synced: 2, failed: 0, review: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getQueue()).toEqual([]);
  });

  it("7b) otra pestaña ya sincronizando (candado tomado): esta no envía nada", async () => {
    seedQueue([{ id: "A" }]);
    locks.held.add("sj_pos_offline_sync");

    expect(await syncQueue()).toEqual({ synced: 0, failed: 0, review: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getQueue().map((s) => s.id)).toEqual(["A"]);
  });

  it("venta ya sacada por otra pestaña entre la foto y el envío: se saltea", async () => {
    seedQueue([{ id: "A" }, { id: "B" }]);
    const run = syncQueue();

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    // Otra pestaña sincronizó B mientras esta enviaba A.
    storage.setItem(QUEUE_KEY, JSON.stringify(getQueue().filter((s) => s.id !== "B")));
    pending[0].resolve(jsonResponse(200));

    expect(await run).toEqual({ synced: 1, failed: 0, review: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("navegador sin Web Locks: sigue sincronizando con el mutex de pestaña", async () => {
    vi.stubGlobal("navigator", {});
    seedQueue([{ id: "A" }]);
    const run = syncQueue();

    await respond(0, jsonResponse(200));
    expect(await run).toEqual({ synced: 1, failed: 0, review: 0 });
  });
});
