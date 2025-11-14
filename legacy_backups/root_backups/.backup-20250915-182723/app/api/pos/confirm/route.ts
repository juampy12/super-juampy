import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Evita que Next intente optimizar/prerender esta API en build
export const dynamic = "force-dynamic";

type Body = {
  saleId?: string;
  productId?: string;
  qty?: number;
};

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch { /* body vacío si no viene JSON */ }

  const { saleId, productId, qty } = body;

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase envs", { hasUrl: !!url, hasKey: !!key });
    return NextResponse.json({ error: "Missing Supabase envs" }, { status: 500 });
  }

  if (!saleId || !productId || !qty) {
    return NextResponse.json({ error: "saleId, productId y qty son requeridos" }, { status: 400 });
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("sale_items")
    .insert({ sale_id: saleId, product_id: productId, qty })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, item: data });
}
