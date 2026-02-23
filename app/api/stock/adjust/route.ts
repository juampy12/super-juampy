import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string;

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type BatchBody = {
  store_id?: string;
  changes?: Array<{ product_id?: string; stock?: number }>;
  reason?: string;
};

type SingleBody = {
  storeId?: string;
  productId?: string;
  newStock?: number;
  _reason?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BatchBody & SingleBody;

    const isBatch = Array.isArray((body as any)?.changes);

    const storeId = String(
      (isBatch ? (body as any)?.store_id : (body as any)?.storeId) ?? ""
    );

    const reason = String(
      (isBatch ? (body as any)?.reason : (body as any)?._reason) ?? "adjust"
    );

    const changes: Array<{ product_id: string; stock: number }> = isBatch
      ? ((body as any).changes ?? [])
          .map((c: any) => ({
            product_id: String(c?.product_id ?? ""),
            stock: Number(c?.stock),
          }))
          .filter((c: any) => c.product_id && Number.isFinite(c.stock))
      : [
          {
            product_id: String((body as any)?.productId ?? ""),
            stock: Number((body as any)?.newStock),
          },
        ].filter((c) => c.product_id && Number.isFinite(c.stock));

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    if (!storeId || changes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Parámetros inválidos", storeId, changesCount: changes.length },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const ch of changes) {
      const productId = ch.product_id;
      const newStock = Number(ch.stock);

      console.log("[stock.adjust] incoming", { storeId, productId, newStock, reason });

      // 1) leer actual
      const { data: beforeRow, error: beforeErr } = await supabaseAdmin
        .from("product_stocks")
        .select("stock")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .maybeSingle();

      if (beforeErr) {
        return NextResponse.json(
          { ok: false, error: beforeErr.message, step: "read_before", product_id: productId },
          { status: 400 }
        );
      }

      const before = Number(beforeRow?.stock ?? 0);
      const delta = newStock - before;

      // 2) INSERT MOVIMIENTO PRIMERO
      // (si hay trigger que recalcula/pisa product_stocks, que lo haga ahora)
      if (delta !== 0) {
        const { error: insErr } = await supabaseAdmin.from("stock_movements").insert({
          store_id: storeId,
          product_id: productId,
          reason,
          qty: Math.abs(delta),
          delta,
        });

        if (insErr) {
          return NextResponse.json(
            { ok: false, error: insErr.message, step: "insert_movement", product_id: productId },
            { status: 400 }
          );
        }
      }

      // 3) AHORA sí: SET stock (pisamos cualquier trigger)
      const { data: upRow, error: upErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          { store_id: storeId, product_id: productId, stock: newStock },
          { onConflict: "store_id,product_id" }
        )
        .select("stock")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json(
          { ok: false, error: upErr.message, step: "upsert", product_id: productId },
          { status: 400 }
        );
      }

      // 4) verificar final
      const { data: afterRow, error: afterErr } = await supabaseAdmin
        .from("product_stocks")
        .select("stock")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .maybeSingle();

      if (afterErr) {
        return NextResponse.json(
          { ok: false, error: afterErr.message, step: "read_after", product_id: productId },
          { status: 400 }
        );
      }

      const after = Number(afterRow?.stock ?? 0);

      console.log("[stock.adjust] wrote", { storeId, productId, before, newStock, upRow, after });

      if (after !== newStock) {
        return NextResponse.json(
          {
            ok: false,
            error: "No quedó escrito el stock final (after != newStock).",
            store_id: storeId,
            product_id: productId,
            before,
            newStock,
            upsert_returned: upRow ?? null,
            after,
          },
          { status: 500 }
        );
      }

      results.push({
        product_id: productId,
        before,
        requested: newStock,
        stored: after,
        delta,
      });
    }

    return NextResponse.json({ ok: true, store_id: storeId, count: results.length, results });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error" },
      { status: 400 }
    );
  }
}
