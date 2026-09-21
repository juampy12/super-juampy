export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import {
  NO_STORE,
  parseAfterIdParam,
  parseStoreParam,
  startOfDayArgentina,
  todayArgentina,
} from "@/lib/analytics/server";
import type { CountRow } from "@/lib/analytics/types";

// GET /api/analytics/counts?store=<id>[&after_id=<n>]
// → { rows, day }: conteos de analytics_counts del día (hora de Argentina).
// Sin after_id: todo el día, ascendente por ts. Con after_id: solo las filas con
// id mayor (para polling incremental), ascendente por id. `day` (YYYY-MM-DD) le
// permite al cliente detectar el cambio de día y volver a pedir el día completo.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver la analítica");

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store" }, { status: 400 });

  const afterId = parseAfterIdParam(req);
  if (afterId === null) return NextResponse.json({ error: "after_id inválido" }, { status: 400 });

  try {
    const day = todayArgentina();
    const since = startOfDayArgentina(day);
    // Paginado: PostgREST corta en 1000 filas y un día de conteos puede superarlas.
    const rows = await fetchAllRows<CountRow>(
      "analytics_counts",
      "id, store_id, ts, entries, exits, occupancy",
      (qb) => {
        let q = qb.eq("store_id", store).gte("ts", since);
        if (afterId !== undefined) {
          return q.gt("id", afterId).order("id", { ascending: true });
        }
        return q.order("ts", { ascending: true }).order("id", { ascending: true });
      }
    );
    return NextResponse.json({ rows, day }, { headers: NO_STORE });
  } catch (e) {
    console.error("analytics/counts error:", e);
    return NextResponse.json({ error: "Error consultando conteos" }, { status: 500 });
  }
}
