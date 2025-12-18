import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const pin = String(body.pin ?? "").trim();

    if (!code || !pin) {
      return NextResponse.json({ error: "Falta code o pin" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("verify_employee_pin", {
      p_code: code,
      p_pin: pin,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // verify_employee_pin devuelve array (0 o 1 filas)
    const emp = Array.isArray(data) ? data[0] : null;

    if (!emp?.employee_id) {
      return NextResponse.json({ error: "Código o PIN incorrecto" }, { status: 401 });
    }

    return NextResponse.json({
      employee: {
        id: emp.employee_id,
        name: emp.name,
        role: emp.role,
        store_id: emp.store_id ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
