export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  NO_STORE,
  ageSeconds,
  parseAfterIdParam,
  parseStoreParam,
  requireSupervisor,
  startOfDayArgentina,
  todayArgentina,
} from "@/lib/analytics/server";
import type { CountRow } from "@/lib/analytics/types";
import type { CountsResponse } from "@/lib/analytics/queries";

// GET /api/analytics/counts?store=<id>[&after_id=<n>]
// → { rows, day, latestAgeSeconds }: conteos de analytics_counts del día (hora de
// Argentina). Sin after_id: todo el día, ascendente por ts. Con after_id: solo las
// filas con id mayor (para polling incremental), ascendente por id. `day`
// (YYYY-MM-DD) le permite al cliente detectar el cambio de día y volver a pedir el
// día completo. `latestAgeSeconds` es la antigüedad (calculada acá, no en el
// navegador) de la fila más nueva de esta respuesta; `null` si no hay filas.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  const afterId = parseAfterIdParam(req);
  if (afterId === null) return NextResponse.json({ error: "after_id inválido" }, { status: 400 });

  try {
    const day = todayArgentina();
    const since = startOfDayArgentina(day);
    // Paginado: PostgREST corta en 1000 filas y un día de conteos puede superarlas.
    // No trae store_id (ya viene filtrado por `store`) ni exits (occupancy ya lo
    // resuelve el motor): son ruido en la respuesta al cliente.
    const rows = await fetchAllRows<CountRow>(
      "analytics_counts",
      "id, ts, entries, occupancy",
      (qb) => {
        let q = qb.eq("store_id", store).gte("ts", since);
        if (afterId !== undefined) {
          return q.gt("id", afterId).order("id", { ascending: true });
        }
        return q.order("ts", { ascending: true }).order("id", { ascending: true });
      }
    );

    const latest = rows.at(-1) ?? null;
    const body: CountsResponse = {
      rows,
      day,
      latestAgeSeconds: latest ? ageSeconds(latest.ts) : null,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    console.error("analytics/counts error:", e);
    return NextResponse.json({ error: "Error consultando conteos" }, { status: 500 });
  }
}
