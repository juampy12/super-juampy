import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InItem = {
  product_id?: string;
  productId?: string;
  id?: string;
  sku?: string | null;
  code?: string | null;
  barcode?: string | null;
  product?: {
    id?: string;
    sku?: string | null;
    code?: string | null;
    barcode?: string | null;
  };

  qty?: number | string;
  quantity?: number | string;
  cantidad?: number | string;
  count?: number | string;
  amount?: number | string;
  q?: number | string;

  unit_price?: number | string;
  price?: number | string;
  unitPrice?: number | string;
  importe?: number | string;
};

type PaymentInfo = {
  method: "efectivo" | "debito" | "credito" | "mp" | "cuenta_corriente" | "mixto";
  total_paid?: number;
  change?: number;
  breakdown?: {
    cash?: number;
    debit?: number;
    credit?: number;
    mp?: number;
    account?: number;
  };
  notes?: string;
};

// helpers para leer el item
const resolveProductId = (item: InItem): string | null =>
  item.product_id || item.productId || item.id || item.product?.id || null;

const resolveQty = (item: InItem): number =>
  Number(
    item.qty ??
      item.quantity ??
      item.cantidad ??
      item.count ??
      item.amount ??
      item.q ??
      0
  );

const resolveUnitPrice = (item: InItem): number =>
  Number(item.unit_price ?? item.price ?? item.unitPrice ?? item.importe ?? 0);

// store / sucursal actual: SOLO lee lo que viene del body
const resolveStoreId = (body: any): string | null =>
  body.store_id ?? body.storeId ?? body.branch_id ?? body.sucursal_id ?? null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("POS /api/pos/confirm BODY:", JSON.stringify(body, null, 2));

    const storeId = resolveStoreId(body);
    const register_id = body.register_id ?? body.registerId ?? null;

    if (!storeId) {
      return NextResponse.json(
        { error: "store_id / branch_id es obligatorio" },
        { status: 400 }
      );
    }
    if (!register_id) {
      return NextResponse.json(
        { error: "register_id es obligatorio (falta caja)" },
        { status: 400 }
      );
    }

    const rawItems: InItem[] = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map((it) => ({
        product_id: resolveProductId(it),
        qty: resolveQty(it),
        unit_price: resolveUnitPrice(it),
      }))
      .filter((it) => it.product_id && it.qty > 0);

    if (!items.length) {
      return NextResponse.json(
        { error: "No hay ítems válidos para registrar la venta" },
        { status: 400 }
      );
    }

    const total = Number(body.total ?? 0);
    const payment: PaymentInfo | null = body.payment ?? null;

    // 1) Registrar venta (RPC actual)
    const { data, error } = await supabaseAdmin.rpc("confirm_sale_with_stock", {
      p_store_id: storeId,
      p_items: items,
      p_total: total,
      p_payment: payment,
      p_register_id: register_id,
    });

    if (error) {
      console.error("Error en confirm_sale_with_stock:", error);
      return NextResponse.json(
        { error: "Error al registrar la venta", details: error.message },
        { status: 400 }
      );
    }

    const saleId = data as string | null;

    // 2) Asegurar register_id (si el RPC no lo guardó)
    if (saleId && register_id) {
      await supabaseAdmin.from("sales").update({ register_id }).eq("id", saleId);
    }

    // 3) ✅ PARCHE: asegurar descuento de stock + movimiento correcto
    // La función SQL (confirm_sale_with_stock) hoy está creando movimientos "sale"
    // con qty_delta NULL y sin ref_sale_id, y NO descuenta product_stocks.
    // Este bloque garantiza consistencia y además evita duplicar si mañana se arregla la SQL.
    if (saleId) {
      for (const it of items) {
        const productId = String(it.product_id);
        const qty = Number(it.qty ?? 0);

        if (!productId || !Number.isFinite(qty) || qty <= 0) continue;

        // 3.1) Si ya existe movimiento con ref_sale_id, no hacemos nada
        const { data: already } = await supabaseAdmin
          .from("stock_movements")
          .select("id")
          .eq("store_id", storeId)
          .eq("product_id", productId)
          .eq("ref_sale_id", saleId)
          .limit(1);

        if (already && already.length > 0) continue;

        // 3.2) Leer stock actual
        const { data: psRow, error: psErr } = await supabaseAdmin
          .from("product_stocks")
          .select("stock")
          .eq("store_id", storeId)
          .eq("product_id", productId)
          .maybeSingle();

        if (psErr) {
          console.error("Error leyendo product_stocks:", psErr);
          return NextResponse.json(
            { error: "Venta OK, pero falló lectura de stock", details: psErr.message },
            { status: 500 }
          );
        }

        const current = Number(psRow?.stock ?? 0);
        const newStock = current - qty;

        // 3.3) Upsert stock final
        const { error: upErr } = await supabaseAdmin
          .from("product_stocks")
          .upsert(
            { store_id: storeId, product_id: productId, stock: newStock },
            { onConflict: "store_id,product_id" }
          );

        if (upErr) {
          console.error("Error actualizando product_stocks:", upErr);
          return NextResponse.json(
            { error: "Venta OK, pero falló descuento de stock", details: upErr.message },
            { status: 500 }
          );
        }

        // 3.4) Insert movimiento correcto (qty NOT NULL, qty_delta NEGATIVO, ref_sale_id OK)
        const qtyInt = Math.max(1, Math.round(Math.abs(qty)));

        const { error: mvErr } = await supabaseAdmin.from("stock_movements").insert({
          store_id: storeId,
          product_id: productId,
          qty: qtyInt,
          qty_delta: -qty,
          reason: "sale",
          note: null,
          ref_sale_id: saleId,
          created_at: new Date().toISOString(),
        });

        if (mvErr) {
          // no frenamos: el stock ya quedó bien
          console.error("Error insertando stock_movements (parche):", mvErr);
        }
      }
    }

    return NextResponse.json({ ok: true, saleId });
  } catch (e: any) {
    console.error("Error inesperado en /api/pos/confirm:", e);
    return NextResponse.json(
      { error: e?.message || "Error inesperado" },
      { status: 500 }
    );
  }
}
