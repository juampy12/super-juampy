import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

type Body = {
  date_from?: string;
  date_to?: string;
  store_id?: string | null;
};

function isIsoDate(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden acceder a inteligencia");

  try {
    const body = (await req.json()) as Body;

    const date_from = body?.date_from;
    const date_to = body?.date_to;
    const store_id = body?.store_id ?? null;

    if (!isIsoDate(date_from) || !isIsoDate(date_to)) {
      return NextResponse.json(
        { error: "date_from y date_to deben ser YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("margin_suggestions", {
      p_date_from: date_from,
      p_date_to: date_to,
      p_store: store_id,
    });

    if (error) {
      console.error("Error en margin_suggestions RPC:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    const rows = (data ?? []).map((row: any) => {
      const current_price = row.price ?? null;
      const current_markup_pct = row.margin_pct ?? null;
      const suggested_pct = row.suggested_pct ?? null;

      let suggested_price = null;
      if (
        current_price !== null &&
        suggested_pct !== null &&
        !Number.isNaN(Number(current_price)) &&
        !Number.isNaN(Number(suggested_pct))
      ) {
        suggested_price = Number(current_price) * (1 + Number(suggested_pct) / 100);
      }

      return { ...row, current_price, current_markup_pct, suggested_price };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error("Error inesperado en /api/intelligence/margin-suggestions:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
