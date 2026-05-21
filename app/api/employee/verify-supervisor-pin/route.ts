import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const pin = String(body.pin ?? "").trim();

    if (!pin) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const serverPin = process.env.SUPERVISOR_PIN ?? process.env.NEXT_PUBLIC_SUPERJUAMPY_SUPERVISOR_PIN ?? "";

    if (!serverPin) {
      return NextResponse.json({ error: "PIN no configurado" }, { status: 500 });
    }

    const valid = pin === serverPin;
    return NextResponse.json({ ok: valid });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
