import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string, // SERVER-ONLY
  { auth: { persistSession: false } }
);

type Body = {
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
  store_id?: string | null; // uuid o null
};

function isIsoDate(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
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

    // llama RPC
    const { data, error } = await supabaseAdmin.rpc("margin_suggestions", {
      p_date_from: date_from,
      p_date_to: date_to,
      p_store: store_id,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, hint: (error as any).hint ?? null },
        { status: 500 }
      );
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
    suggested_price =
      Number(current_price) * (1 + Number(suggested_pct) / 100);
  }

  return {
    ...row,
    current_price,
    current_markup_pct,
    suggested_price,
  };
});

return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
