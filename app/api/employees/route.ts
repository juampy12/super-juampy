import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    if (isSupervisor(session)) {
      // Supervisores ven todos los empleados con datos de sucursal y caja
      const [empRes, storeRes, regRes] = await Promise.all([
        supabaseAdmin.from("employees").select("id, code, name, role, store_id, register_id, is_active").order("name", { ascending: true }),
        supabaseAdmin.from("stores").select("id, name"),
        supabaseAdmin.from("registers").select("id, name"),
      ]);

      if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

      const storeMap: Record<string, string> = {};
      (storeRes.data ?? []).forEach((s: any) => { storeMap[s.id] = s.name; });

      const regMap: Record<string, string> = {};
      (regRes.data ?? []).forEach((r: any) => { regMap[r.id] = r.name; });

      const employees = (empRes.data ?? []).map((e: any) => ({
        ...e,
        active: e.is_active,
        stores: e.store_id ? { name: storeMap[e.store_id] ?? "—" } : null,
        registers: e.register_id ? { name: regMap[e.register_id] ?? "—" } : null,
      }));

      return NextResponse.json({ employees });
    }

    // Cajeros solo ven su propio perfil
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, code, name, role, store_id, register_id, is_active")
      .eq("id", session.employee_id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ employees: data ? [{ ...data, active: data.is_active }] : [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden crear empleados");

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const code = String(body?.code ?? "").trim();
    const pin = String(body?.pin ?? "").trim();
    const role = String(body?.role ?? "cashier").trim();
    const store_id = body?.store_id ?? null;
    const register_id = body?.register_id ?? null;

    if (!name) return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    if (!code) return NextResponse.json({ error: "Falta código" }, { status: 400 });
    if (!pin || pin.length < 4) return NextResponse.json({ error: "PIN debe tener al menos 4 dígitos" }, { status: 400 });

    // Verificar que el código no exista
    const { data: existing } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: "El código ya existe" }, { status: 409 });

    // Insertar con PIN hasheado via RPC
    const { data, error } = await supabaseAdmin.rpc("create_employee_with_pin", {
      p_name: name,
      p_code: code,
      p_pin: pin,
      p_role: role,
      p_store_id: store_id,
      p_register_id: register_id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, employee: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar empleados");

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (body?.name !== undefined) updates.name = String(body.name).trim();
    if (body?.role !== undefined) updates.role = String(body.role).trim();
    if (body?.store_id !== undefined) updates.store_id = body.store_id;
    if (body?.register_id !== undefined) updates.register_id = body.register_id;
    if (body?.active !== undefined) updates.is_active = Boolean(body.active);

    // Si viene nuevo PIN, actualizarlo via RPC
    if (body?.pin) {
      const pin = String(body.pin).trim();
      if (pin.length < 4) return NextResponse.json({ error: "PIN debe tener al menos 4 dígitos" }, { status: 400 });
      const { error } = await supabaseAdmin.rpc("update_employee_pin", {
        p_id: id,
        p_pin: pin,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin
        .from("employees")
        .update(updates)
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
