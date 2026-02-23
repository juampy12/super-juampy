import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Asegurar Node runtime en Vercel (evita edge/variantes raras)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : "";
}

const SUPABASE_URL =
  getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

// Creamos cliente admin (server-only)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan envs del backend (SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).",
        },
        { status: 500 }
      );
    }

    const body: any = await req.json();

    // Batch si viene changes como array
    const isBatch = Array.isArray(body?.changes);

    // store_id (snake) o storeId (camel)
    const storeId = String((body?.store_id ?? body?.storeId) ?? "").trim();

    // reason (batch) o _reason (single)
    const reason = String((body?.reason ?? body?._reason) ?? "adjust").trim();

    // Normalizar cambios:
    // - Batch esperado: { product_id, stock }
    // - Aceptamos también: { productId, newStock }
    const changes: Array<{ product_id: string; stock: number }> = isBatch
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

      // 1) Leer stock actual
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

      // 2) Upsert stock (IMPORTANTE: NO usamos .select() acá)
      // En prod nos estaba dando “guardado” pero después aparecía 0.
      // Con esto, lo único que importa es que NO haya error.
      const { error: upErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          { store_id: storeId, product_id: productId, stock: newStock },
          { onConflict: "store_id,product_id" }
        );

      if (upErr) {
        return NextResponse.json(
          { ok: false, error: upErr.message, product_id: productId },
          { status: 400 }
        );
      }

      // 3) Registrar movimiento
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
        stored: newStock,
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
