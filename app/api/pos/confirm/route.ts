import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InItem = {
  product_id?: string;
  productId?: string;
  id?: string;
  product?: { id?: string };

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

const resolveProductId = (item: InItem): string | null =>
  item.product_id || item.productId || item.id || item.product?.id || null;

const resolveQty = (item: InItem): number =>
  Number(item.qty ?? item.quantity ?? item.cantidad ?? item.count ?? item.amount ?? item.q ?? 0);

const resolveUnitPrice = (item: InItem): number =>
  Number(item.unit_price ?? item.price ?? item.unitPrice ?? item.importe ?? 0);

const resolveStoreId = (body: any): string | null =>
  body.store_id ?? body.storeId ?? body.branch_id ?? body.sucursal_id ?? null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const storeId = resolveStoreId(body);
    const register_id = body.register_id ?? body.registerId ?? null;

    if (!storeId) {
      return NextResponse.json({ error: "store_id es obligatorio" }, { status: 400 });
    }
    if (!register_id) {
      return NextResponse.json({ error: "register_id es obligatorio (falta caja)" }, { status: 400 });
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
      return NextResponse.json({ error: "No hay ítems válidos para registrar la venta" }, { status: 400 });
    }

    const total = Number(body.total ?? 0);
    const payment: PaymentInfo | null = body.payment ?? null;

    // RPC: confirm_sale_with_stock mete register_id dentro de payment para confirm_sale
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

    // seguridad extra: si por algún motivo no se guardó register_id en sales, lo aseguramos
    if (saleId && register_id) {
      await supabaseAdmin.from("sales").update({ register_id }).eq("id", saleId);
    }

    return NextResponse.json({ ok: true, saleId });
  } catch (e: any) {
    console.error("Error inesperado en /api/pos/confirm:", e);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
