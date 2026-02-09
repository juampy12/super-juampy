import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string // SERVER-ONLY
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const storeId = String(body?.storeId ?? "");
    const productId = String(body?.productId ?? "");
    const newStock = Number(body?.newStock ?? NaN);
    const _reason = String(body?._reason ?? "adjust");

    if (!storeId || !productId || Number.isNaN(newStock)) {
      return NextResponse.json(
        { ok: false, error: "Parámetros inválidos" },
        { status: 400 }
      );
    }

    // 1) Stock actual desde product_stocks
    const { data: psRow, error: psErr } = await supabaseAdmin
      .from("product_stocks")
      .select("stock, updated_at")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .maybeSingle();

    if (psErr) {
      return NextResponse.json(
        { ok: false, error: psErr.message },
        { status: 400 }
      );
    }

    const current = Number(psRow?.stock ?? 0);
    const delta = newStock - current;

    if (delta === 0) {
      return NextResponse.json({
        ok: true,
        changed: false,
        previous: current,
        newStock,
        delta: 0,
        verified: current,
        verified_updated_at: psRow?.updated_at ?? null,
      });
    }

    // 2) Upsert en product_stocks + devolvemos lo que PostgREST devuelve (si devuelve)
    const { data: upData, error: upErr } = await supabaseAdmin
      .from("product_stocks")
      .upsert(
        {
          store_id: storeId,
          product_id: productId,
          stock: newStock,
        },
        { onConflict: "store_id,product_id" }
      )
      .select("stock, updated_at")
      .maybeSingle();

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: upErr.message },
        { status: 400 }
      );
    }

    // 3) Registrar movimiento (auditoría)
    const { error: insErr } = await supabaseAdmin
      .from("stock_movements")
      .insert({
        store_id: storeId,
        product_id: productId,
        reason: _reason || (delta >= 0 ? "adjust_in" : "adjust_out"),
        qty: Math.abs(delta),
        delta: delta,
      });

    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message },
        { status: 400 }
      );
    }

    // 4) Verificación definitiva: volvemos a leer product_stocks
    const { data: verifyRow, error: verifyErr } = await supabaseAdmin
      .from("product_stocks")
      .select("stock, updated_at")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .maybeSingle();

    if (verifyErr) {
      return NextResponse.json(
        { ok: false, error: verifyErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      previous: current,
      newStock,
      delta,
      upsert_returned: upData ?? null,
      verified: Number(verifyRow?.stock ?? null),
      verified_updated_at: verifyRow?.updated_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error" },
      { status: 400 }
    );
  }
}
