import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function yyyymmdd(d: Date) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

async function generateOwnSku() {
  // Formato: JP-YYYYMMDD-XXXX
  const base = `JP-${yyyymmdd(new Date())}-`;

  for (let i = 0; i < 8; i++) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const sku = base + suffix;

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("sku", sku)
      .limit(1);

    if (error) {
      // Si falla el check, igualmente probamos otro
      continue;
    }
    if (!data || data.length === 0) return sku;
  }

  // fallback (casi imposible llegar acá)
  return base + String(Date.now()).slice(-4);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Falta name" }, { status: 400 });
    }

const is_own = Boolean(body?.is_own ?? body?.is_own_product ?? false);

    let sku = body?.sku != null ? String(body.sku).trim() : "";
    if (!is_own && !sku) {
      return NextResponse.json(
        { ok: false, error: "Falta sku (para productos no propios)" },
        { status: 400 }
      );
    }

    if (is_own && !sku) {
      sku = await generateOwnSku();
    }

    const is_weighted = Boolean(body?.is_weighted ?? false);

const cost_net = Number(body?.cost_net ?? 0);
const vat_rate = Number(body?.vat_rate ?? 21);
const markup_rate = Number(body?.markup_rate ?? 0);
const units_per_case = Math.max(1, Number(body?.units_per_case ?? 1));

// ✅ Soporte precio final manual
const use_final_price = Boolean(body?.use_final_price ?? body?.use_final ?? false);
const manual_final = body?.final_price != null ? Number(body.final_price) : NaN;

// Precio final = manual (si corresponde) o cálculo por costo
let finalPrice: number;

if (use_final_price) {
  if (!Number.isFinite(manual_final) || manual_final <= 0) {
    return NextResponse.json(
      { ok: false, error: "Precio final manual inválido" },
      { status: 400 }
    );
  }
  finalPrice = Math.round(manual_final * 100) / 100;
} else {
  // Evita crear productos con precio 0 por error
  if (!Number.isFinite(cost_net) || cost_net <= 0) {
    return NextResponse.json(
      { ok: false, error: "Costo neto inválido (o 0). Cargá costo o marcá precio final manual." },
      { status: 400 }
    );
  }

  // Precio final = costo * (1 + IVA%) * (1 + margen%)
  const withVat = cost_net * (1 + vat_rate / 100);
  finalPrice = Math.round(withVat * (1 + markup_rate / 100) * 100) / 100;
}

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        sku,
        name,
        price: finalPrice,
        cost_net,
        vat_rate,
        markup_rate,
        units_per_case,
        is_weighted,
        active: true,
      })
      .select("id,sku,name,price")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
