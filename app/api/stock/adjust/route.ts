import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string // SERVER-ONLY
);

export async function POST(req: Request) {
  try {
    const body: any = await req.json();

    // Detectar batch si viene changes como array
    const isBatch = Array.isArray(body?.changes);

    // Aceptar store_id (snake) o storeId (camel)
    const storeId = String((body?.store_id ?? body?.storeId) ?? "");

    // Aceptar reason (batch) o _reason (single)
    const reason = String((body?.reason ?? body?._reason) ?? "adjust");

    // Normalizar cambios:
    // - Batch esperado: { product_id, stock }
    // - Pero aceptamos también: { productId, newStock } o mezclas
    const changes: Array<{ product_id: string; stock: number }> = isBatch
      ? (body.changes ?? [])
          .map((c: any) => ({
            product_id: String(c?.product_id ?? c?.productId ?? ""),
            stock: Number(c?.stock ?? c?.newStock ?? NaN),
          }))
          .filter((c: any) => c.product_id && Number.isFinite(c.stock))
      : [
          {
            product_id: String(body?.productId ?? body?.product_id ?? ""),
            stock: Number(body?.newStock ?? body?.stock ?? NaN),
          },
        ].filter((c) => c.product_id && Number.isFinite(c.stock));

    if (!storeId || changes.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Parámetros inválidos",
          storeId,
          changesCount: changes.length,
        },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const ch of changes) {
      const productId = ch.product_id;
      const newStock = ch.stock;

      // leer stock actual
      const { data: psRow, error: psErr } = await supabaseAdmin
        .from("product_stocks")
        .select("stock")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .maybeSingle();

      if (psErr) {
        return NextResponse.json(
          { ok: false, error: psErr.message, product_id: productId },
          { status: 400 }
        );
      }

      const current = Number(psRow?.stock ?? 0);
      const delta = newStock - current;

      if (delta === 0) {
        results.push({
          product_id: productId,
          changed: false,
          before: current,
          requested: newStock,
          stored: current,
          delta: 0,
        });
        continue;
      }

      // upsert stock
      const { data: upData, error: upErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          { store_id: storeId, product_id: productId, stock: newStock },
          { onConflict: "store_id,product_id" }
        )
        .select("stock")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json(
          { ok: false, error: upErr.message, product_id: productId },
          { status: 400 }
        );
      }

      // movimiento
      const { error: insErr } = await supabaseAdmin
        .from("stock_movements")
        .insert({
          store_id: storeId,
          product_id: productId,
          reason,
          qty: Math.abs(delta),
          delta,
        });

      if (insErr) {
        return NextResponse.json(
          { ok: false, error: insErr.message, product_id: productId },
          { status: 400 }
        );
      }

      results.push({
        product_id: productId,
        changed: true,
        before: current,
        requested: newStock,
        stored: Number(upData?.stock ?? newStock),
        delta,
      });
    }

    return NextResponse.json({
      ok: true,
      store_id: storeId,
      count: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error" },
      { status: 400 }
    );
  }
}
