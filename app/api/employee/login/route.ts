import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signSession } from "@/lib/jwt";
import { isBlocked, recordFailure, resetFailures } from "@/lib/rateLimiter";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);

    if (isBlocked(ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
        { status: 429 }
      );
    }

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
      const { blocked } = recordFailure(ip);
      if (blocked) {
        return NextResponse.json(
          { error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "Código o PIN incorrecto" }, { status: 401 });
    }

    resetFailures(ip);

    const token = await signSession({
      employee_id: emp.employee_id,
      role: emp.role,
      store_id: emp.store_id ?? null,
    });

    const response = NextResponse.json({
      employee: {
        id: emp.employee_id,
        name: emp.name,
        role: emp.role,
        store_id: emp.store_id ?? null,
        register_id: emp.register_id ?? null,
      },
    });

    response.cookies.set("sj_pos_auth", token, {
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
