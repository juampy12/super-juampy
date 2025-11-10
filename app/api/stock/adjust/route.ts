import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string   // SERVER-ONLY
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId   = String(body?.storeId ?? "");
    const productId = String(body?.productId ?? "");
    const newStock  = Number(body?.newStock ?? NaN);
    const _reason    = String(body?._reason ?? "adjust");

    if (!storeId || !productId || Number.isNaN(newStock)) {
      return NextResponse.json({ ok:false, error:"Parámetros inválidos" }, { status:400 });
    }

    // stock actual en esa sucursal
    const { data: curRows, error: curErr } = await supabaseAdmin
      .from("stock_movements")
      .select("delta")
      .eq("store_id", storeId)
      .eq("product_id", productId);

    if (curErr) return NextResponse.json({ ok:false, error:curErr.message }, { status:400 });

    const current = (curRows ?? []).reduce((s, r:any) => s + Number(r.delta || 0), 0);
    const delta   = newStock - current;
    if (delta === 0) return NextResponse.json({ ok:true, changed:false });

    const { error: insErr } = await supabaseAdmin
      .from("stock_movements")
      .insert({
        store_id: storeId,
        product_id: productId,
        _reason: delta >= 0 ? "adjust_in" : "adjust_out",
        qty: Math.abs(delta),
        delta: delta
      });

    if (insErr) return NextResponse.json({ ok:false, error:insErr.message }, { status:400 });

    return NextResponse.json({ ok:true, changed:true, delta });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? "Error" }, { status:400 });
  }
}
