import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

// ✅ Asegurar Node runtime en Vercel (evita Edge/variantes raras)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : "";
}

const SUPABASE_URL = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

// Cliente admin (SERVER ONLY)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type Change = { product_id: string; stock: number };

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan envs del backend (SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const body: any = await req.json().catch(() => ({}));

    // Batch si viene changes como array
    const isBatch = Array.isArray(body?.changes);

    // store_id (snake) o storeId (camel)
    const storeId = String((body?.store_id ?? body?.storeId) ?? "").trim();

    // reason (batch) o _reason (single)
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

    // Cajeros solo pueden operar en su propia sucursal
    if (!isSupervisor(session) && session.store_id !== storeId) {
      return forbidden("No podés ajustar stock de otra sucursal");
    }

    if (!changes.length) {
      return NextResponse.json(
        { ok: false, error: "No hay cambios válidos para guardar." },
        { status: 400 }
      );
    }

    const results: Array<{
      product_id: string;
      changed: boolean;
      before: number;
      requested: number;
      stored: number;
      delta: number;
    }> = [];

    for (const ch of changes) {
      const productId = ch.product_id;
      const newStock = ch.stock;

      // 1) leer stock actual
      const { data: psRow, error: psErr } = await supabaseAdmin
        .from("product_stocks")
        .select("stock")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .maybeSingle();

      if (psErr) {
        console.error("Error leyendo stock actual:", psErr);
        return NextResponse.json(
          { ok: false, error: "Error al procesar la operación" },
          { status: 500 }
        );
      }

      const current = Number(psRow?.stock ?? 0);
      const delta = newStock - current;

      // Si no cambia, igual lo registramos como noop
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

      // 2) upsert stock (IMPORTANTE: no dependemos de devolver row)
      const { error: upErr } = await supabaseAdmin
        .from("product_stocks")
        .upsert(
          { store_id: storeId, product_id: productId, stock: newStock },
          { onConflict: "store_id,product_id" }
        );

      if (upErr) {
        console.error("Error actualizando stock:", upErr);
        return NextResponse.json(
          { ok: false, error: "Error al procesar la operación" },
          { status: 500 }
        );
      }

      // 3) Registrar movimiento (stock_movements exige qty NOT NULL)
      const qty = Math.max(1, Math.round(Math.abs(delta)));

      const { error: insErr } = await supabaseAdmin.from("stock_movements").insert({
        store_id: storeId,
        product_id: productId,

        // ✅ columnas reales
        qty,                 // NOT NULL
        qty_delta: delta,    // numérico (puede ser negativo)
        delta,               // existe pero puede ser null; lo dejamos por compatibilidad

        reason,
        note: null,

        created_at: new Date().toISOString(),
      });

      if (insErr) {
        console.error("Error registrando movimiento de stock:", insErr);
        return NextResponse.json(
          { ok: false, error: "Error al procesar la operación" },
          { status: 500 }
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

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("Error inesperado en /api/stock/adjust:", e);
    return NextResponse.json(
      { ok: false, error: "Error inesperado" },
      { status: 500 }
    );
  }
}
