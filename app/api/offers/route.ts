import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

type OfferType = "fixed_price" | "percent" | "nxm";

const NXM_MAX_QTY_BUY = 10;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const store_id = searchParams.get("store_id"); // opcional

    const nowIso = new Date().toISOString();

    let q = supabaseAdmin
      .from("product_offers")
      .select("id,product_id,store_id,type,value,qty_buy,qty_pay,starts_at,ends_at,is_active,created_at")
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(200);

    // Si viene store_id, devolvemos:
    // - ofertas de esa sucursal
    // - y ofertas globales (store_id NULL)
    if (store_id) {
      q = q.or(`store_id.eq.${store_id},store_id.is.null`);
    }

    const { data, error } = await q;
    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ offers: data ?? [] });
  } catch (e: any) {
    return jsonError(e?.message || "Error en GET /api/offers", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden gestionar ofertas");

  try {
    const body = await req.json();

    const product_id = body?.product_id as string | undefined;
    const store_id = (body?.store_id ?? null) as string | null;
    const type = body?.type as OfferType | undefined;
    const starts_at = body?.starts_at as string | undefined;
    const ends_at = body?.ends_at as string | undefined;

    if (!product_id) return jsonError("Falta product_id");
    if (!type || (type !== "fixed_price" && type !== "percent" && type !== "nxm")) {
      return jsonError("Tipo inválido");
    }
    if (!starts_at || !ends_at) return jsonError("Faltan fechas (starts_at / ends_at)");

    const s = new Date(starts_at);
    const e = new Date(ends_at);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return jsonError("Fechas inválidas");
    if (e.getTime() <= s.getTime()) return jsonError("ends_at debe ser mayor que starts_at");

    let value = 0;
    let qty_buy: number | null = null;
    let qty_pay: number | null = null;

    if (type === "nxm") {
      qty_buy = Number(body?.qty_buy);
      qty_pay = Number(body?.qty_pay);
      if (!Number.isInteger(qty_buy) || !Number.isInteger(qty_pay)) {
        return jsonError("qty_buy y qty_pay deben ser números enteros");
      }
      if (qty_pay < 1 || qty_buy <= qty_pay) {
        return jsonError("qty_buy debe ser mayor que qty_pay, y qty_pay al menos 1");
      }
      if (qty_buy > NXM_MAX_QTY_BUY) {
        return jsonError(`qty_buy no puede superar ${NXM_MAX_QTY_BUY}`);
      }

      const { data: prod, error: prodErr } = await supabaseAdmin
        .from("products")
        .select("is_weighted")
        .eq("id", product_id)
        .maybeSingle();
      if (prodErr) return jsonError("Error verificando el producto: " + prodErr.message, 500);
      if (!prod) return jsonError("Producto no encontrado");
      if (prod.is_weighted) {
        return jsonError("Las ofertas NxM no están disponibles para productos pesables");
      }
    } else {
      value = Number(body?.value);
      if (!Number.isFinite(value) || value <= 0) return jsonError("Valor inválido");
    }

    // Regla: máximo 1 oferta activa por producto *por ámbito* (global o por sucursal).
    // Si creás una nueva en el mismo ámbito, desactiva la anterior.
    let deactivateQuery = supabaseAdmin
      .from("product_offers")
      .update({ is_active: false })
      .eq("product_id", product_id)
      .eq("is_active", true);

    if (store_id) {
      deactivateQuery = deactivateQuery.eq("store_id", store_id);
    } else {
      deactivateQuery = deactivateQuery.is("store_id", null);
    }

    const { error: deactErr } = await deactivateQuery;
    if (deactErr) return jsonError("Error desactivando oferta previa: " + deactErr.message, 500);

    const { data, error } = await supabaseAdmin
      .from("product_offers")
      .insert({
        product_id,
        store_id,
        type,
        value,
        qty_buy,
        qty_pay,
        starts_at,
        ends_at,
        is_active: true,
      })
      .select("id,product_id,store_id,type,value,qty_buy,qty_pay,starts_at,ends_at,is_active,created_at")
      .single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ offer: data }, { status: 201 });
  } catch (e: any) {
    return jsonError(e?.message || "Error en POST /api/offers", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden gestionar ofertas");

  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    if (!id) return jsonError("Falta id");

    const { data, error } = await supabaseAdmin
      .from("product_offers")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return jsonError(e?.message || "Error en PATCH /api/offers", 500);
  }
}
