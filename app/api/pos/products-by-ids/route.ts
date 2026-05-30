import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body?.ids ?? [];
    if (!ids.length) return NextResponse.json({ products: [] });

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, active")
      .in("id", ids.slice(0, 100));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
