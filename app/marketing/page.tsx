"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPosEmployee } from "@/lib/posSession";

type Product = { id: string; name: string; price: number };

type Suggestion = Product & {
  reason: string;
  stock: number;
  sold7d: number;
  offer?: { type: string; value: number };
};

type GeneratedTexts = { instagram: string; facebook: string };
type Offer = { type: string; value: number };

// ─── Canvas helpers ───────────────────────────────────────────────────────────

const CANVAS_SIZE = 1080;

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

function drawTwoColorText(
  ctx: CanvasRenderingContext2D,
  text1: string, color1: string,
  text2: string, color2: string,
  centerX: number, y: number
) {
  const w1 = ctx.measureText(text1).width;
  const w2 = ctx.measureText(text2).width;
  const startX = centerX - (w1 + w2) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = color1;
  ctx.fillText(text1, startX, y);
  ctx.fillStyle = color2;
  ctx.fillText(text2, startX + w1, y);
  ctx.textAlign = "center";
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

// Returns computed promo price (null if not computable)
function calcPromoPrice(price: number, offer: Offer): number | null {
  if (offer.type === "percent" && offer.value > 0 && offer.value < 100) {
    return Math.round(price * (1 - offer.value / 100));
  }
  if ((offer.type === "fixed" || offer.type === "price") && offer.value > 0) {
    return Math.round(offer.value);
  }
  return null;
}

// ─── Draw: rotated "¡OFERTA!" badge ──────────────────────────────────────────

function drawOfertaBadge(ctx: CanvasRenderingContext2D, W: number) {
  ctx.save();
  ctx.translate(W - 30, 195);
  ctx.rotate(-15 * (Math.PI / 180));

  const bW = 220, bH = 66;

  // Drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  // Yellow background
  ctx.fillStyle = "#FFD700";
  roundRect(ctx, -bW, -bH / 2, bW, bH, 14);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Thin dark border
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Text "¡OFERTA!"
  ctx.fillStyle = "#CC2020";
  ctx.font = `bold 36px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("¡OFERTA!", -bW / 2, 2);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ─── Draw: sparkles around price badge ───────────────────────────────────────

function drawSparkles(
  ctx: CanvasRenderingContext2D,
  W: number,
  priceY: number,
  pillH: number,
  contentBottom: number
) {
  const pillW = 520;
  const left = W / 2 - pillW / 2;
  const right = W / 2 + pillW / 2;
  const top = priceY;
  const mid = priceY + pillH / 2;
  const bottom = Math.min(priceY + pillH, contentBottom - 10);

  const sparkles = [
    { x: left - 42, y: top + 18,       r: 20, color: "#FFD700", points: 4 },
    { x: right + 42, y: top + 18,      r: 16, color: "#A8C62A", points: 4 },
    { x: left - 52, y: mid,            r: 14, color: "#A8C62A", points: 4 },
    { x: right + 52, y: mid,           r: 22, color: "#FFD700", points: 4 },
    { x: left - 28, y: bottom - 22,    r: 12, color: "#FFD700", points: 4 },
    { x: right + 28, y: bottom - 22,   r: 16, color: "#A8C62A", points: 4 },
  ];

  // Clip so sparkles never bleed into the footer
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

// ─── Draw: price badge (with optional promo/strikethrough) ───────────────────

function drawPriceBadge(
  ctx: CanvasRenderingContext2D,
  product: Product,
  offer: Offer | undefined | null,
  W: number,
  priceY: number
): number {
  const promoPrice = offer ? calcPromoPrice(product.price, offer) : null;
  const hasPromo = promoPrice !== null && promoPrice < product.price;

  const pillW = 520;
  const pillH = hasPromo ? 172 : 130;
  const pillX = (W - pillW) / 2;

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, pillX, priceY, pillW, pillH, 24);
  ctx.fill();

  ctx.textAlign = "center";

  if (hasPromo) {
    // Strikethrough original price
    const origText = `$${product.price.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
    ctx.font = `28px 'Arial', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(origText, W / 2, priceY + 40);

    const origW = ctx.measureText(origText).width;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - origW / 2, priceY + 28);
    ctx.lineTo(W / 2 + origW / 2, priceY + 28);
    ctx.stroke();

    // "PRECIO OFERTA" label in green
    ctx.fillStyle = "#A8C62A";
    ctx.font = `bold 24px 'Arial', sans-serif`;
    ctx.fillText("PRECIO OFERTA", W / 2, priceY + 76);

    // Promo price big and green
    const promoFormatted = `$${promoPrice!.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
    ctx.fillStyle = "#A8C62A";
    ctx.font = `bold 92px 'Arial', sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 12;
    ctx.fillText(promoFormatted, W / 2, priceY + 160);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `28px 'Arial', sans-serif`;
    ctx.fillText("PRECIO", W / 2, priceY + 38);

    const priceFormatted = `$${product.price.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 80px 'Arial', sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 10;
    ctx.fillText(priceFormatted, W / 2, priceY + 112);
    ctx.shadowBlur = 0;
  }

  return pillH;
}

// ─── Main canvas draw ─────────────────────────────────────────────────────────

function drawMarketingImage(
  canvas: HTMLCanvasElement,
  product: Product,
  offerText: string,
  offer?: Offer | null,
  productImage?: HTMLImageElement | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = CANVAS_SIZE;
  const H = CANVAS_SIZE;
  canvas.width = W;
  canvas.height = H;

  // Background
  ctx.fillStyle = "#CC2020";
  ctx.fillRect(0, 0, W, H);

  // Diagonal lines overlay
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

  // ── Top blue header ──
  ctx.fillStyle = "#1A5FA8";
  ctx.fillRect(0, 0, W, 120);

  ctx.font = `bold 62px 'Arial', sans-serif`;
  drawTwoColorText(ctx, "Super ", "#FFFFFF", "Juampy", "#A8C62A", W / 2, 82);

  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, 120, W, 10);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Charata, Chaco", W - 40, 108);
  ctx.textAlign = "center";

  // Footer y-position (content area ends here)
  const footerY = H - 110;

  // ── "¡OFERTA!" rotated badge (top-right, only when there's an offer) ──
  if (offerText) {
    drawOfertaBadge(ctx, W);
  }

  const hasPhoto =
    !!(productImage && productImage.complete && productImage.naturalWidth > 0);

  if (hasPhoto) {
    // ── Layout WITH product photo ──
    const photoRadius = 155;
    const photoCX = W / 2;
    const photoCY = 310;

    // White ring
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoRadius + 10, 0, Math.PI * 2);
    ctx.fill();

    // Circular clip + cover-fit
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoRadius, 0, Math.PI * 2);
    ctx.clip();
    const imgW = productImage!.naturalWidth;
    const imgH = productImage!.naturalHeight;
    const diameter = photoRadius * 2;
    const scale = Math.max(diameter / imgW, diameter / imgH);
    ctx.drawImage(
      productImage!,
      photoCX - (imgW * scale) / 2,
      photoCY - (imgH * scale) / 2,
      imgW * scale,
      imgH * scale
    );
    ctx.restore();

    // Product name below photo — bigger + stronger shadow
    const name = product.name.toUpperCase();
    let nameFontSize = 72;
    if (name.length > 20) nameFontSize = 60;
    if (name.length > 35) nameFontSize = 48;

    ctx.font = `bold ${nameFontSize}px 'Arial', sans-serif`;
    const nameLines = wrapText(ctx, name, W - 120);
    const nameLineH = nameFontSize * 1.25;
    const nameStartY = photoCY + photoRadius + 30 + nameFontSize;

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    nameLines.forEach((line, i) =>
      ctx.fillText(line, W / 2, nameStartY + i * nameLineH)
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const nameBottom = nameStartY + (nameLines.length - 1) * nameLineH;

    let priceY: number;
    if (offerText) {
      const obY = nameBottom + 28;
      ctx.fillStyle = "#A8C62A";
      ctx.fillRect(60, obY, W - 120, 68);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 32px 'Arial', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(offerText.toUpperCase(), W / 2, obY + 44);
      priceY = obY + 68 + 24;
    } else {
      priceY = nameBottom + 36;
    }

    const pillH = drawPriceBadge(ctx, product, offer, W, priceY);
    drawSparkles(ctx, W, priceY, pillH, footerY);

  } else {
    // ── Layout WITHOUT photo ──
    const name = product.name.toUpperCase();
    let nameFontSize = 96;
    if (name.length > 28) nameFontSize = 76;
    if (name.length > 42) nameFontSize = 60;

    ctx.font = `bold ${nameFontSize}px 'Arial', sans-serif`;
    const nameLines = wrapText(ctx, name, W - 120);
    const nameBlockH = nameLines.length * nameFontSize * 1.25;
    const nameStartY = 160 + (440 - nameBlockH) / 2 + nameFontSize;

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    nameLines.forEach((line, i) =>
      ctx.fillText(line, W / 2, nameStartY + i * nameFontSize * 1.25)
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (offerText) {
      ctx.fillStyle = "#A8C62A";
      ctx.fillRect(60, 630, W - 120, 68);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 32px 'Arial', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(offerText.toUpperCase(), W / 2, 674);
    }

    const priceY = offerText ? 730 : 680;
    const pillH = drawPriceBadge(ctx, product, offer, W, priceY);
    drawSparkles(ctx, W, priceY, pillH, footerY);
  }

  // ── Bottom blue footer ──
  ctx.fillStyle = "#1A5FA8";
  ctx.fillRect(0, footerY, W, 110);
  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, footerY, W, 6);

  ctx.textAlign = "center";
  if (offerText) {
    ctx.fillStyle = "#FFD700";
    ctx.font = `bold 36px 'Arial', sans-serif`;
    ctx.fillText("¡Aprovechá esta promo!", W / 2, footerY + 52);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `22px 'Arial', sans-serif`;
    ctx.fillText("Super Juampy · Charata, Chaco", W / 2, footerY + 86);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 32px 'Arial', sans-serif`;
    ctx.fillText("¡Visitanos en Charata, Chaco!", W / 2, footerY + 52);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `22px 'Arial', sans-serif`;
    ctx.fillText("Super Juampy · Tu supermercado de confianza", W / 2, footerY + 88);
  }
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

  const [generating, setGenerating] = useState(false);
  const [texts, setTexts] = useState<GeneratedTexts | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [copied, setCopied] = useState<"instagram" | "facebook" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const productImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const emp = getPosEmployee();
    const supervisor = emp?.role === "supervisor";
    setIsSupervisor(supervisor);
    setReady(true);
    if (supervisor) void loadSuggestions();
  }, []);

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
    return offer.type === "percent"
      ? `${offer.value}% OFF`
      : `Precio especial $${offer.value.toLocaleString("es-AR")}`;
  }

  function redrawCanvas(
    prod: Product,
    offer: Offer | undefined,
    imgEl: HTMLImageElement | null
  ) {
    if (!canvasRef.current) return;
    drawMarketingImage(canvasRef.current, prod, getOfferLabel(offer), offer, imgEl);
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
    requestAnimationFrame(() => redrawCanvas(prod, offer, null));
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
        if (prod) redrawCanvas(prod, offer, img);
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
      requestAnimationFrame(() => redrawCanvas(prod, offer, null));
    }
  }

  async function generateTexts() {
    if (!selectedProduct) return;
    setGenerating(true);
    setGenError(null);
    setTexts(null);
    try {
      const offerText = selectedOffer
        ? selectedOffer.type === "percent"
          ? `${selectedOffer.value}% de descuento`
          : `Precio especial $${selectedOffer.value.toLocaleString("es-AR")}`
        : "";
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
                onClick={() => selectProduct(p)}
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
        <section className="grid gap-4 md:grid-cols-2">
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
