import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string // SERVER-ONLY
);

export async function POST(req: Request) {
  try {
    const body: any = await req.json();

    const dateFrom = String(body?.date_from ?? "");
    const dateTo = String(body?.date_to ?? "");
    const storeId = body?.store_id ? String(body.store_id) : null;

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "Missing date_from/date_to" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("register_cash_diff", {
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_store_id: storeId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
