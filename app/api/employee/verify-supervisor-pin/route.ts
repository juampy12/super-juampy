import { NextRequest, NextResponse } from "next/server";
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
        { ok: false, error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pin = String(body.pin ?? "").trim();

    if (!pin) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const serverPin = process.env.SUPERVISOR_PIN ?? "";

    if (!serverPin) {
      return NextResponse.json({ error: "PIN no configurado" }, { status: 500 });
    }

    const valid = pin === serverPin;

    if (!valid) {
      const { blocked } = recordFailure(ip);
      if (blocked) {
        return NextResponse.json(
          { ok: false, error: "Demasiados intentos fallidos. Intentá en 15 minutos." },
          { status: 429 }
        );
      }
    } else {
      resetFailures(ip);
    }

    return NextResponse.json({ ok: valid });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
