import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import type { Store } from "@/lib/analytics/types";
import { verifySession } from "@/lib/jwt";
import { isSupervisor } from "@/lib/session";
import { STORES } from "@/lib/stores";

/**
 * Panel de analítica de clientes (solo supervisores).
 * Los store_id son los mismos UUID de `lib/stores.ts` (sucursales activas):
 * el motor de visión tiene que arrancar con `--store-id <ese UUID>` para que
 * sus métricas aparezcan acá.
 */
const ANALYTICS_STORES: Store[] = STORES.map((s) => ({ id: s.id, name: s.short }));

export default async function AnalyticsPage() {
  // El middleware ya exige cookie válida; acá se exige además el rol, para que
  // un cajero no entre por URL directa. Los datos igual los protege la API.
  const token = (await cookies()).get("sj_pos_auth")?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) redirect("/pos-login?redirect=%2Fanalytics");
  if (!isSupervisor(session)) redirect("/ventas");

  return <AnalyticsDashboard stores={ANALYTICS_STORES} />;
}
