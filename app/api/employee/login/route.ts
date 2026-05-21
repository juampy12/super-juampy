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

    const emp = Array.isArray(data) ? data[0] : null;

    if (!emp?.employee_id) {
      return NextResponse.json({ error: "Código o PIN incorrecto" }, { status: 401 });
    }

    const response = NextResponse.json({
      employee: {
        id: emp.employee_id,
        name: emp.name,
        role: emp.role,
        store_id: emp.store_id ?? null,
      },
    });

    // Cookie HttpOnly — no accesible desde JS del cliente
    response.cookies.set("sj_pos_auth", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 12, // 12 horas
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
