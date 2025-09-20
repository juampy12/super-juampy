import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InItem = { product_id?: string; productId?: string; id?: string; qty?: number; unit_price?: number; price?: number };

function normItems(input: any) {
  const src = input?.items ?? input?.detalle ?? input?.products ?? input?.cart ?? input;
  if (!Array.isArray(src)) return [];
  return src.map((r: InItem) => ({
    product_id: String(r.product_id ?? r.productId ?? r.id ?? ""),
    qty: Number(r.qty ?? 0),
    unit_price: Number(r.unit_price ?? r.price ?? 0),
  })).filter(i => i.product_id && i.qty > 0);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const items = normItems(body);
    const total = Number(body?.total ?? 0);
    const payment = body?.payment ?? {};
    const storeId = body?.storeId ?? null;

    if (items.length === 0) {
      return NextResponse.json({ ok:false, error:"Sin items" }, { status:400 });
    }

    // Llamada transaccional
    const { data, error } = await supabaseAdmin.rpc("confirm_sale", {
      p_store_id: storeId,
      p_items: items,
      p_total: total,
      p_payment: payment
    });

    if (error) {
      console.error("confirm_sale error:", error);
      return NextResponse.json({ ok:false, error:error.message }, { status:400 });
    }

    return NextResponse.json({ ok:true, sale_id: data?.sale_id ?? data?.saleId ?? data });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? "Error" }, { status:400 });
  }
}
