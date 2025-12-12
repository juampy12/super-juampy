import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CashClosurePayload = {
  store_id: string;
  date: string;
  total_sales: number;
  total_tickets: number;

  total_cash: number;
  total_debit: number;
  total_credit: number;
  total_mp: number;
  total_cuenta_corriente: number;
  total_mixto: number;

  first_ticket_at: string | null;
  last_ticket_at: string | null;

  notes?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CashClosurePayload;

    if (!body.date) {
      return NextResponse.json(
        { error: "Falta la fecha del cierre" },
        { status: 400 }
      );
    }

const { data, error } = await supabaseAdmin
  .from("cash_closures")
  .insert(
    {
      store_id: body.store_id,
      date: body.date,
      total_sales: body.total_sales,
      total_tickets: body.total_tickets,
      total_cash: body.total_cash,
      total_debit: body.total_debit,
      total_credit: body.total_credit,
      total_mp: body.total_mp,
      total_cuenta_corriente: body.total_cuenta_corriente,
      total_mixto: body.total_mixto,
      first_ticket_at: body.first_ticket_at,
      last_ticket_at: body.last_ticket_at,
      notes: body.notes ?? null,
    },
    { onConflict: "store_id,date" }
  )
  .select()
  .single();

if (error) {
  console.error("Error insertando cash_closure:", error);

  // Si es conflicto por clave única, avisar al frontend
  if (error.code === "23505") {
    return NextResponse.json(
      { error: "Cierre ya existente" },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: error.message },
    { status: 400 }
  );
}

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    console.error("Error en POST /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const storeId = searchParams.get("store_id");

    const baseSelect =
      "id, store_id, date, closed_at, total_sales, total_tickets, total_cash";

    // Si vienen fecha y sucursal: devolver solo ese cierre (si existe)
    if (date && storeId) {
      const { data, error } = await supabaseAdmin
        .from("cash_closures")
        .select(baseSelect)
        .eq("date", date)
        .eq("store_id", storeId)
        .order("closed_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error buscando cash_closure puntual:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

      return NextResponse.json({ data: row }, { status: 200 });
    }

    // Sin filtros: listado completo (historial)
    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .select(baseSelect)
      .order("date", { ascending: false })
      .order("closed_at", { ascending: false });

    if (error) {
      console.error("Error listando cash_closures:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    console.error("Error en GET /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as CashClosurePayload;

    if (!body.date) {
      return NextResponse.json(
        { error: "Falta la fecha del cierre" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("cash_closures")
      .upsert(
        {
          store_id: body.store_id,
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
        { onConflict: "store_id,date" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error reemplazando cash_closure:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    console.error("Error en PUT /api/cash-closures:", e);
    return NextResponse.json(
      { error: "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
