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

// Draws two text segments with different colors, centered together at (centerX, y)
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

function drawPriceBadge(
  ctx: CanvasRenderingContext2D,
  product: Product,
  W: number,
  priceY: number
) {
  const priceFormatted = `$${product.price.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const pillW = 480, pillH = 130;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, (W - pillW) / 2, priceY, pillW, pillH, 20);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `28px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("PRECIO", W / 2, priceY + 38);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 80px 'Arial', sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 10;
  ctx.fillText(priceFormatted, W / 2, priceY + 112);
  ctx.shadowBlur = 0;
}

// ─── Main canvas draw ─────────────────────────────────────────────────────────

function drawMarketingImage(
  canvas: HTMLCanvasElement,
  product: Product,
  offerText: string,
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

  // Subtle diagonal lines overlay
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

  // "Super " (white) + "Juampy" (green) — same bold 62px font
  ctx.font = `bold 62px 'Arial', sans-serif`;
  drawTwoColorText(ctx, "Super ", "#FFFFFF", "Juampy", "#A8C62A", W / 2, 82);

  // Green accent line under header
  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, 120, W, 10);

  // "Charata, Chaco" small label top-right
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Charata, Chaco", W - 40, 108);
  ctx.textAlign = "center";

  const hasPhoto =
    !!(productImage && productImage.complete && productImage.naturalWidth > 0);

  if (hasPhoto) {
    // ── Layout WITH product photo ──
    const photoRadius = 155;
    const photoCX = W / 2;
    const photoCY = 310;

    // Soft white ring around the circle
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoRadius + 10, 0, Math.PI * 2);
    ctx.fill();

    // Clip to circle and draw image (cover-fit)
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoRadius, 0, Math.PI * 2);
    ctx.clip();
    const imgW = productImage!.naturalWidth;
    const imgH = productImage!.naturalHeight;
    const diameter = photoRadius * 2;
    const scale = Math.max(diameter / imgW, diameter / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    ctx.drawImage(
      productImage!,
      photoCX - drawW / 2,
      photoCY - drawH / 2,
      drawW,
      drawH
    );
    ctx.restore();

    // Product name below photo
    const name = product.name.toUpperCase();
    let nameFontSize = 66;
    if (name.length > 20) nameFontSize = 54;
    if (name.length > 35) nameFontSize = 42;

    ctx.font = `bold ${nameFontSize}px 'Arial', sans-serif`;
    const nameLines = wrapText(ctx, name, W - 120);
    const nameLineH = nameFontSize * 1.25;
    // baseline of first line (top of text area = photoCY + photoRadius + 30)
    const nameStartY = photoCY + photoRadius + 30 + nameFontSize;

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    nameLines.forEach((line, i) =>
      ctx.fillText(line, W / 2, nameStartY + i * nameLineH)
    );
    ctx.shadowBlur = 0;

    const nameBottom = nameStartY + (nameLines.length - 1) * nameLineH;

    if (offerText) {
      const obY = nameBottom + 28;
      ctx.fillStyle = "#A8C62A";
      ctx.fillRect(60, obY, W - 120, 68);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 32px 'Arial', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(offerText.toUpperCase(), W / 2, obY + 44);
      drawPriceBadge(ctx, product, W, obY + 68 + 24);
    } else {
      drawPriceBadge(ctx, product, W, nameBottom + 36);
    }
  } else {
    // ── Layout WITHOUT photo (original) ──
    const name = product.name.toUpperCase();
    let nameFontSize = 86;
    if (name.length > 30) nameFontSize = 68;
    if (name.length > 45) nameFontSize = 54;

    ctx.font = `bold ${nameFontSize}px 'Arial', sans-serif`;
    const nameLines = wrapText(ctx, name, W - 120);
    const nameBlockH = nameLines.length * nameFontSize * 1.25;
    const nameStartY = 160 + (440 - nameBlockH) / 2 + nameFontSize;

    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    nameLines.forEach((line, i) =>
      ctx.fillText(line, W / 2, nameStartY + i * nameFontSize * 1.25)
    );
    ctx.shadowBlur = 0;

    if (offerText) {
      ctx.fillStyle = "#A8C62A";
      ctx.fillRect(60, 630, W - 120, 68);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 32px 'Arial', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(offerText.toUpperCase(), W / 2, 674);
    }

    drawPriceBadge(ctx, product, W, offerText ? 730 : 680);
  }

  // ── Bottom blue footer ──
  ctx.fillStyle = "#1A5FA8";
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, H - 110, W, 6);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 32px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("¡Visitanos en Charata, Chaco!", W / 2, H - 60);
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Super Juampy — Tu supermercado de confianza", W / 2, H - 24);
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
  const [selectedOffer, setSelectedOffer] = useState<
    { type: string; value: number } | undefined
  >();

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

  function getOfferLabel(offer: { type: string; value: number } | undefined) {
    if (!offer) return "";
    return offer.type === "percent"
      ? `${offer.value}% OFF`
      : `Precio especial $${offer.value.toLocaleString("es-AR")}`;
  }

  function redrawCanvas(
    prod: Product,
    offer: { type: string; value: number } | undefined,
    imgEl: HTMLImageElement | null
  ) {
    if (!canvasRef.current) return;
    drawMarketingImage(canvasRef.current, prod, getOfferLabel(offer), imgEl);
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

  function selectProduct(
    prod: Product,
    offer?: { type: string; value: number }
  ) {
    setSelectedProduct(prod);
    setSelectedOffer(offer);
    setTexts(null);
    setGenError(null);
    setSearchQuery("");
    setSearchResults([]);
    // Clear photo when changing product
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
        // Capture current state at call time
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

          {/* Photo upload controls */}
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
