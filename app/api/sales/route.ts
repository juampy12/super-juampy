import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function argentinaDayToUtcRange(dateParam: string) {
  const startUtcIso = `${dateParam}T03:00:00.000Z`;
  const d = new Date(`${dateParam}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);
  const endUtcIso = `${nextDay}T03:00:00.000Z`;
  return { startUtcIso, endUtcIso };
}

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver el historial de ventas");

    const { searchParams } = new URL(req.url);
    const store_id = searchParams.get("store_id");
    const register_id = searchParams.get("register_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (store_id && !isUuid(store_id)) {
      return NextResponse.json({ error: "store_id inválido" }, { status: 400 });
    }
    if (register_id && !isUuid(register_id)) {
      return NextResponse.json({ error: "register_id inválido" }, { status: 400 });
    }
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return NextResponse.json({ error: "from inválido (YYYY-MM-DD)" }, { status: 400 });
    }
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "to inválido (YYYY-MM-DD)" }, { status: 400 });
    }

    let q = supabaseAdmin
      .from("sales")
      .select("id, created_at, total, store_id, register_id, payment")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(500);

    if (store_id) q = q.eq("store_id", store_id);
    if (register_id) q = q.eq("register_id", register_id);
    if (from) {
      const { startUtcIso } = argentinaDayToUtcRange(from);
      q = q.gte("created_at", startUtcIso);
    }
    if (to) {
      const { endUtcIso } = argentinaDayToUtcRange(to);
      q = q.lt("created_at", endUtcIso);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Error leyendo ventas:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    console.error("Error en /api/sales:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
