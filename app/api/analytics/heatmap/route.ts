export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NO_STORE, ageSeconds, parseStoreParam, requireSupervisor } from "@/lib/analytics/server";
import type { HeatmapResponse } from "@/lib/analytics/queries";
import type { HeatmapRow } from "@/lib/analytics/types";

// GET /api/analytics/heatmap?store=<id>
// → { heatmap, ageSeconds }: última grilla de calor (o null si no hay), con su
// antigüedad calculada acá (no con el reloj del navegador) para que el panel
// pueda avisar cuando lo que muestra ya no es actual.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("analytics_heatmap")
    .select("id, store_id, ts, cols, rows, grid")
    .eq("store_id", store)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("analytics/heatmap error:", error);
    return NextResponse.json({ error: "Error consultando mapa de calor" }, { status: 500 });
  }

  const heatmap = (data ?? null) as HeatmapRow | null;
  const body: HeatmapResponse = {
    heatmap,
    ageSeconds: heatmap ? ageSeconds(heatmap.ts) : null,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
