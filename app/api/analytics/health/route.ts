export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { NO_STORE, parseStoreParam } from "@/lib/analytics/server";

// GET /api/analytics/health?store=<id> → último latido del motor de visión (o null si no hay).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver la analítica");

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("analytics_health")
    .select("id, store_id, camera_id, ts, fps, status")
    .eq("store_id", store)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("analytics/health error:", error);
    return NextResponse.json({ error: "Error consultando estado del motor" }, { status: 500 });
  }
  return NextResponse.json({ health: data ?? null }, { headers: NO_STORE });
}
