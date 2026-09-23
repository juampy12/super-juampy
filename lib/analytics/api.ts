import { ensureSession } from "@/lib/offlineAuth";

const FETCH_TIMEOUT_MS = 10_000;

/**
 * GET autenticado a /api/analytics/<resource>?store=<id>.
 * Pasa por ensureSession() antes del fetch (regla del circuito offline: no
 * disparar un fetch autenticado sin haber esperado la cookie real al reconectar).
 * Corta el fetch a los 10s (AbortSignal.timeout): un motor/DB colgado no puede
 * dejar el polling mudo. Si la sesión resultó igual inválida (401 real, no solo
 * "sin cookie offline"), manda a /pos-login en lugar de mostrar un error genérico.
 */
export async function getAnalytics<T>(
  resource: "counts" | "heatmap" | "health" | "zones" | "sales",
  storeId: string,
  signal?: AbortSignal,
  extraParams?: Record<string, string | number>
): Promise<T> {
  const session = await ensureSession();
  if (session !== "ok") {
    throw new Error("Sesión no disponible: volvé a iniciar sesión");
  }

  const params = new URLSearchParams({ store: storeId });
  for (const [k, v] of Object.entries(extraParams ?? {})) params.set(k, String(v));

  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const fetchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`/api/analytics/${resource}?${params}`, {
      signal: fetchSignal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (e) {
    // Distingue el timeout propio (error tratable) de una cancelación del
    // llamador (cambio de local, desmontaje) para no pisar ese abort.
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new Error("Tiempo de espera agotado consultando el servidor");
    }
    throw e;
  }

  if (res.status === 401) {
    window.location.href = "/pos-login?redirect=%2Fanalytics";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}
