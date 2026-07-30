import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Renombrar y/o activar/desactivar un proveedor. No toca products —
// desactivar un proveedor no le quita el supplier_id a sus productos,
// solo lo saca de los dropdowns de asignación.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden editar proveedores");

    const { id } = await params;
    const body = await req.json();

    const patch: { name?: string; active?: boolean } = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ ok: false, error: "El nombre no puede estar vacío" }, { status: 400 });
      }
      patch.name = name;
    }
    if (typeof body?.active === "boolean") {
      patch.active = body.active;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para actualizar" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .update(patch)
      .eq("id", id)
      .select("id, name, active")
      .single();

    if (error) {
      // 23505 = unique_violation (name)
      const isDuplicate = (error as { code?: string }).code === "23505";
      console.error("Error actualizando supplier:", error);
      return NextResponse.json(
        { ok: false, error: isDuplicate ? "Ya existe un proveedor con ese nombre" : "Error actualizando proveedor" },
        { status: isDuplicate ? 409 : 500 }
      );
    }

    return NextResponse.json({ ok: true, supplier: data });
  } catch (e: any) {
    console.error("Error en PATCH /api/suppliers/[id]:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
