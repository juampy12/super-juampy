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
const LABEL_W = 50;
const LABEL_H = 40;
const COLS = 4;
const ROWS = 7;
const PER_PAGE = COLS * ROWS;
const MARGIN_X = (PAGE_W - COLS * LABEL_W) / 2;
const MARGIN_Y = (PAGE_H - ROWS * LABEL_H) / 2;
const PAD = 2.5;

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

function fitTextLines(doc: jsPDF, text: string, maxWidth: number, maxSize: number, minSize: number, maxLines: number, style: "bold" | "normal" = "bold") {
  doc.setFont("helvetica", style);
  let size = maxSize;
  let lines: string[] = [text];
  while (size >= minSize) {
    doc.setFontSize(size);
    lines = doc.splitTextToSize(text, maxWidth);
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

function drawLabel(doc: jsPDF, x: number, y: number, product: LabelProduct, logo: string | null) {
  const contentW = LABEL_W - PAD * 2;
  const centerX = x + LABEL_W / 2;

  // Cut guide (dashed border)
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(x, y, LABEL_W, LABEL_H);
  doc.setLineDashPattern([], 0);

  const qtyPromo = product.qty_buy && (product.offer_type === "nxm" ? product.qty_pay : product.offer_type === "second_unit_pct" ? product.offer_value : null);
  const hasQtyPromo = !!qtyPromo;
  const hasPriceOffer = product.has_offer && !hasQtyPromo && product.effective_price < product.price;

  let nameTop = y + PAD + 1.5;

  if (hasQtyPromo) {
    const badgeH = 5;
    doc.setFillColor(20, 20, 20);
    doc.rect(x, y, LABEL_W, badgeH, "F");
    const badgeText = product.offer_type === "nxm"
      ? `${product.qty_buy}X${product.qty_pay}`
      : `2DA AL ${product.offer_value}%`;
    doc.setTextColor(255, 255, 255);
    fitFontSize(doc, badgeText, contentW, 9, 6, "bold");
    doc.text(badgeText, centerX, y + badgeH - 1.6, { align: "center" });
    doc.setTextColor(0, 0, 0);
    nameTop = y + badgeH + 3;
  }

  // Product name (up to 2 lines, shrink-to-fit)
  doc.setTextColor(17, 17, 17);
  const { size: nameSize, lines: nameLines } = fitTextLines(doc, product.name, contentW, 10.5, 7, 2, "bold");
  const nameLineH = nameSize * 0.42;
  nameLines.forEach((line, i) => {
    doc.text(line, centerX, nameTop + nameSize * 0.32 + i * nameLineH, { align: "center" });
  });

  // Price block, anchored to a fixed baseline regardless of name length
  const priceBaseline = y + LABEL_H - 11;

  if (hasPriceOffer) {
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    const oldText = `$${fmt(product.price)}`;
    fitFontSize(doc, oldText, contentW, 9, 6, "normal");
    doc.text(oldText, centerX, priceBaseline - 6, { align: "center" });
    const oldW = doc.getTextWidth(oldText);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.line(centerX - oldW / 2, priceBaseline - 7.3, centerX + oldW / 2, priceBaseline - 7.3);

    doc.setTextColor(204, 32, 32);
    const newText = `$${fmt(product.effective_price)}`;
    fitFontSize(doc, newText, contentW, 20, 12, "bold");
    doc.text(newText, centerX, priceBaseline, { align: "center" });
  } else {
    doc.setTextColor(17, 17, 17);
    const priceText = `$${fmt(product.price)}`;
    fitFontSize(doc, priceText, contentW, 20, 12, "bold");
    doc.text(priceText, centerX, priceBaseline, { align: "center" });
  }

  // Footer: logo chico + SKU a la izquierda, $/kg a la derecha si es pesable
  const footerY = y + LABEL_H - PAD;
  let skuX = x + PAD;

  if (logo) {
    const logoH = 3.6;
    const logoW = logoH * LOGO_ASPECT;
    doc.addImage(logo, "PNG", x + PAD, footerY - logoH - 0.3, logoW, logoH);
    skuX = x + PAD + logoW + 1.3;
  }

  doc.setTextColor(136, 136, 136);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(`SKU ${product.sku}`, skuX, footerY, { align: "left" });
  if (product.is_weighted) {
    doc.text(`$${fmt(product.price)}/kg`, x + LABEL_W - PAD, footerY, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

export async function generateLabelsPDF(products: LabelProduct[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await loadLogoDataURL();

  products.forEach((product, i) => {
    const posInPage = i % PER_PAGE;
    if (i > 0 && posInPage === 0) doc.addPage();
    const row = Math.floor(posInPage / COLS);
    const col = posInPage % COLS;
    const x = MARGIN_X + col * LABEL_W;
    const y = MARGIN_Y + row * LABEL_H;
    drawLabel(doc, x, y, product, logo);
  });

  return doc;
}

export async function exportLabelsPDF(products: LabelProduct[], filename = "etiquetas.pdf") {
  const doc = await generateLabelsPDF(products);
  doc.save(filename);
}
