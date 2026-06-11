import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Change = { product_id: string; stock: number };

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const body: any = await req.json().catch(() => ({}));

    const isBatch = Array.isArray(body?.changes);
    const storeId = String((body?.store_id ?? body?.storeId) ?? "").trim();
    const reason = String((body?.reason ?? body?._reason) ?? "adjust").trim();

    const changes: Change[] = isBatch
      ? (body.changes ?? [])
          .map((c: any) => ({
            product_id: String(c?.product_id ?? c?.productId ?? "").trim(),
            stock: Number(c?.stock ?? c?.newStock ?? NaN),
          }))
          .filter((c: any) => c.product_id && Number.isFinite(c.stock))
      : [
          {
            product_id: String(body?.productId ?? body?.product_id ?? "").trim(),
            stock: Number(body?.newStock ?? body?.stock ?? NaN),
          },
        ].filter((c) => c.product_id && Number.isFinite(c.stock));

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "Falta store_id" }, { status: 400 });
    }

    if (!isSupervisor(session) && session.store_id !== storeId) {
      return forbidden("No podés ajustar stock de otra sucursal");
    }

    if (!changes.length) {
      return NextResponse.json(
        { ok: false, error: "No hay cambios válidos para guardar." },
        { status: 400 }
      );
    }

    // 1) Leer todos los stocks actuales en una sola query (elimina N SELECTs)
    const productIds = changes.map((c) => c.product_id);
    const { data: psRows, error: psErr } = await supabaseAdmin
      .from("product_stocks")
      .select("product_id, stock")
      .eq("store_id", storeId)
      .in("product_id", productIds);

    if (psErr) {
      console.error("Error leyendo stocks actuales:", psErr);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    const currentMap: Record<string, number> = {};
    for (const row of psRows ?? []) {
      currentMap[row.product_id] = Number(row.stock ?? 0);
    }

    // 2) Calcular deltas y separar noops de cambios reales
    const results: Array<{
      product_id: string; changed: boolean;
      before: number; requested: number; stored: number; delta: number;
    }> = [];
    const changedItems: Array<Change & { current: number; delta: number }> = [];

    for (const ch of changes) {
      const current = currentMap[ch.product_id] ?? 0;
      const delta = ch.stock - current;
      if (delta === 0) {
        results.push({ product_id: ch.product_id, changed: false, before: current, requested: ch.stock, stored: current, delta: 0 });
      } else {
        changedItems.push({ ...ch, current, delta });
      }
    }

    if (changedItems.length > 0) {
      // 3) Upsert batch: un solo INSERT … ON CONFLICT UPDATE para todos los productos
      const { error: upErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          changedItems.map((item) => ({
            store_id: storeId,
            product_id: item.product_id,
            stock: item.stock,
          })),
          { onConflict: "store_id,product_id" }
        );

      if (upErr) {
        console.error("Error actualizando stocks:", upErr);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }

      // 4) Insert batch de movimientos (un solo INSERT para todos)
      const now = new Date().toISOString();
      const { error: insErr } = await supabaseAdmin.from("stock_movements").insert(
        changedItems.map((item) => ({
          store_id: storeId,
          product_id: item.product_id,
          qty: Math.max(1, Math.round(Math.abs(item.delta))),
          qty_delta: item.delta,
          delta: item.delta,
          reason,
          note: null,
          created_at: now,
        }))
      );

      if (insErr) {
        console.error("Error registrando movimientos de stock:", insErr);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }

      for (const item of changedItems) {
        results.push({
          product_id: item.product_id,
          changed: true,
          before: item.current,
          requested: item.stock,
          stored: item.stock,
          delta: item.delta,
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("Error inesperado en /api/stock/adjust:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
