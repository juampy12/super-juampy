import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const store_id = searchParams.get("store_id");
    const register_id = searchParams.get("register_id");

    let q = supabaseAdmin
      .from("cash_closures")
      .select("*")
      .order("date", { ascending: false });

    if (date) q = q.eq("date", date);
    if (store_id) q = q.eq("store_id", store_id);
    if (register_id && isUuid(register_id)) q = q.eq("register_id", register_id);

    // Fecha + sucursal + caja → 1 cierre
    if (date && store_id && register_id) {
      const { data, error } = await q.maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ data }, { status: 200 });
    }

    // Listado
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data ?? [] }, { status: 200 });
  } catch (e) {
    console.error("Error en GET /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .insert({
        store_id: body.store_id,
        register_id: body.register_id,
        date: body.date,
        total_sales: body.total_sales,
        total_tickets: body.total_tickets,
        total_cash: body.total_cash,
        total_debit: body.total_debit,
        total_credit: body.total_credit,
        total_mp: body.total_mp,
        total_cuenta_corriente: body.total_cuenta_corriente,
        total_mixto: body.total_mixto,
        first_ticket_at: body.first_ticket_at ?? null,
        last_ticket_at: body.last_ticket_at ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Cierre ya existente para esta caja" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    console.error("Error en POST /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .upsert(
        {
          store_id: body.store_id,
          register_id: body.register_id,
          date: body.date,
          total_sales: body.total_sales,
          total_tickets: body.total_tickets,
          total_cash: body.total_cash,
          total_debit: body.total_debit,
          total_credit: body.total_credit,
          total_mp: body.total_mp,
          total_cuenta_corriente: body.total_cuenta_corriente,
          total_mixto: body.total_mixto,
          first_ticket_at: body.first_ticket_at ?? null,
          last_ticket_at: body.last_ticket_at ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "store_id,register_id,date" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    console.error("Error en PUT /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
