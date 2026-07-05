import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Update = {
  productId: string;
  use_final_price?: boolean;
  final_price?: number | null;
  cost_net?: number;
  vat_rate?: number;
  markup_rate?: number;
};

// Mismo tope que /api/products/bulk-price-import: un solo UPDATE ... FROM
// unnest() sigue siendo rápido con miles de filas, esto es una segunda
// barrera por si el payload/parseo de JSON crece sin control.
const MAX_BATCH = 1000;

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar precios");

    const body = await req.json().catch(() => ({}));
    const updates: Update[] = Array.isArray(body?.updates) ? body.updates : [];

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "Sin actualizaciones" }, { status: 400 });
    }
    if (updates.length > MAX_BATCH) {
      return NextResponse.json(
        { ok: false, error: `Máximo ${MAX_BATCH} productos por lote — dividí en lotes más chicos` },
        { status: 400 }
      );
    }

    const ids: string[] = [];
    const prices: number[] = [];
    const costNets: (number | null)[] = [];
    const markupRates: (number | null)[] = [];
    const vatRates: (number | null)[] = [];
    const failedIds: string[] = [];

    for (const item of updates) {
      const productId = String(item?.productId ?? "").trim();
      if (!productId) continue;

      const useFinal = item?.use_final_price === true;

      if (useFinal) {
        // Modo manual: igual que /api/products/update, solo se toca price —
        // cost_net/vat_rate/markup_rate quedan como estaban.
        const finalPrice = Number(item?.final_price);
        if (!Number.isFinite(finalPrice) || finalPrice < 0) {
          failedIds.push(productId);
          continue;
        }

        ids.push(productId);
        prices.push(Math.round(finalPrice * 100) / 100);
        costNets.push(null);
        markupRates.push(null);
        vatRates.push(null);
        continue;
      }

      // Modo cálculo: cost_net * (1 + IVA%) * (1 + margen%), igual que
      // /api/products/update y el form de /catalogo.
      const cost_net = Number(item?.cost_net);
      const vat_rate = Number(item?.vat_rate);
      const markup_rate = Number(item?.markup_rate);

      if (
        !Number.isFinite(cost_net) || cost_net < 0 ||
        !Number.isFinite(vat_rate) || vat_rate < 0 ||
        !Number.isFinite(markup_rate) || markup_rate < 0
      ) {
        failedIds.push(productId);
        continue;
      }

      const withVat = cost_net * (1 + vat_rate / 100);
      const finalPrice = Math.round(withVat * (1 + markup_rate / 100) * 100) / 100;

      ids.push(productId);
      prices.push(finalPrice);
      costNets.push(cost_net);
      markupRates.push(markup_rate);
      vatRates.push(vat_rate);
    }

    let updated = 0;
    if (ids.length > 0) {
      const { data, error } = await supabaseAdmin.rpc("bulk_update_product_prices_v3", {
        p_ids: ids,
        p_prices: prices,
        p_cost_nets: costNets,
        p_markup_rates: markupRates,
        p_vat_rates: vatRates,
      });

      if (error) {
        console.error("Error en bulk_update_product_prices_v3:", error);
        return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
      }
      updated = data ?? 0;
    }

    return NextResponse.json({ ok: true, updated, failedIds });
  } catch (e: any) {
    console.error("Error inesperado en /api/products/bulk-update:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
