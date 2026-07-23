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
// Mientras dura la pestaña actual guardamos code+pin en memoria para pedir la
// cookie real al servidor apenas vuelva la red, sin pedirle el PIN de nuevo al
// cajero. Esto por sí solo NO sobrevive una navegación de página completa
// (window.location.href, como la que hace el login offline al entrar a
// /ventas) — el módulo se reinstancia y esta variable vuelve a null. Por eso
// existe además el respaldo cifrado de persistPendingReauth() más abajo.
let pendingReauth: { code: string; pin: string } | null = null;

export function setPendingReauth(code: string, pin: string) {
  pendingReauth = { code, pin };
}

export function clearPendingReauth() {
  pendingReauth = null;
}

// ── Respaldo cifrado para sobrevivir recargas/navegaciones ──────────────────
// AES-GCM 256 bits con la clave partida en dos storages distintos: la mitad
// en localStorage, la otra en sessionStorage. Ninguno de los dos alcanza solo
// para descifrar — hace falta leer ambos. TTL de 24h (igual que la cookie de
// sesión real, ver lib/jwt.ts) y autodestrucción apenas deja de hacer falta:
// al conseguir la cookie real, al cerrar sesión (lib/posSession.ts logoutPos),
// o si el servidor rechaza el código+PIN (empleado desactivado).
const REAUTH_TTL_MS = 24 * 60 * 60 * 1000;
const REAUTH_KEY_A = "sj_pos_reauth_key_a"; // localStorage
const REAUTH_KEY_B = "sj_pos_reauth_key_b"; // sessionStorage
const REAUTH_BLOB = "sj_pos_reauth_blob"; // localStorage

type PersistedReauthBlob = { iv: string; ciphertext: string; createdAt: number };

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str: string): Uint8Array {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function clearPersistedReauth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REAUTH_KEY_A);
  localStorage.removeItem(REAUTH_BLOB);
  try { sessionStorage.removeItem(REAUTH_KEY_B); } catch { /* sessionStorage no disponible */ }
}

// Llamar junto con setPendingReauth() en el login offline, ANTES de navegar:
// la escritura es async (WebCrypto) y la navegación siguiente destruye el
// contexto, así que hay que esperarla.
export async function persistPendingReauth(code: string, pin: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const half = rawKey.length / 2;
    const keyA = rawKey.slice(0, half);
    const keyB = rawKey.slice(half);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await importAesKey(rawKey);
    const plaintext = new TextEncoder().encode(JSON.stringify({ code, pin }));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, aesKey, plaintext)
    );
    const blob: PersistedReauthBlob = {
      iv: b64encode(iv),
      ciphertext: b64encode(ciphertext),
      createdAt: Date.now(),
    };
    localStorage.setItem(REAUTH_KEY_A, b64encode(keyA));
    sessionStorage.setItem(REAUTH_KEY_B, b64encode(keyB));
    localStorage.setItem(REAUTH_BLOB, JSON.stringify(blob));
  } catch {
    // Sin WebCrypto o storage lleno/bloqueado: el modal de PIN queda como
    // único respaldo cuando falte pendingReauth en memoria.
  }
}

async function readPersistedReauth(): Promise<{ code: string; pin: string } | null> {
  if (typeof window === "undefined") return null;
  try {
    const blobRaw = localStorage.getItem(REAUTH_BLOB);
    const keyARaw = localStorage.getItem(REAUTH_KEY_A);
    const keyBRaw = sessionStorage.getItem(REAUTH_KEY_B);
    if (!blobRaw || !keyARaw || !keyBRaw) return null;

    const blob = JSON.parse(blobRaw) as PersistedReauthBlob;
    if (Date.now() - blob.createdAt >= REAUTH_TTL_MS) {
      clearPersistedReauth();
      return null;
    }

    const rawKey = new Uint8Array([...b64decode(keyARaw), ...b64decode(keyBRaw)]);
    const aesKey = await importAesKey(rawKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(blob.iv) as BufferSource },
      aesKey,
      b64decode(blob.ciphertext) as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as { code: string; pin: string };
  } catch {
    // Blob corrupto, mitad de clave faltante, etc.: no hay forma de recuperar,
    // limpiar para no reintentar el descifrado en vano.
    clearPersistedReauth();
    return null;
  }
}

export type ReauthResult = "reauthenticated" | "deactivated" | "still_offline" | "skipped";

// Reintenta el login real contra el servidor con las credenciales de la sesión
// offline activa — primero las de memoria (misma pestaña, sin recargar), y si
// no están, las del respaldo cifrado. "deactivated" solo puede darse si el
// mismo código+PIN que ya verificamos localmente ahora es rechazado por el
// servidor (empleado dado de baja o desactivado) — ahí corresponde cerrar
// sesión Y destruir el respaldo persistido, no tiene sentido seguir
// reintentando con credenciales que el servidor ya rechazó.
export async function trySilentReauth(): Promise<ReauthResult> {
  const creds = pendingReauth ?? (await readPersistedReauth());
  if (!creds) return "skipped";
  const { code, pin } = creds;
  try {
    const res = await fetch("/api/employee/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, pin }),
    });
    if (res.ok) {
      clearPendingReauth();
      clearPersistedReauth();
      return "reauthenticated";
    }
    if (res.status === 401) {
      clearPendingReauth();
      clearPersistedReauth();
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
export type EnsureSessionResult = "ok" | "deactivated" | "offline" | "needs_pin";

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
      if (result === "still_offline") return "offline";
      // "skipped": no hay credenciales para reintentar en silencio (ni en
      // memoria ni en el respaldo cifrado — expiró el TTL, se corrompió, o
      // el navegador no tiene WebCrypto). Único recurso: pedirle el PIN al
      // cajero explícitamente.
      return "needs_pin";
    })().finally(() => {
      ensureSessionInFlight = null;
    });
  }
  return ensureSessionInFlight;
}
