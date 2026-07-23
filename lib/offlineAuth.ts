// Login offline de emergencia: credenciales de empleados que ya iniciaron sesión
// online en esta máquina, guardadas en IndexedDB para poder entrar sin poder
// contactar al servidor. El PIN nunca se persiste en texto plano — solo un hash
// PBKDF2-SHA256 con salt aleatorio (Web Crypto, SubtleCrypto). Esto es un
// esquema independiente del bcrypt/pgcrypto que usa el servidor (verify_employee_pin),
// que no está disponible en el navegador vía SubtleCrypto — no hay equivalencia
// entre ambos hashes, cada uno valida contra su propio storage.

import { type PosEmployee, isOfflineSession, clearOfflineSessionFlag } from "./posSession";

const DB_NAME = "pos_offline_auth_v1";
const DB_STORE = "offline_employees";
const PBKDF2_ITERATIONS = 210_000;

type OfflineEmployeeRecord = {
  code: string;
  employee_id: string;
  name: string;
  role: string;
  store_id: string | null;
  register_id: string | null;
  salt: Uint8Array;
  hash: Uint8Array;
  savedAt: number;
};

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE))
        req.result.createObjectStore(DB_STORE, { keyPath: "code" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open error"));
  });
}

async function idbGet(code: string): Promise<OfflineEmployeeRecord | null> {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(code);
      req.onsuccess = () => resolve((req.result as OfflineEmployeeRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(rec: OfflineEmployeeRecord): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(rec);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("IndexedDB write error"));
    });
  } catch {
    // Sin IndexedDB disponible (modo privado, cuota agotada): el login offline
    // simplemente no quedará disponible en esta máquina, no es un error fatal.
  }
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Llamar tras cada login online exitoso: guarda el empleado + hash del PIN
// para que esta máquina pueda validar un ingreso offline más adelante.
export async function saveOfflineCredential(
  code: string,
  pin: string,
  employee: PosEmployee
): Promise<void> {
  if (typeof window === "undefined") return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt);
  await idbPut({
    code,
    employee_id: employee.id,
    name: employee.name,
    role: employee.role,
    store_id: employee.store_id,
    register_id: employee.register_id,
    salt,
    hash,
    savedAt: Date.now(),
  });
}

// ── Lockout por intentos fallidos ───────────────────────────────────────────
// Sin servidor de por medio no hay rate limiting de red: alguien con acceso
// físico a la caja podría probar PINs contra el hash guardado sin límite.
// Replica el mismo umbral que rateLimiter.ts (server) para el intento online:
// 5 fallos → bloqueado 15 minutos, por código de empleado.
const LOCKOUT_KEY = "sj_pos_offline_lockout";
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MAX_FAILURES = 5;

type LockoutStore = Record<string, { failures: number; windowStart: number }>;

function readLockoutStore(): LockoutStore {
  try {
    return JSON.parse(localStorage.getItem(LOCKOUT_KEY) ?? "{}") as LockoutStore;
  } catch {
    return {};
  }
}

function writeLockoutStore(store: LockoutStore) {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(store));
}

export function isOfflineLoginLocked(code: string): boolean {
  if (typeof window === "undefined") return false;
  const rec = readLockoutStore()[code];
  if (!rec) return false;
  if (Date.now() - rec.windowStart >= LOCKOUT_WINDOW_MS) return false;
  return rec.failures >= LOCKOUT_MAX_FAILURES;
}

function recordOfflineLoginFailure(code: string) {
  const store = readLockoutStore();
  const rec = store[code];
  const now = Date.now();
  if (!rec || now - rec.windowStart >= LOCKOUT_WINDOW_MS) {
    store[code] = { failures: 1, windowStart: now };
  } else {
    rec.failures += 1;
  }
  writeLockoutStore(store);
}

function resetOfflineLoginFailures(code: string) {
  const store = readLockoutStore();
  delete store[code];
  writeLockoutStore(store);
}

// Verifica código+PIN contra las credenciales guardadas localmente en esta
// máquina. Devuelve el empleado si matchea, o null si el código nunca se logueó
// acá, el PIN no coincide con el hash guardado, o si el código está bloqueado
// por demasiados intentos fallidos recientes.
export async function verifyOfflineCredential(
  code: string,
  pin: string
): Promise<PosEmployee | null> {
  if (typeof window === "undefined") return null;
  if (isOfflineLoginLocked(code)) return null;
  const rec = await idbGet(code);
  if (!rec) return null;
  const hash = await derivePinHash(pin, rec.salt);
  if (!bytesEqual(hash, rec.hash)) {
    recordOfflineLoginFailure(code);
    return null;
  }
  resetOfflineLoginFailures(code);
  return {
    id: rec.employee_id,
    name: rec.name,
    role: rec.role,
    store_id: rec.store_id,
    register_id: rec.register_id,
  };
}

// ── Re-autenticación silenciosa al recuperar conexión ───────────────────────
// Mientras dura una sesión offline guardamos code+pin SOLO en memoria (nunca
// en disco) para poder pedir la cookie real al servidor apenas vuelva la red,
// sin volver a pedirle el PIN al cajero. Si se recarga la pestaña estando aún
// sin conexión esta referencia se pierde: el cajero deberá re-loguearse cuando
// la siguiente acción autenticada falle, igual que hoy ante una sesión vencida.
let pendingReauth: { code: string; pin: string } | null = null;

export function setPendingReauth(code: string, pin: string) {
  pendingReauth = { code, pin };
}

export function clearPendingReauth() {
  pendingReauth = null;
}

export type ReauthResult = "reauthenticated" | "deactivated" | "still_offline" | "skipped";

// Reintenta el login real contra el servidor con las credenciales de la sesión
// offline activa. "deactivated" solo puede darse si el mismo código+PIN que ya
// verificamos localmente ahora es rechazado por el servidor (empleado dado de
// baja o desactivado) — ahí corresponde cerrar la sesión.
export async function trySilentReauth(): Promise<ReauthResult> {
  if (!pendingReauth) return "skipped";
  const { code, pin } = pendingReauth;
  try {
    const res = await fetch("/api/employee/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, pin }),
    });
    if (res.ok) {
      clearPendingReauth();
      return "reauthenticated";
    }
    if (res.status === 401) {
      clearPendingReauth();
      return "deactivated";
    }
    return "still_offline";
  } catch {
    return "still_offline";
  }
}

// ── Gate proactivo de sesión ────────────────────────────────────────────────
// Cualquier request que dependa de la cookie real (confirmar venta, cargar
// ventas recientes, etc.) debe pasar por acá ANTES de disparar el fetch,
// en vez de mandarlo y reaccionar recién al 401. Evita la carrera donde el
// sync dispara contra el servidor antes de que trySilentReauth() consiga la
// cookie. Las llamadas concurrentes comparten un único POST /api/employee/login
// en vuelo (varias partes de la UI pueden pedir el gate al mismo tiempo al
// reconectar).
export type EnsureSessionResult = "ok" | "deactivated" | "offline";

let ensureSessionInFlight: Promise<EnsureSessionResult> | null = null;

export function ensureSession(): Promise<EnsureSessionResult> {
  if (!isOfflineSession()) return Promise.resolve("ok");
  if (!ensureSessionInFlight) {
    ensureSessionInFlight = (async () => {
      const result = await trySilentReauth();
      if (result === "reauthenticated") {
        clearOfflineSessionFlag();
        return "ok";
      }
      if (result === "deactivated") return "deactivated";
      // "still_offline" (no se pudo contactar al servidor) o "skipped" (no hay
      // credenciales pendientes, ej. tras recargar la pestaña sin conexión):
      // en ambos casos no hay cookie real todavía, el llamador debe pausar.
      return "offline";
    })().finally(() => {
      ensureSessionInFlight = null;
    });
  }
  return ensureSessionInFlight;
}
