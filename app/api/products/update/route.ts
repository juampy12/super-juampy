import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const productId = body?.productId as string | undefined;
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Falta productId" }, { status: 400 });
    }

    const cost_net = Number(body?.cost_net ?? 0);
    const vat_rate = Number(body?.vat_rate ?? 0);
    const markup_rate = Number(body?.markup_rate ?? 0);
    const units_per_case = Number(body?.units_per_case ?? 1);

    // Precio final = costo * (1 + IVA%) * (1 + margen%)
    const withVat = cost_net * (1 + vat_rate / 100);
    const finalPrice = Math.round(withVat * (1 + markup_rate / 100) * 100) / 100;

    const { error } = await supabaseAdmin
      .from("products")
      .update({
        cost_net,
        vat_rate,
        markup_rate,
        units_per_case,
        price: finalPrice,
      })
      .eq("id", productId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, price: finalPrice });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
