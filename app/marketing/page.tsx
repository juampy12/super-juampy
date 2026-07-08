"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPosEmployee } from "@/lib/posSession";

type Offer = { type: string; value: number; qty_buy?: number | null; qty_pay?: number | null };

type Product = { id: string; name: string; price: number; offer?: Offer };

type Suggestion = Product & {
  reason: string;
  stock: number;
  sold7d: number;
};

type GeneratedTexts = { instagram: string; facebook: string };

// ─── Marca / constantes ─────────────────────────────────────────────────────

const CANVAS_SIZE = 1080;
const LOGO_SRC = "/logo-super-juampy-header.png";

const BRAND = {
  red: "#CC2020",
  blue: "#1A5FA8",
  lime: "#A8C62A",
  gold: "#FFD700",
} as const;

type TemplateId = "oferta" | "clean" | "imperdible";

const TEMPLATE_OPTIONS: { id: TemplateId; label: string }[] = [
  { id: "oferta", label: "Oferta destacada" },
  { id: "clean", label: "Producto con foto" },
  { id: "imperdible", label: "¡Imperdible!" },
];

function pickDefaultTemplate(hasOffer: boolean, hasPhoto: boolean): TemplateId {
  if (hasOffer) return "oferta";
  if (hasPhoto) return "clean";
  return "imperdible";
}

// ─── Canvas helpers genéricos ────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Prueba tamaños de fuente decrecientes hasta que el texto entre en maxLines;
// si ni el más chico entra, corta la última línea con "…" (nunca desborda).
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  sizes: number[]
): { lines: string[]; fontSize: number; lineHeight: number } {
  for (const size of sizes) {
    ctx.font = `bold ${size}px 'Arial', sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { lines, fontSize: size, lineHeight: Math.round(size * 1.25) };
    }
  }

  const size = sizes[sizes.length - 1];
  ctx.font = `bold ${size}px 'Arial', sans-serif`;
  const allLines = wrapText(ctx, text, maxWidth);
  const lines = allLines.slice(0, maxLines);
  let last = lines[lines.length - 1] ?? "";
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1);
  }
  lines[lines.length - 1] = `${last}…`;
  return { lines, fontSize: size, lineHeight: Math.round(size * 1.25) };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// 4-pointed star path (center cx,cy; outer radius R, inner radius r)
function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  outerR: number, innerR: number,
  points = 4
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Returns computed promo price (null if not computable — nxm/second_unit_pct
// no tienen un precio unitario fijo, dependen de la cantidad, así que no se
// dibuja el pill de precio tachado para esos tipos)
function calcPromoPrice(price: number, offer: Offer): number | null {
  if (offer.type === "percent" && offer.value > 0 && offer.value < 100) {
    return Math.round(price * (1 - offer.value / 100));
  }
  if (offer.type === "fixed_price" && offer.value > 0) {
    return Math.round(offer.value);
  }
  return null;
}

function formatPrice(v: number) {
  return `$${v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Header / footer compartidos (logo real + colores de marca) ─────────────

function drawHeader(
  ctx: CanvasRenderingContext2D,
  W: number,
  logoImage: HTMLImageElement | null | undefined
) {
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = BRAND.lime;
  ctx.fillRect(0, 120, W, 10);

  const logoReady = !!(logoImage && logoImage.complete && logoImage.naturalWidth > 0);
  if (logoReady) {
    const logoH = 96;
    const logoW = logoH * (logoImage!.naturalWidth / logoImage!.naturalHeight);
    ctx.drawImage(logoImage!, W / 2 - logoW / 2, 12, logoW, logoH);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 48px 'Arial', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Super Juampy", W / 2, 72);
  }

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Charata, Chaco", W - 40, 108);
  ctx.textAlign = "center";
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  footerY: number,
  W: number,
  template: TemplateId,
  offerText: string
) {
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(0, footerY, W, 110);
  ctx.fillStyle = BRAND.lime;
  ctx.fillRect(0, footerY, W, 6);

  let headline: string;
  let subtitle: string;
  if (offerText) {
    headline = "¡Aprovechá esta promo!";
    subtitle = "Super Juampy · Charata, Chaco";
  } else if (template === "imperdible") {
    headline = "¡No te lo pierdas!";
    subtitle = "Super Juampy · Charata, Chaco";
  } else {
    headline = "¡Visitanos en Charata, Chaco!";
    subtitle = "Super Juampy · Tu supermercado de confianza";
  }

  ctx.textAlign = "center";
  ctx.fillStyle = offerText ? BRAND.gold : "#FFFFFF";
  ctx.font = `bold ${offerText ? 36 : 32}px 'Arial', sans-serif`;
  ctx.fillText(headline, W / 2, footerY + 52);

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.fillText(subtitle, W / 2, footerY + (offerText ? 86 : 88));
}

// ─── Draw: ribbon rotado (¡OFERTA! / ¡IMPERDIBLE!) ───────────────────────────

function drawRibbonBadge(
  ctx: CanvasRenderingContext2D,
  W: number,
  label: string,
  bg: string,
  fg: string
) {
  ctx.save();
  ctx.translate(W - 30, 195);
  ctx.rotate(-15 * (Math.PI / 180));

  const bH = 66;
  ctx.font = `bold 36px 'Arial', sans-serif`;
  const textW = ctx.measureText(label).width;
  const bW = textW + 64;

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = bg;
  roundRect(ctx, -bW, -bH / 2, bW, bH, 14);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, -bW / 2, 2);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ─── Draw: sparkles alrededor de una zona ────────────────────────────────────

function drawSparkles(
  ctx: CanvasRenderingContext2D,
  W: number,
  zoneY: number,
  zoneH: number,
  contentBottom: number
) {
  const pillW = 520;
  const left = W / 2 - pillW / 2;
  const right = W / 2 + pillW / 2;
  const top = zoneY;
  const mid = zoneY + zoneH / 2;
  const bottom = Math.min(zoneY + zoneH, contentBottom - 10);

  const sparkles = [
    { x: left - 42, y: top + 18,       r: 20, color: BRAND.gold, points: 4 },
    { x: right + 42, y: top + 18,      r: 16, color: BRAND.lime, points: 4 },
    { x: left - 52, y: mid,            r: 14, color: BRAND.lime, points: 4 },
    { x: right + 52, y: mid,           r: 22, color: BRAND.gold, points: 4 },
    { x: left - 28, y: bottom - 22,    r: 12, color: BRAND.gold, points: 4 },
    { x: right + 28, y: bottom - 22,   r: 16, color: BRAND.lime, points: 4 },
  ];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 130, W, contentBottom - 130);
  ctx.clip();

  for (const s of sparkles) {
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.88;
    starPath(ctx, s.x, s.y, s.r, s.r * 0.38, s.points);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Draw: foto de producto circular ─────────────────────────────────────────

function drawCircularPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
  ringColor: string
) {
  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const diameter = radius * 2;
  const scale = Math.max(diameter / imgW, diameter / imgH);
  ctx.drawImage(
    img,
    cx - (imgW * scale) / 2,
    cy - (imgH * scale) / 2,
    imgW * scale,
    imgH * scale
  );
  ctx.restore();
}

// ─── Draw: pill de precio (tema oscuro sobre rojo / claro sobre blanco) ─────

function drawPriceBadge(
  ctx: CanvasRenderingContext2D,
  product: Product,
  offer: Offer | undefined | null,
  W: number,
  priceY: number,
  theme: "dark" | "light"
): number {
  const promoPrice = offer ? calcPromoPrice(product.price, offer) : null;
  const hasPromo = promoPrice !== null && promoPrice < product.price;

  const pillW = 520;
  const pillH = hasPromo ? 172 : 130;
  const pillX = (W - pillW) / 2;

  ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(17,24,39,0.05)";
  roundRect(ctx, pillX, priceY, pillW, pillH, 24);
  ctx.fill();

  ctx.textAlign = "center";

  if (hasPromo) {
    const origText = formatPrice(product.price);
    ctx.font = `28px 'Arial', sans-serif`;
    ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.4)";
    ctx.fillText(origText, W / 2, priceY + 40);

    const origW = ctx.measureText(origText).width;
    ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,0.5)" : "rgba(17,24,39,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - origW / 2, priceY + 28);
    ctx.lineTo(W / 2 + origW / 2, priceY + 28);
    ctx.stroke();

    ctx.fillStyle = theme === "dark" ? BRAND.lime : BRAND.red;
    ctx.font = `bold 24px 'Arial', sans-serif`;
    ctx.fillText("PRECIO OFERTA", W / 2, priceY + 76);

    const promoFormatted = formatPrice(promoPrice!);
    ctx.fillStyle = theme === "dark" ? BRAND.lime : BRAND.red;
    ctx.font = `bold 92px 'Arial', sans-serif`;
    if (theme === "dark") {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 12;
    }
    ctx.fillText(promoFormatted, W / 2, priceY + 160);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.8)" : "rgba(17,24,39,0.55)";
    ctx.font = `28px 'Arial', sans-serif`;
    ctx.fillText("PRECIO", W / 2, priceY + 38);

    const priceFormatted = formatPrice(product.price);
    ctx.fillStyle = theme === "dark" ? "#FFFFFF" : BRAND.blue;
    ctx.font = `bold 80px 'Arial', sans-serif`;
    if (theme === "dark") {
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
    }
    ctx.fillText(priceFormatted, W / 2, priceY + 112);
    ctx.shadowBlur = 0;
  }

  return pillH;
}

// ─── Draw: bloque de nombre grande + oferta + precio (sin foto) ─────────────
// Compartido por "oferta" (sin foto) y "imperdible". Cuando reserveRibbonSpace
// es true, deja libre la esquina superior derecha para que el ribbon rotado
// nunca se superponga con la primera línea del nombre (ver drawRibbonBadge).

function drawBigNameBlock(
  ctx: CanvasRenderingContext2D,
  W: number,
  contentTop: number,
  contentBottom: number,
  product: Product,
  offerText: string,
  offer: Offer | undefined | null,
  reserveRibbonSpace: boolean,
  sizes: number[]
) {
  const nameTop = reserveRibbonSpace ? contentTop + 110 : contentTop + 30;
  const nameBudget = reserveRibbonSpace ? 360 : 440;

  const { lines, fontSize, lineHeight } = fitText(
    ctx, product.name.toUpperCase(), W - 120, 3, sizes
  );
  const nameBlockH = lines.length * lineHeight;
  const nameStartY = nameTop + (nameBudget - nameBlockH) / 2 + fontSize;

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, nameStartY + i * lineHeight));
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (offerText) {
    ctx.fillStyle = BRAND.lime;
    ctx.fillRect(60, 630, W - 120, 68);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 32px 'Arial', sans-serif`;
    ctx.fillText(offerText.toUpperCase(), W / 2, 674);
  }

  const priceY = offerText ? 730 : 680;
  const pillH = drawPriceBadge(ctx, product, offer, W, priceY, "dark");
  drawSparkles(ctx, W, priceY, pillH, contentBottom);
}

// ─── Template (a): Oferta destacada ──────────────────────────────────────────

function drawOfertaContent(
  ctx: CanvasRenderingContext2D,
  W: number,
  contentTop: number,
  contentBottom: number,
  product: Product,
  offerText: string,
  offer: Offer | undefined | null,
  productImage: HTMLImageElement | null
) {
  if (offerText) {
    drawRibbonBadge(ctx, W, "¡OFERTA!", BRAND.gold, BRAND.red);
  }

  if (productImage) {
    const photoRadius = 155;
    const photoCX = W / 2;
    const photoCY = contentTop + 180;
    drawCircularPhoto(ctx, productImage, photoCX, photoCY, photoRadius, "rgba(255,255,255,0.2)");

    const { lines, fontSize, lineHeight } = fitText(
      ctx, product.name.toUpperCase(), W - 120, 2, [72, 60, 48]
    );
    const nameStartY = photoCY + photoRadius + 30 + fontSize;

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, nameStartY + i * lineHeight));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const nameBottom = nameStartY + (lines.length - 1) * lineHeight;

    let priceY: number;
    if (offerText) {
      const obY = nameBottom + 28;
      ctx.fillStyle = BRAND.lime;
      ctx.fillRect(60, obY, W - 120, 68);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 32px 'Arial', sans-serif`;
      ctx.fillText(offerText.toUpperCase(), W / 2, obY + 44);
      priceY = obY + 68 + 24;
    } else {
      priceY = nameBottom + 36;
    }

    const pillH = drawPriceBadge(ctx, product, offer, W, priceY, "dark");
    drawSparkles(ctx, W, priceY, pillH, contentBottom);
  } else {
    drawBigNameBlock(ctx, W, contentTop, contentBottom, product, offerText, offer, !!offerText, [96, 76, 60]);
  }
}

// ─── Template (b): Limpio con foto ───────────────────────────────────────────

function drawCleanContent(
  ctx: CanvasRenderingContext2D,
  W: number,
  contentTop: number,
  contentBottom: number,
  product: Product,
  offerText: string,
  offer: Offer | undefined | null,
  productImage: HTMLImageElement | null
) {
  const boxSize = 360;
  const boxX = (W - boxSize) / 2;

  // Medición previa (nombre + precio) para centrar todo el bloque verticalmente
  // en el área de contenido, en vez de dejarlo pegado arriba con hueco abajo.
  const nameFit = fitText(ctx, product.name, W - 140, 2, [50, 42, 34]);
  const nameBlockH = nameFit.fontSize + (nameFit.lines.length - 1) * nameFit.lineHeight;
  const promoPrice = offer ? calcPromoPrice(product.price, offer) : null;
  const priceH = promoPrice !== null && promoPrice < product.price ? 172 : 130;
  const offerPillH = offerText ? 60 : 0;

  const totalH = boxSize + 64 + offerPillH + nameBlockH + 24 + priceH;
  const available = contentBottom - contentTop;
  const boxY = contentTop + Math.max(20, (available - totalH) / 2);

  ctx.save();
  ctx.shadowColor = "rgba(17,24,39,0.15)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, boxX, boxY, boxSize, boxSize, 32);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, boxX, boxY, boxSize, boxSize, 32);
  ctx.clip();

  if (productImage) {
    const imgW = productImage.naturalWidth;
    const imgH = productImage.naturalHeight;
    const scale = Math.max(boxSize / imgW, boxSize / imgH);
    ctx.drawImage(
      productImage,
      boxX + boxSize / 2 - (imgW * scale) / 2,
      boxY + boxSize / 2 - (imgH * scale) / 2,
      imgW * scale,
      imgH * scale
    );
  } else {
    ctx.fillStyle = "rgba(26,95,168,0.06)";
    ctx.fillRect(boxX, boxY, boxSize, boxSize);
    ctx.fillStyle = BRAND.blue;
    ctx.globalAlpha = 0.5;
    ctx.font = `bold 150px 'Arial', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      product.name.trim().charAt(0).toUpperCase(),
      boxX + boxSize / 2,
      boxY + boxSize / 2
    );
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  ctx.strokeStyle = BRAND.lime;
  ctx.lineWidth = 6;
  roundRect(ctx, boxX, boxY, boxSize, boxSize, 32);
  ctx.stroke();

  let cursorY = boxY + boxSize + 64;
  ctx.textAlign = "center";

  if (offerText) {
    ctx.font = `bold 26px 'Arial', sans-serif`;
    const textW = ctx.measureText(offerText.toUpperCase()).width;
    const pillW = textW + 48;
    ctx.fillStyle = BRAND.red;
    roundRect(ctx, W / 2 - pillW / 2, cursorY - 34, pillW, 48, 24);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(offerText.toUpperCase(), W / 2, cursorY);
    cursorY += 60;
  }

  ctx.font = `bold ${nameFit.fontSize}px 'Arial', sans-serif`;
  ctx.fillStyle = "#1F2937";
  const nameBaseline = cursorY + Math.round(nameFit.fontSize * 0.8);
  nameFit.lines.forEach((line, i) => ctx.fillText(line, W / 2, nameBaseline + i * nameFit.lineHeight));
  const nameBottom = nameBaseline + (nameFit.lines.length - 1) * nameFit.lineHeight;

  const priceY = nameBottom + 24;
  drawPriceBadge(ctx, product, offer, W, priceY, "light");
}

// ─── Template (c): ¡Imperdible! (sin foto) ───────────────────────────────────

function drawImperdibleContent(
  ctx: CanvasRenderingContext2D,
  W: number,
  contentTop: number,
  contentBottom: number,
  product: Product,
  offerText: string,
  offer: Offer | undefined | null
) {
  drawRibbonBadge(ctx, W, "¡IMPERDIBLE!", BRAND.gold, BRAND.red);
  drawBigNameBlock(ctx, W, contentTop, contentBottom, product, offerText, offer, true, [104, 84, 66]);
}

// ─── Dispatcher principal ────────────────────────────────────────────────────

function drawMarketingImage(
  canvas: HTMLCanvasElement,
  product: Product,
  offerText: string,
  offer: Offer | undefined | null,
  productImage: HTMLImageElement | null | undefined,
  logoImage: HTMLImageElement | null | undefined,
  template: TemplateId
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = CANVAS_SIZE;
  const H = CANVAS_SIZE;
  canvas.width = W;
  canvas.height = H;

  const footerY = H - 110;
  const contentTop = 130;
  const contentBottom = footerY;
  const isClean = template === "clean";

  ctx.fillStyle = isClean ? "#FFFFFF" : BRAND.red;
  ctx.fillRect(0, 0, W, H);

  if (!isClean) {
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawHeader(ctx, W, logoImage);

  const hasPhoto = !!(productImage && productImage.complete && productImage.naturalWidth > 0);

  if (template === "oferta") {
    drawOfertaContent(ctx, W, contentTop, contentBottom, product, offerText, offer, hasPhoto ? productImage! : null);
  } else if (template === "clean") {
    drawCleanContent(ctx, W, contentTop, contentBottom, product, offerText, offer, hasPhoto ? productImage! : null);
  } else {
    drawImperdibleContent(ctx, W, contentTop, contentBottom, product, offerText, offer);
  }

  drawFooter(ctx, footerY, W, template, offerText);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [ready, setReady] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | undefined>();

  const [productImageSrc, setProductImageSrc] = useState<string | null>(null);

  const [template, setTemplate] = useState<TemplateId>("imperdible");
  const [templateAuto, setTemplateAuto] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [texts, setTexts] = useState<GeneratedTexts | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [copied, setCopied] = useState<"instagram" | "facebook" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const productImageRef = useRef<HTMLImageElement | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const emp = getPosEmployee();
    const supervisor = emp?.role === "supervisor";
    setIsSupervisor(supervisor);
    setReady(true);
    if (supervisor) void loadSuggestions();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      logoImageRef.current = img;
      setLogoLoaded(true);
    };
    img.src = LOGO_SRC;
  }, []);

  useEffect(() => {
    if (logoLoaded && selectedProduct) {
      redrawCanvas(selectedProduct, selectedOffer, productImageRef.current, template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoLoaded]);

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/marketing/suggestions", { cache: "no-store" });
      const json = await res.json();
      setSuggestions(json.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function getOfferLabel(offer: Offer | undefined) {
    if (!offer) return "";
    if (offer.type === "percent") return `${offer.value}% OFF`;
    if (offer.type === "nxm") return `Llevá ${offer.qty_buy}, pagá ${offer.qty_pay}`;
    if (offer.type === "second_unit_pct") return `2da unidad al ${offer.value}% OFF`;
    return `Precio especial $${offer.value.toLocaleString("es-AR")}`;
  }

  function redrawCanvas(
    prod: Product,
    offer: Offer | undefined,
    imgEl: HTMLImageElement | null,
    tmpl: TemplateId
  ) {
    if (!canvasRef.current) return;
    drawMarketingImage(
      canvasRef.current,
      prod,
      getOfferLabel(offer),
      offer,
      imgEl,
      logoImageRef.current,
      tmpl
    );
  }

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/products?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      setSearchResults(json.products ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  function handleSearchInput(val: string) {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchProducts(val), 300);
  }

  function selectProduct(prod: Product, offer?: Offer) {
    setSelectedProduct(prod);
    setSelectedOffer(offer);
    setTexts(null);
    setGenError(null);
    setSearchQuery("");
    setSearchResults([]);
    setProductImageSrc(null);
    productImageRef.current = null;
    setTemplateAuto(true);
    const nextTemplate = pickDefaultTemplate(!!offer, false);
    setTemplate(nextTemplate);
    requestAnimationFrame(() => redrawCanvas(prod, offer, null, nextTemplate));
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedProduct) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      setProductImageSrc(src);
      const img = new Image();
      img.onload = () => {
        productImageRef.current = img;
        const prod = selectedProduct;
        const offer = selectedOffer;
        const nextTemplate = templateAuto ? pickDefaultTemplate(!!offer, true) : template;
        if (nextTemplate !== template) setTemplate(nextTemplate);
        redrawCanvas(prod, offer, img, nextTemplate);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function clearPhoto() {
    setProductImageSrc(null);
    productImageRef.current = null;
    if (selectedProduct) {
      const prod = selectedProduct;
      const offer = selectedOffer;
      const nextTemplate = templateAuto ? pickDefaultTemplate(!!offer, false) : template;
      if (nextTemplate !== template) setTemplate(nextTemplate);
      requestAnimationFrame(() => redrawCanvas(prod, offer, null, nextTemplate));
    }
  }

  function chooseTemplate(id: TemplateId) {
    setTemplateAuto(false);
    setTemplate(id);
    if (selectedProduct) {
      redrawCanvas(selectedProduct, selectedOffer, productImageRef.current, id);
    }
  }

  async function generateTexts() {
    if (!selectedProduct) return;
    setGenerating(true);
    setGenError(null);
    setTexts(null);
    try {
      const offerText = selectedOffer ? getOfferLabel(selectedOffer) : "";
      const res = await fetch("/api/marketing/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: selectedProduct.name,
          price: selectedProduct.price,
          offer_text: offerText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error generando texto");
      setTexts({ instagram: json.instagram, facebook: json.facebook });
    } catch (e: any) {
      setGenError(e?.message ?? "Error inesperado");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(type: "instagram" | "facebook") {
    if (!texts) return;
    await navigator.clipboard.writeText(texts[type]);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadImage() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `super-juampy-${
      selectedProduct?.name.replace(/\s+/g, "-").toLowerCase() ?? "post"
    }.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  if (!ready) return null;

  if (!isSupervisor) {
    return (
      <main className="p-4">
        <div className="rounded-xl border p-6 text-center text-sm text-neutral-500">
          Esta página es solo para supervisores.
        </div>
      </main>
    );
  }

  const offerLabel = getOfferLabel(selectedOffer);

  return (
    <main className="p-4 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Marketing — Generador de posts</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Creá posts para Instagram y Facebook con IA e imagen lista para publicar.
        </p>
      </div>

      {/* ─── Sugerencias automáticas ──────────────────────────────────────────── */}
      <section className="rounded-xl border p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">Productos sugeridos para promocionar</h2>
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
            className="text-xs text-neutral-500 hover:text-neutral-800 disabled:opacity-40"
          >
            {loadingSuggestions ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>

        {loadingSuggestions ? (
          <p className="text-sm text-neutral-400">Analizando productos…</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin sugerencias disponibles.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border p-3 cursor-pointer transition-all ${
                  selectedProduct?.id === s.id
                    ? "border-[#CC2020] bg-red-50"
                    : "hover:border-neutral-400 hover:bg-neutral-50"
                }`}
                onClick={() => selectProduct(s, s.offer)}
              >
                <div className="font-medium text-sm leading-tight">{s.name}</div>
                <div className="text-base font-bold mt-1">
                  ${Number(s.price).toLocaleString("es-AR")}
                </div>
                <div className="text-xs text-neutral-500 mt-1 leading-snug">
                  {s.reason}
                </div>
                <button
                  className="mt-2 text-xs px-3 py-1 rounded-md bg-[#CC2020] text-white hover:bg-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectProduct(s, s.offer);
                  }}
                >
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Búsqueda manual ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border p-4 bg-white space-y-3">
        <h2 className="font-medium text-sm">O buscá un producto</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Escribí el nombre del producto…"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8]"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
          />
          {searchLoading && (
            <span className="absolute right-3 top-2.5 text-xs text-neutral-400">
              Buscando…
            </span>
          )}
        </div>
        {searchResults.length > 0 && (
          <ul className="border rounded-lg divide-y text-sm bg-white shadow-md max-h-52 overflow-y-auto">
            {searchResults.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50 cursor-pointer"
                onClick={() => selectProduct(p, p.offer)}
              >
                <span className="flex-1 truncate">{p.name}</span>
                <span className="ml-3 font-medium text-xs whitespace-nowrap">
                  ${Number(p.price).toLocaleString("es-AR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Producto seleccionado + generación ───────────────────────────────── */}
      {selectedProduct && (
        <section className="rounded-xl border p-4 bg-white space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wide">
                Producto seleccionado
              </div>
              <div className="font-semibold text-lg mt-0.5">
                {selectedProduct.name}
              </div>
              <div className="text-2xl font-bold text-[#CC2020]">
                ${Number(selectedProduct.price).toLocaleString("es-AR")}
              </div>
              {offerLabel && (
                <div className="mt-1 inline-block rounded-full bg-[#A8C62A] px-3 py-0.5 text-xs font-medium text-white">
                  {offerLabel}
                </div>
              )}
            </div>
            <button
              onClick={generateTexts}
              disabled={generating}
              className="shrink-0 rounded-xl px-5 py-3 text-sm font-semibold bg-[#1A5FA8] text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? "Generando…" : "✨ Generar texto con IA"}
            </button>
          </div>
          {genError && (
            <p className="text-sm text-red-600">Error: {genError}</p>
          )}
        </section>
      )}

      {/* ─── Textos generados ─────────────────────────────────────────────────── */}
      {texts && (
        <section className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {(["instagram", "facebook"] as const).map((platform) => (
            <div key={platform} className="rounded-xl border p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">
                  {platform === "instagram" ? "📸 Instagram" : "👥 Facebook"}
                </h3>
                <button
                  onClick={() => copyText(platform)}
                  className="text-xs px-3 py-1.5 rounded-lg border hover:bg-neutral-50 font-medium"
                >
                  {copied === platform ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-neutral-700 leading-relaxed font-sans">
                {texts[platform]}
              </pre>
            </div>
          ))}
        </section>
      )}

      {/* ─── Imagen para redes ────────────────────────────────────────────────── */}
      {selectedProduct && (
        <section className="rounded-xl border p-4 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium text-sm">
              Imagen para redes sociales (1080×1080)
            </h2>
            <button
              onClick={downloadImage}
              className="text-xs px-4 py-2 rounded-lg bg-[#A8C62A] text-white font-medium hover:opacity-90"
            >
              ⬇ Descargar PNG
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => chooseTemplate(opt.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  template === opt.id
                    ? "border-[#1A5FA8] bg-[#1A5FA8] text-white"
                    : "border-neutral-300 text-neutral-600 hover:border-[#1A5FA8] hover:bg-blue-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-4 py-2 rounded-lg border border-dashed border-neutral-300 hover:border-[#1A5FA8] hover:bg-blue-50 font-medium text-neutral-600 transition-colors"
            >
              📷 Subir foto del producto
            </button>
            {productImageSrc && (
              <>
                <img
                  src={productImageSrc}
                  alt="Foto del producto"
                  className="w-12 h-12 rounded-full object-cover border-2 border-white shadow"
                />
                <button
                  onClick={clearPhoto}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  ✕ Quitar foto
                </button>
              </>
            )}
          </div>

          <div className="overflow-auto">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="rounded-lg border"
              style={{ maxWidth: "100%", height: "auto", display: "block" }}
            />
          </div>
        </section>
      )}
    </main>
  );
}
