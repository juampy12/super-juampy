import { PDFParse } from "pdf-parse";
import { getPath } from "pdf-parse/worker";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set worker once at module load time (Node.js uses the bundled worker file)
PDFParse.setWorker(getPath());

type PdfRow = {
  "Cod.Barra": string;
  Detalle: string;
  "Precio/SI": number;
  "Precio/CI": number;
};

function parsePdfRows(text: string): PdfRow[] {
  const rows: PdfRow[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Busca un EAN de 12-13 dígitos
    const eanMatch = trimmed.match(/\b(\d{12,13})\b/);
    if (!eanMatch) continue;

    const sku = eanMatch[1];
    if (seen.has(sku)) continue;

    // Dos precios al final de la línea (exactamente 2 decimales, separador . o ,)
    const priceMatch = trimmed.match(/(\d{1,7}[.,]\d{2})\s+(\d{1,7}[.,]\d{2})\s*$/);
    if (!priceMatch) continue;

    const priceSI = parseFloat(priceMatch[1].replace(",", "."));
    const priceCI = parseFloat(priceMatch[2].replace(",", "."));

    if (!Number.isFinite(priceSI) || priceSI <= 0) continue;
    if (!Number.isFinite(priceCI) || priceCI <= 0) continue;

    // Nombre: entre el EAN y los precios, sin el campo Bulto (ej: X12, X 6)
    const eanEnd = trimmed.indexOf(sku) + sku.length;
    const priceStart = trimmed.lastIndexOf(priceMatch[0]);
    let name = trimmed.substring(eanEnd, priceStart).trim();
    name = name.replace(/\bX\s*\d+\b/gi, "").replace(/\s{2,}/g, " ").trim();

    if (!name) continue;

    seen.add(sku);
    rows.push({ "Cod.Barra": sku, Detalle: name, "Precio/SI": priceSI, "Precio/CI": priceCI });
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores");

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "Falta el archivo PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());

    const parser = new PDFParse({ data: buffer, verbosity: 0 });
    const result = await parser.getText({ lineEnforce: true, cellSeparator: " " });
    await parser.destroy();

    const rows = parsePdfRows(result.text);

    return NextResponse.json({ ok: true, rows, totalPages: result.total });
  } catch (e: any) {
    console.error("Error en parse-pdf:", e);
    return NextResponse.json({ ok: false, error: "Error procesando el PDF" }, { status: 500 });
  }
}
