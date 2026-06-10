import { PDFParse } from "pdf-parse";
import { getPath } from "pdf-parse/worker";
import { NextResponse } from "next/server";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

PDFParse.setWorker(getPath());

type PdfRow = {
  "Cod.Barra": string;
  Detalle: string;
  "Precio/SI": number;
  "Precio/CI": number;
};

type ParseStats = {
  totalLines: number;
  linesWithEan: number;
  linesWithPrices: number;
  skippedNoPrice: number;
  skippedNoName: number;
  skippedDupe: number;
  totalFound: number;
};

// Detecta el formato según cuál separador aparece al final antes de los 2 decimales:
//   US  (punto decimal, coma miles):  2,290.00  → 2290.00
//   ARG (coma decimal, punto miles):  2.290,00  → 2290.00
function parsePrecio(s: string): number {
  const c = s.trim();
  if (/\.\d{2}$/.test(c)) {
    // Último separador es punto → decimal = punto, miles = coma
    return parseFloat(c.replace(/,/g, ""));
  }
  if (/,\d{2}$/.test(c)) {
    // Último separador es coma → decimal = coma, miles = punto
    return parseFloat(c.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(c);
}

// Acepta:
//   formato argentino:  1.234,56  o  234,56
//   formato simple:     1234.56   o  1234,56
//   con o sin miles:    1.234.567,89
const PRICE_PAT =
  /\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+[.,]\d{2}/;

const TWO_PRICES_RE = new RegExp(
  `(${PRICE_PAT.source})\\s+(${PRICE_PAT.source})\\s*$`
);

function parsePdfRows(text: string): { rows: PdfRow[]; stats: ParseStats } {
  const rows: PdfRow[] = [];
  const seen = new Set<string>();
  const stats: ParseStats = {
    totalLines: 0,
    linesWithEan: 0,
    linesWithPrices: 0,
    skippedNoPrice: 0,
    skippedNoName: 0,
    skippedDupe: 0,
    totalFound: 0,
  };

  const lines = text.split("\n");
  stats.totalLines = lines.length;

  for (const line of lines) {
    // Normalizar: tabs → espacio, colapsar espacios múltiples
    const trimmed = line.replace(/\t/g, " ").replace(/  +/g, " ").trim();
    if (!trimmed) continue;

    // Buscar EAN de 12-13 dígitos
    const eanMatch = trimmed.match(/\b(\d{12,13})\b/);
    if (!eanMatch) continue;
    stats.linesWithEan++;

    const sku = eanMatch[1];
    if (seen.has(sku)) {
      stats.skippedDupe++;
      continue;
    }

    // Buscar dos precios al final de la línea
    const priceMatch = trimmed.match(TWO_PRICES_RE);
    if (!priceMatch) {
      stats.skippedNoPrice++;
      continue;
    }

    const priceSI = parsePrecio(priceMatch[1]);
    const priceCI = parsePrecio(priceMatch[2]);

    if (!Number.isFinite(priceSI) || priceSI <= 0) {
      stats.skippedNoPrice++;
      continue;
    }
    if (!Number.isFinite(priceCI) || priceCI <= 0) {
      stats.skippedNoPrice++;
      continue;
    }

    stats.linesWithPrices++;

    // Nombre: entre el final del EAN y el inicio de los precios
    const eanEnd = trimmed.indexOf(sku) + sku.length;
    const priceStart = trimmed.lastIndexOf(priceMatch[0]);
    let name = trimmed.substring(eanEnd, priceStart).trim();

    // Eliminar campo Bulto en distintos formatos:
    //   X12 · X 6 · 12 UN · 6 U · 12 UNID · 12 BULTOS
    name = name
      .replace(/\bX\s*\d+\b/gi, "")
      .replace(/\b\d+\s*(?:un|u|unid|uds|bultos?|pcs?)\b/gi, "")
      .replace(/  +/g, " ")
      .trim();

    if (!name) {
      stats.skippedNoName++;
      continue;
    }

    seen.add(sku);
    rows.push({
      "Cod.Barra": sku,
      Detalle: name,
      "Precio/SI": priceSI,
      "Precio/CI": priceCI,
    });
  }

  stats.totalFound = rows.length;
  return { rows, stats };
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
    const result = await parser.getText({
      lineEnforce: true,
      cellSeparator: " ",
      // Separador de página simple para no contaminar líneas con números de página
      pageJoiner: "\n",
    });
    await parser.destroy();

    const { rows, stats } = parsePdfRows(result.text);

    console.log(
      `[parse-pdf] páginas=${result.total} ` +
      `líneas=${stats.totalLines} conEAN=${stats.linesWithEan} ` +
      `conPrecios=${stats.linesWithPrices} sinPrecio=${stats.skippedNoPrice} ` +
      `sinNombre=${stats.skippedNoName} dupes=${stats.skippedDupe} ` +
      `resultado=${rows.length}`
    );

    return NextResponse.json({
      ok: true,
      rows,
      totalPages: result.total,
      parseStats: stats,
    });
  } catch (e: any) {
    console.error("Error en parse-pdf:", e);
    return NextResponse.json({ ok: false, error: "Error procesando el PDF" }, { status: 500 });
  }
}
