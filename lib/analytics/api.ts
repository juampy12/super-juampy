import { ensureSession } from "@/lib/offlineAuth";

/**
 * GET autenticado a /api/analytics/<resource>?store=<id>.
 * Pasa por ensureSession() antes del fetch (regla del circuito offline: no
 * disparar un fetch autenticado sin haber esperado la cookie real al reconectar).
 */
export async function getAnalytics<T>(
  resource: "counts" | "heatmap" | "health" | "zones",
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

  const res = await fetch(`/api/analytics/${resource}?${params}`, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}
