import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { computeClosureTotals } from "@/lib/computeClosureTotals";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const store_id = searchParams.get("store_id");
    const register_id = searchParams.get("register_id");

    // Cajeros solo pueden consultar su propia sucursal
    if (!isSupervisor(session) && store_id && session.store_id !== store_id) {
      return forbidden("No podés consultar cierres de otra sucursal");
    }

    // ✅ Validaciones estrictas (evita devolver datos de otra caja por error)
    if (store_id && !isUuid(store_id)) {
      return NextResponse.json({ error: "store_id inválido (UUID)" }, { status: 400 });
    }
    if (register_id && !isUuid(register_id)) {
      return NextResponse.json({ error: "register_id inválido (UUID)" }, { status: 400 });
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
    }

    let q = supabaseAdmin
      .from("cash_closures")
      .select("*")
      .order("date", { ascending: false });

    if (date) q = q.eq("date", date);
    if (store_id) q = q.eq("store_id", store_id);
    if (register_id) q = q.eq("register_id", register_id);

    // Cajeros sin store_id explícito → forzar filtro a su propia sucursal
    if (!isSupervisor(session) && !store_id && session.store_id) {
      q = q.eq("store_id", session.store_id);
    }

    // Fecha + sucursal + caja → 1 cierre
    if (date && store_id && register_id) {
      const { data, error } = await q.maybeSingle();
      if (error) {
        console.error("Error en cash-closures:", error);
        return NextResponse.json({ error: "Error al procesar la operación" }, { status: 400 });
      }
      return NextResponse.json({ data }, { status: 200 });
    }

    // Listado
    const { data, error } = await q;
    if (error) {
      console.error("Error leyendo cash-closures:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (e) {
    console.error("Error en GET /api/cash-closures:", e);
    return NextResponse.json({ error: "Error inesperado en el servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const body = await req.json();

    // Cajeros solo pueden crear cierres de su propia sucursal
    if (!isSupervisor(session) && session.store_id !== body.store_id) {
      return forbidden("No podés crear cierres de otra sucursal");
    }

    if (!body.store_id || !body.date || !body.register_id) {
      return NextResponse.json({ error: "Faltan campos obligatorios (store_id, date, register_id)" }, { status: 400 });
    }

    // Recalcular totales desde la DB — ignorar los del body
    const totals = await computeClosureTotals(body.store_id, body.date, body.register_id);

    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .insert({
        store_id: body.store_id,
        register_id: body.register_id,
        date: body.date,
        ...totals,
        first_ticket_at: body.first_ticket_at ?? null,
        last_ticket_at: body.last_ticket_at ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Cierre ya existente para esta caja" }, { status: 409 });
      }
      console.error("Error insertando cash-closure:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    console.error("Error en POST /api/cash-closures:", e);
    return NextResponse.json({ error: "Error inesperado en el servidor" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const body = await req.json();

    // Cajeros solo pueden actualizar cierres de su propia sucursal
    if (!isSupervisor(session) && session.store_id !== body.store_id) {
      return forbidden("No podés modificar cierres de otra sucursal");
    }

    if (!body.store_id || !body.date || !body.register_id) {
      return NextResponse.json({ error: "Faltan campos obligatorios (store_id, date, register_id)" }, { status: 400 });
    }

    // Recalcular totales desde la DB — ignorar los del body
    const totals = await computeClosureTotals(body.store_id, body.date, body.register_id);

    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .upsert(
        {
          store_id: body.store_id,
          register_id: body.register_id,
          date: body.date,
          ...totals,
          first_ticket_at: body.first_ticket_at ?? null,
          last_ticket_at: body.last_ticket_at ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "store_id,register_id,date" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error en upsert cash-closure:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    console.error("Error en PUT /api/cash-closures:", e);
    return NextResponse.json({ error: "Error inesperado en el servidor" }, { status: 500 });
  }
}
