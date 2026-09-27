import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden generar contenido de marketing");

    const body = await req.json().catch(() => ({}));
    const productName = String(body.product_name ?? "").trim();
    const price = Number(body.price ?? 0);
    const offerText = String(body.offer_text ?? "").trim();

    if (!productName) {
      return NextResponse.json({ error: "Falta product_name" }, { status: 400 });
    }

    const offerLine = offerText ? `Oferta especial: ${offerText}\n` : "";

    const prompt = `Sos un especialista en marketing digital para supermercados argentinos. Generá posts para redes sociales para el siguiente producto:

Producto: ${productName}
Precio: $${price.toLocaleString("es-AR")}
${offerLine}Negocio: Super Juampy — Charata, Chaco

Creá dos versiones:

1. INSTAGRAM: Texto con emojis, hashtags relevantes al supermercado/producto, llamada a acción. Máximo 220 palabras. Usá saltos de línea para que se vea bien en el feed.

2. FACEBOOK: Texto más descriptivo y amigable, sin hashtags, más conversacional. Máximo 180 palabras.

Ambos deben mencionar:
- El nombre del producto
- El precio
- "Super Juampy — Charata, Chaco"
- Una llamada a acción (visitá, no te lo pierdas, etc.)`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      // Salida estructurada: la API garantiza un JSON válido con estos dos campos.
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              instagram: { type: "string" },
              facebook: { type: "string" },
            },
            required: ["instagram", "facebook"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: prompt }],
    });

    // El formato está garantizado solo si terminó normalmente (un corte por
    // max_tokens o un rechazo pueden dejar el JSON incompleto).
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (message.stop_reason !== "end_turn" || !textBlock) {
      console.error("Respuesta de la IA incompleta:", message.stop_reason);
      return NextResponse.json({ error: "Respuesta inesperada de la IA" }, { status: 500 });
    }

    const parsed = JSON.parse(textBlock.text);
    if (!parsed.instagram || !parsed.facebook) {
      return NextResponse.json({ error: "La IA no generó los textos esperados" }, { status: 500 });
    }

    return NextResponse.json({ instagram: parsed.instagram, facebook: parsed.facebook });
  } catch (e: any) {
    console.error("Error en /api/marketing/generate-text:", e);
    return NextResponse.json({ error: "Error al generar el texto" }, { status: 500 });
  }
}
