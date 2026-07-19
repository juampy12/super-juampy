const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_FAILURES = 5;

interface Record {
  failures: number;
  windowStart: number;
}

// Mapa en memoria por IP. En un entorno con múltiples instancias serverless
// cada instancia tiene su propio mapa, pero sigue siendo efectivo contra
// ataques desde una sola IP contra la misma instancia.
const store = new Map<string, Record>();

function cleanup() {
  const now = Date.now();
  for (const [key, record] of store) {
    if (now - record.windowStart >= WINDOW_MS) store.delete(key);
  }
}

export function recordFailure(ip: string): { blocked: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const record = store.get(ip);

  if (!record || now - record.windowStart >= WINDOW_MS) {
    store.set(ip, { failures: 1, windowStart: now });
    return { blocked: false, remaining: MAX_FAILURES - 1 };
  }

  record.failures += 1;
  const blocked = record.failures >= MAX_FAILURES;
  return { blocked, remaining: Math.max(0, MAX_FAILURES - record.failures) };
}

export function isBlocked(ip: string): boolean {
  cleanup();
  const record = store.get(ip);
  if (!record) return false;
  if (Date.now() - record.windowStart >= WINDOW_MS) {
    store.delete(ip);
    return false;
  }
  return record.failures >= MAX_FAILURES;
}

export function resetFailures(ip: string) {
  store.delete(ip);
}

// Rate limiter genérico por ventana fija de 1 minuto, independiente del
// store de failures de arriba (ese es para lockout tras intentos fallidos;
// este es para limitar volumen de requests por clave, ej. employee_id).
const RATE_WINDOW_MS = 60 * 1000;
const rateStore = new Map<string, Record>();

function cleanupRate() {
  const now = Date.now();
  for (const [key, record] of rateStore) {
    if (now - record.windowStart >= RATE_WINDOW_MS) rateStore.delete(key);
  }
}

/** true si la request está permitida; false si superó maxPerMinute para esa key. */
export function checkRateLimit(key: string, maxPerMinute: number): boolean {
  cleanupRate();
  const now = Date.now();
  const record = rateStore.get(key);

  if (!record || now - record.windowStart >= RATE_WINDOW_MS) {
    rateStore.set(key, { failures: 1, windowStart: now });
    return true;
  }

  record.failures += 1;
  return record.failures <= maxPerMinute;
}
