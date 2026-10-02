export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NO_STORE, ageSeconds, parseStoreParam, requireSupervisor } from "@/lib/analytics/server";
import type { HealthResponse, HealthRow } from "@/lib/analytics/types";

const STALE_SECONDS = 60; // sin latido por 60s => cámara sin señal
const LOOKBACK_MS = 5 * 60_000; // ventana para juntar el latido de cada cámara

interface HealthRawRow {
  id: number;
  camera_id: string;
  ts: string;
  fps: number;
  status: string;
}

// GET /api/analytics/health?store=<id>
// → { cameras, onlineCount, totalCount, lastHeartbeatAgeSeconds }: multi-cámara — cada cámara escribe su
// propio latido con su camera_id (solo la cámara de entrada escribe counts/
// ocupación, pero todas escriben health). Se trae el último latido POR
// camera_id, con la antigüedad calculada acá (no con el reloj del navegador).
// `lastHeartbeatAgeSeconds` es la antigüedad del último latido del local SIN
// límite de ventana (para la alerta "motor sin señal" del panel): si el motor
// lleva más de 5 min caído, `cameras` viene vacío y hay que ir a buscarlo aparte.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("analytics_health")
    .select("id, camera_id, ts, fps, status")
    .eq("store_id", store)
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(500);

  if (error) {
    console.error("analytics/health error:", error);
    return NextResponse.json({ error: "Error consultando estado del motor" }, { status: 500 });
  }

  // Ordenado desc por ts: la primera fila que se ve de cada camera_id ya es su
  // latido más nuevo.
  const seen = new Set<string>();
  const cameras: HealthRow[] = [];
  for (const row of (data ?? []) as HealthRawRow[]) {
    if (seen.has(row.camera_id)) continue;
    seen.add(row.camera_id);
    const age = ageSeconds(row.ts);
    cameras.push({
      id: row.id,
      camera_id: row.camera_id,
      ts: row.ts,
      fps: row.fps,
      status: row.status,
      ageSeconds: age,
      online: row.status === "online" && age < STALE_SECONDS,
    });
  }
  cameras.sort((a, b) => a.camera_id.localeCompare(b.camera_id));

  let lastHeartbeatAgeSeconds: number | null =
    cameras.length > 0 ? Math.min(...cameras.map((c) => c.ageSeconds)) : null;
  if (lastHeartbeatAgeSeconds === null) {
    const last = await supabaseAdmin
      .from("analytics_health")
      .select("ts")
      .eq("store_id", store)
      .order("ts", { ascending: false })
      .limit(1);
    if (last.error) {
      console.error("analytics/health error:", last.error);
      return NextResponse.json({ error: "Error consultando estado del motor" }, { status: 500 });
    }
    const row = (last.data ?? [])[0] as { ts: string } | undefined;
    lastHeartbeatAgeSeconds = row ? ageSeconds(row.ts) : null;
  }

  const body: HealthResponse = {
    cameras,
    onlineCount: cameras.filter((c) => c.online).length,
    totalCount: cameras.length,
    lastHeartbeatAgeSeconds,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
