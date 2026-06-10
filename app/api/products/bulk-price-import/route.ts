import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceUpdate = { productId: string; price: number };

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar precios");

    const body = await req.json();
    const updates: PriceUpdate[] = body?.updates ?? [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ ok: false, error: "Sin actualizaciones" }, { status: 400 });
    }

    let updated = 0;
    const errors: string[] = [];

    for (const item of updates) {
      const price = Math.round(Number(item.price) * 100) / 100;
      if (!item.productId || !Number.isFinite(price) || price < 0) {
        errors.push(`Dato inválido: ${JSON.stringify(item)}`);
        continue;
      }

      const { error } = await supabaseAdmin
        .from("products")
        .update({ price })
        .eq("id", item.productId);

      if (error) {
        errors.push(`Error en ${item.productId}: ${error.message}`);
      } else {
        updated++;
      }
    }

    return NextResponse.json({ ok: true, updated, errors });
  } catch (e: any) {
    console.error("Error en bulk-price-import:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
