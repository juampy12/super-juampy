import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const query: string | null = body.query ?? null;
  const limit: number = Math.min(Number(body.limit ?? 200), 10000);
  const all: boolean = Boolean(body.all);

  // Cajero solo puede consultar su propia sucursal
  let store_id: string = body.store_id ?? "";
  if (!isSupervisor(session)) {
    if (!session.store_id) return forbidden("Sin sucursal asignada");
    if (store_id && store_id !== session.store_id)
      return forbidden("Sin acceso a esa sucursal");
    store_id = session.store_id;
  }

  if (!store_id) {
    return NextResponse.json({ error: "Falta store_id" }, { status: 400 });
  }

  if (all) {
    // PostgREST corta cualquier respuesta (incluidas RPC) en 1000 filas
    // por defecto — hay que paginar con .range() para traer TODO el
    // catálogo, igual que fetchAllRows en marketing/suggestions y ai/alerts.
    const PAGE_SIZE = 1000;
    const allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .rpc("products_with_stock", {
          p_store: store_id,
          p_query: query || null,
          p_limit: offset + PAGE_SIZE,
        })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("products/search RPC error:", error);
        return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
      }
      allRows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return NextResponse.json(allRows);
  }

  const { data, error } = await supabaseAdmin.rpc("products_with_stock", {
    p_store: store_id,
    p_query: query || null,
    p_limit: limit,
  });

  if (error) {
    console.error("products/search RPC error:", error);
    return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
