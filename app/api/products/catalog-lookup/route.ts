import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";
import { normalizeSku } from "@/lib/sku";

// GET /api/products/catalog-lookup?code=…
// Solo lectura. Lo usa el alta de /catalogo al escanear un código:
//   { ok: true, status: "exists",  product: { id, sku, plu, name, price, active } }
//   { ok: true, status: "catalog", catalog: { ean, nombre, marca, cantidad, unidad } }
//   { ok: true, status: "none" }
// product_catalog es un diccionario de referencia (SEPA), sin relación con
// products: acá solo se consulta, nunca se escribe.

const PRODUCT_COLS = "id, sku, plu, name, price, active";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!code || code.length > 64) {
    return NextResponse.json({ ok: true, status: "none" });
  }

  const isNumeric = /^\d+$/.test(code);

  // 1) ¿Ya existe en products? (activo o desactivado)
  const { data: bySku, error: e1 } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_COLS)
    .eq("sku", code)
    .limit(1);

  if (e1) {
    console.error("products/catalog-lookup sku exact error:", e1);
    return NextResponse.json({ ok: false, error: "Error al buscar el código" }, { status: 500 });
  }

  let product = bySku?.[0] ?? null;

  // Mismo código con distinto padding de ceros a la izquierda (ej: el lector
  // manda 12 dígitos y el producto está cargado con 13, o al revés).
  if (!product && isNumeric) {
    const normCode = normalizeSku(code);
    const { data: candidates, error: e2 } = await supabaseAdmin
      .from("products")
      .select(PRODUCT_COLS)
      .ilike("sku", `%${normCode}`)
      .limit(50);

    if (e2) {
      console.error("products/catalog-lookup sku normalized error:", e2);
      return NextResponse.json({ ok: false, error: "Error al buscar el código" }, { status: 500 });
    }

    const matches = (candidates ?? []).filter((p) => normalizeSku(p.sku) === normCode);
    product = matches.find((p) => p.active) ?? matches[0] ?? null;
  }

  if (product) {
    return NextResponse.json({ ok: true, status: "exists", product });
  }

  // 2) ¿Está en el catálogo de referencia? Los EAN ahí son siempre de 13
  // dígitos; un UPC de 12 (o un EAN-8) llega del lector sin los ceros de
  // adelante, así que también se prueba completado a 13. No se completan
  // códigos más cortos: son códigos internos, no de barras.
  if (!isNumeric || code.length < 8 || code.length > 13) {
    return NextResponse.json({ ok: true, status: "none" });
  }

  const { data: catalogRows, error: e3 } = await supabaseAdmin
    .from("product_catalog")
    .select("ean, nombre, marca, cantidad, unidad")
    .eq("ean", code.padStart(13, "0"))
    .limit(1);

  if (e3) {
    // El catálogo es solo una ayuda: si falla, el alta sigue manual.
    console.error("products/catalog-lookup product_catalog error:", e3);
    return NextResponse.json({ ok: true, status: "none" });
  }

  const catalog = catalogRows?.[0] ?? null;
  if (!catalog) {
    return NextResponse.json({ ok: true, status: "none" });
  }

  return NextResponse.json({ ok: true, status: "catalog", catalog });
}
