import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProvided(v: any) {
  return v !== undefined && v !== null && v !== "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const productId = String(body?.productId ?? body?.product_id ?? "").trim();
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Falta productId" }, { status: 400 });
    }

    // ✅ Si viene final_price => guardamos SOLO price (NO tocamos cost/vat/markup)
    const hasFinal = isProvided(body?.final_price);

    if (hasFinal) {
      let finalPrice = Number(body.final_price);
      if (!Number.isFinite(finalPrice) || finalPrice < 0) {
        return NextResponse.json({ ok: false, error: "final_price inválido" }, { status: 400 });
      }
      finalPrice = Math.round(finalPrice * 100) / 100;

      const { error } = await supabaseAdmin
        .from("products")
        .update({ price: finalPrice })
        .eq("id", productId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, price: finalPrice, mode: "direct" });
    }

    // ✅ Modo cálculo: acá sí esperamos cost/vat/markup (si no, error)
    const cost_net = Number(body?.cost_net);
    const vat_rate = Number(body?.vat_rate);
    const markup_rate = Number(body?.markup_rate);
    const units_per_case = isProvided(body?.units_per_case) ? Number(body.units_per_case) : 1;

    if (!Number.isFinite(cost_net) || cost_net < 0) {
      return NextResponse.json({ ok: false, error: "cost_net inválido" }, { status: 400 });
    }
    if (!Number.isFinite(vat_rate) || vat_rate < 0) {
      return NextResponse.json({ ok: false, error: "vat_rate inválido" }, { status: 400 });
    }
    if (!Number.isFinite(markup_rate) || markup_rate < 0) {
      return NextResponse.json({ ok: false, error: "markup_rate inválido" }, { status: 400 });
    }
    if (!Number.isFinite(units_per_case) || units_per_case <= 0) {
      return NextResponse.json({ ok: false, error: "units_per_case inválido" }, { status: 400 });
    }

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

    return NextResponse.json({ ok: true, price: finalPrice, mode: "calc" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
