import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized, forbidden } from "@/lib/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const { searchParams } = new URL(req.url);
    const register_id = searchParams.get("register_id");

    if (!register_id || !UUID_RE.test(register_id)) {
      return NextResponse.json({ error: "register_id inválido" }, { status: 400 });
    }

    // Si el empleado tiene sucursal asignada, validar que la caja le pertenezca
    if (session.store_id) {
      const { data: reg } = await supabaseAdmin
        .from("registers")
        .select("store_id")
        .eq("id", register_id)
        .maybeSingle();
      if (reg && reg.store_id !== session.store_id) {
        return forbidden("Acceso denegado");
      }
    }

    // Rango del día en Argentina (UTC-3 → medianoche AR = 03:00 UTC)
    const now = new Date();
    const todayAR = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Cordoba",
    }).format(now);
    const startUtc = `${todayAR}T03:00:00.000Z`;
    const d = new Date(`${todayAR}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const endUtc = `${d.toISOString().slice(0, 10)}T03:00:00.000Z`;

    const { data, error } = await supabaseAdmin
      .from("sales")
      .select("id, created_at, total, payment, status")
      .eq("register_id", register_id)
      .in("status", ["confirmed", "anulada"])
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error leyendo ventas recientes:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    console.error("Error en /api/sales/recent:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
