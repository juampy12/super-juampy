export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { NO_STORE, parseStoreParam } from "@/lib/analytics/server";

// GET /api/analytics/heatmap?store=<id> → última grilla de calor (o null si no hay).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver la analítica");

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store" }, { status: 400 });

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
  return NextResponse.json({ heatmap: data ?? null }, { headers: NO_STORE });
}
