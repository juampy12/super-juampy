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

    // ✅ NUEVO: si viene final_price, NO calculamos, guardamos directo
    const hasFinal = body?.final_price !== undefined && body?.final_price !== null && body?.final_price !== "";
    let finalPrice: number;

    if (hasFinal) {
      finalPrice = Number(body.final_price);
      if (!Number.isFinite(finalPrice) || finalPrice < 0) {
        return NextResponse.json(
          { ok: false, error: "final_price inválido" },
          { status: 400 }
        );
      }
      // redondeo 2 decimales
      finalPrice = Math.round(finalPrice * 100) / 100;
    } else {
      // Precio final = costo * (1 + IVA%) * (1 + margen%)
      const withVat = cost_net * (1 + vat_rate / 100);
      finalPrice = Math.round(withVat * (1 + markup_rate / 100) * 100) / 100;
    }

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

    return NextResponse.json({ ok: true, price: finalPrice, mode: hasFinal ? "direct" : "calc" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
