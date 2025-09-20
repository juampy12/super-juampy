import { NextResponse } from "next/server";
import { posConfirmarVenta } from "@/lib/posConfirm"; // tu lógica server-side

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Si tu función espera otro shape, adaptalo aquí:
    const result = await posConfirmarVenta?.(body);

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error al confirmar venta" },
      { status: 400 }
    );
  }
}
