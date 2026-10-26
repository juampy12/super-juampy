import jsPDF from "jspdf";

const LOGO_PATH = "/logo-super-juampy-header.png";
const LOGO_ASPECT = 360 / 240; // logo-super-juampy-header.png

async function loadLogoDataURL(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_PATH);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type LabelProduct = {
  sku: string;
  name: string;
  price: number;
  effective_price: number;
  has_offer: boolean;
  offer_type: string | null;
  offer_value: number | null;
  qty_buy?: number | null;
  qty_pay?: number | null;
  is_weighted?: boolean | null;
};

const PAGE_W = 210;
const PAGE_H = 297;
const LABEL_W = 46;
const LABEL_H = 36;
const COLS = 4;
const ROWS = 8;
const PER_PAGE = COLS * ROWS;
const MARGIN_X = (PAGE_W - COLS * LABEL_W) / 2;
const MARGIN_Y = (PAGE_H - ROWS * LABEL_H) / 2;
const PAD = 2.5; // margen interno del contenido

export type LabelOptions = {
  // Imprime un recuadro vacío en lugar del precio, para escribirlo a mano.
  // Solo cambia el dibujo — no toca ningún dato del producto.
  blankPrice?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fitFontSize(doc: jsPDF, text: string, maxWidth: number, maxSize: number, minSize: number, style: "bold" | "normal" = "bold") {
  doc.setFont("helvetica", style);
  let size = maxSize;
  while (size > minSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) break;
    size -= 0.5;
  }
  doc.setFontSize(size);
  return size;
}

// Corte de líneas palabra por palabra con el ancho real del texto.
// splitTextToSize de jsPDF corta de más con algunos caracteres (ej. 12").
function wrapWords(doc: jsPDF, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (doc.getTextWidth(word) <= maxWidth) {
      current = word;
    } else {
      // Palabra más ancha que la etiqueta: se parte a la fuerza
      const parts: string[] = doc.splitTextToSize(word, maxWidth);
      lines.push(...parts.slice(0, -1));
      current = parts[parts.length - 1] ?? "";
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

function fitTextLines(doc: jsPDF, text: string, maxWidth: number, maxSize: number, minSize: number, maxLines: number, style: "bold" | "normal" = "bold") {
  doc.setFont("helvetica", style);
  let size = maxSize;
  let lines: string[] = [text];
  while (size >= minSize) {
    doc.setFontSize(size);
    lines = wrapWords(doc, text, maxWidth);
    if (lines.length <= maxLines) break;
    size -= 0.5;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && doc.getTextWidth(last + "…") > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + "…";
  }
  doc.setFontSize(size);
  return { size, lines };
}

// Colores de marca
const RED: [number, number, number] = [204, 32, 32]; // #CC2020
const BLUE: [number, number, number] = [26, 95, 168]; // #1A5FA8
const LIME: [number, number, number] = [168, 198, 42]; // #A8C62A

// Franjas de la etiqueta, en mm desde su borde superior. Sin rellenos
// grandes (se imprimen muchas seguidas): el color va en texto y líneas.
const INSET = 0.8; // borde azul, hacia adentro del corte
const NAME_TOP = INSET;
const NAME_BOTTOM = 11.8;
const DIVIDER_H = 0.6;
const PRICE_TOP = NAME_BOTTOM + DIVIDER_H;
const PRICE_BOTTOM = 29.6;
const FOOTER_LINE = 29.8;
const FOOTER_BOTTOM = LABEL_H - INSET;
const BLANK_BOX_H = 9.5;

// Alto de mayúsculas/números de Helvetica, en mm, para un tamaño en pt
function capH(size: number) {
  return size * 0.254;
}

function drawLabel(doc: jsPDF, x: number, y: number, product: LabelProduct, logo: string | null, opts: LabelOptions) {
  const contentW = LABEL_W - PAD * 2;
  const left = x + PAD;
  const right = x + LABEL_W - PAD;
  const centerX = x + LABEL_W / 2;

  // Cut guide (dashed border)
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(x, y, LABEL_W, LABEL_H);
  doc.setLineDashPattern([], 0);

  // Borde de marca, redondeado y dentro de los 46×36mm
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(x + INSET, y + INSET, LABEL_W - INSET * 2, LABEL_H - INSET * 2, 1.5, 1.5);

  const qtyPromo = product.qty_buy && (product.offer_type === "nxm" ? product.qty_pay : product.offer_type === "second_unit_pct" ? product.offer_value : null);
  const hasQtyPromo = !!qtyPromo;
  const hasPriceOffer = !opts.blankPrice && product.has_offer && !hasQtyPromo && product.effective_price < product.price;

  // Nombre en negro, hasta 2 líneas, centrado vertical en su franja
  doc.setTextColor(17, 17, 17);
  const { size: nameSize, lines: nameLines } = fitTextLines(doc, product.name, contentW, 10, 6.5, 2, "bold");
  const nameLineH = nameSize * 0.4;
  const nameBlockH = (nameLines.length - 1) * nameLineH + capH(nameSize);
  const nameFirstBaseline = y + (NAME_TOP + NAME_BOTTOM) / 2 - nameBlockH / 2 + capH(nameSize);
  nameLines.forEach((line, i) => {
    doc.text(line, centerX, nameFirstBaseline + i * nameLineH, { align: "center" });
  });

  // Divisor verde lima entre nombre y precio
  doc.setFillColor(...LIME);
  doc.rect(left, y + NAME_BOTTOM, contentW, DIVIDER_H, "F");

  // Zona de precio. La pastilla 2X1 / 2DA AL N% va arriba y empuja el resto.
  let zoneTop = y + PRICE_TOP;
  const zoneBottom = y + PRICE_BOTTOM;

  if (hasQtyPromo) {
    const badgeText = product.offer_type === "nxm"
      ? `${product.qty_buy}X${product.qty_pay}`
      : `2DA AL ${product.offer_value}%`;
    const pillTop = zoneTop + 1.1;
    const pillH = 3.2;
    fitFontSize(doc, badgeText, contentW - 3, 7, 5, "bold");
    const pillW = doc.getTextWidth(badgeText) + 3;
    doc.setFillColor(...LIME);
    doc.roundedRect(centerX - pillW / 2, pillTop, pillW, pillH, 1.2, 1.2, "F");
    doc.setTextColor(17, 17, 17);
    doc.text(badgeText, centerX, pillTop + pillH / 2 + capH(doc.getFontSize()) / 2, { align: "center" });
    zoneTop = pillTop + pillH + 0.3;
  }
  const zoneCenter = (zoneTop + zoneBottom) / 2;

  if (opts.blankPrice) {
    // Recuadro para escribir el precio a mano, centrado en la zona de precio
    const boxTop = zoneCenter - BLANK_BOX_H / 2;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.25);
    doc.roundedRect(left, boxTop, contentW, BLANK_BOX_H, 1, 1);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("$", left + 1.2, boxTop + BLANK_BOX_H / 2 + capH(14) / 2);
  } else if (hasPriceOffer) {
    const oldText = `$${fmt(product.price)}`;
    const newText = `$${fmt(product.effective_price)}`;
    const oldSize = fitFontSize(doc, oldText, contentW, 7, 5, "normal");
    const oldW = doc.getTextWidth(oldText);
    const newSize = fitFontSize(doc, newText, contentW, 22, 13, "bold");
    const gap = 1.8;
    const blockTop = zoneCenter - (capH(oldSize) + gap + capH(newSize)) / 2;
    const oldBaseline = blockTop + capH(oldSize);

    doc.setTextColor(110, 110, 110);
    fitFontSize(doc, oldText, contentW, 7, 5, "normal");
    doc.text(oldText, centerX, oldBaseline, { align: "center" });
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.line(centerX - oldW / 2, oldBaseline - capH(oldSize) * 0.45, centerX + oldW / 2, oldBaseline - capH(oldSize) * 0.45);

    doc.setTextColor(...RED);
    fitFontSize(doc, newText, contentW, 22, 13, "bold");
    doc.text(newText, centerX, oldBaseline + gap + capH(newSize), { align: "center" });
  } else {
    doc.setTextColor(17, 17, 17);
    const priceText = `$${fmt(product.price)}`;
    const size = fitFontSize(doc, priceText, contentW, 22, 13, "bold");
    doc.text(priceText, centerX, zoneCenter + capH(size) / 2, { align: "center" });
  }

  // Pie: línea gris finita, logo + SKU a la izquierda, $/kg a la derecha
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.15);
  doc.line(left, y + FOOTER_LINE, right, y + FOOTER_LINE);

  const footerCenter = y + (FOOTER_LINE + FOOTER_BOTTOM) / 2;
  const footerY = footerCenter + capH(7) / 2;
  let skuX = left;

  if (logo) {
    const logoH = 3.3;
    const logoW = logoH * LOGO_ASPECT;
    doc.addImage(logo, "PNG", left, footerCenter - logoH / 2, logoW, logoH);
    skuX = left + logoW + 1;
  }

  // $/kg primero: el SKU usa el ancho que queda libre, así no se pisan
  let skuMaxW = right - skuX;
  doc.setTextColor(136, 136, 136);
  if (product.is_weighted) {
    const kgText = opts.blankPrice ? "precio x kg" : `$${fmt(product.price)}/kg`;
    fitFontSize(doc, kgText, contentW * 0.4, 5.5, 4, "normal");
    doc.text(kgText, right, footerY, { align: "right" });
    skuMaxW -= doc.getTextWidth(kgText) + 1;
  }

  // SKU grande y oscuro: los empleados lo leen para no confundir etiquetas
  doc.setTextColor(68, 68, 68);
  fitFontSize(doc, `SKU ${product.sku}`, skuMaxW, 7, 4.5, "bold");
  doc.text(`SKU ${product.sku}`, skuX, footerY, { align: "left" });
  doc.setTextColor(0, 0, 0);
}

export async function generateLabelsPDF(products: LabelProduct[], opts: LabelOptions = {}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await loadLogoDataURL();

  products.forEach((product, i) => {
    const posInPage = i % PER_PAGE;
    if (i > 0 && posInPage === 0) doc.addPage();
    const row = Math.floor(posInPage / COLS);
    const col = posInPage % COLS;
    const x = MARGIN_X + col * LABEL_W;
    const y = MARGIN_Y + row * LABEL_H;
    drawLabel(doc, x, y, product, logo, opts);
  });

  return doc;
}

export async function exportLabelsPDF(products: LabelProduct[], filename = "etiquetas.pdf", opts: LabelOptions = {}) {
  const doc = await generateLabelsPDF(products, opts);
  doc.save(filename);
}
