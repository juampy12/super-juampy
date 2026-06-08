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

// ─── Canvas image generation ──────────────────────────────────────────────────

const CANVAS_SIZE = 1080;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  maxWidth: number,
  lineHeight: number
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

function drawMarketingImage(
  canvas: HTMLCanvasElement,
  product: Product,
  offerText: string
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

  // Subtle diagonal pattern overlay
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

  // Top blue bar
  ctx.fillStyle = "#1A5FA8";
  ctx.fillRect(0, 0, W, 120);

  // "Super Juampy" logo text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 62px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Super Juampy", W / 2, 82);

  // Green accent line under logo
  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, 120, W, 10);

  // Charata label top-right small
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("Charata, Chaco", W - 40, 108);

  // ── Product name (big, centered) ──
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const name = product.name.toUpperCase();

  // Dynamic font size based on name length
  let nameFontSize = 86;
  if (name.length > 30) nameFontSize = 68;
  if (name.length > 45) nameFontSize = 54;

  ctx.font = `bold ${nameFontSize}px 'Arial', sans-serif`;
  const nameLines = wrapText(ctx, name, W / 2, W - 120, nameFontSize * 1.25);

  const nameBlockHeight = nameLines.length * nameFontSize * 1.25;
  const nameStartY = 160 + (440 - nameBlockHeight) / 2 + nameFontSize;

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  nameLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, nameStartY + i * nameFontSize * 1.25);
  });
  ctx.shadowBlur = 0;

  // ── Offer text (if any) ──
  if (offerText) {
    ctx.fillStyle = "#A8C62A";
    const offerBannerY = 630;
    ctx.fillRect(60, offerBannerY, W - 120, 68);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 32px 'Arial', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(offerText.toUpperCase(), W / 2, offerBannerY + 44);
  }

  // ── Price badge ──
  const priceY = offerText ? 730 : 680;
  const priceFormatted = `$${product.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // White pill background
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  const pillW = 480;
  const pillH = 130;
  const pillX = (W - pillW) / 2;
  roundRect(ctx, pillX, priceY, pillW, pillH, 20);
  ctx.fill();

  // Price label
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `28px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("PRECIO", W / 2, priceY + 38);

  // Price value
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 80px 'Arial', sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 10;
  ctx.fillText(priceFormatted, W / 2, priceY + 112);
  ctx.shadowBlur = 0;

  // ── Bottom blue bar ──
  ctx.fillStyle = "#1A5FA8";
  ctx.fillRect(0, H - 110, W, 110);

  // Green top line on footer
  ctx.fillStyle = "#A8C62A";
  ctx.fillRect(0, H - 110, W, 6);

  // Footer text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 32px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("¡Visitanos en Charata, Chaco!", W / 2, H - 60);
  ctx.font = `22px 'Arial', sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Super Juampy — Tu supermercado de confianza", W / 2, H - 24);
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
  const [selectedOffer, setSelectedOffer] = useState<{ type: string; value: number } | undefined>();

  const [generating, setGenerating] = useState(false);
  const [texts, setTexts] = useState<GeneratedTexts | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [copied, setCopied] = useState<"instagram" | "facebook" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/marketing/products?q=${encodeURIComponent(q)}`, { cache: "no-store" });
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

  function selectProduct(prod: Product, offer?: { type: string; value: number }) {
    setSelectedProduct(prod);
    setSelectedOffer(offer);
    setTexts(null);
    setGenError(null);
    setSearchQuery("");
    setSearchResults([]);

    // Redraw canvas after state update
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        const offerLabel = offer
          ? offer.type === "percent"
            ? `${offer.value}% OFF`
            : `Precio especial $${offer.value.toLocaleString("es-AR")}`
          : "";
        drawMarketingImage(canvasRef.current, prod, offerLabel);
      }
    });
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
    link.download = `super-juampy-${selectedProduct?.name.replace(/\s+/g, "-").toLowerCase() ?? "post"}.png`;
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

  const offerLabel = selectedOffer
    ? selectedOffer.type === "percent"
      ? `${selectedOffer.value}% OFF`
      : `Precio especial $${selectedOffer.value.toLocaleString("es-AR")}`
    : "";

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
                <div className="text-xs text-neutral-500 mt-1 leading-snug">{s.reason}</div>
                <button
                  className="mt-2 text-xs px-3 py-1 rounded-md bg-[#CC2020] text-white hover:bg-red-700"
                  onClick={(e) => { e.stopPropagation(); selectProduct(s, s.offer); }}
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
            <span className="absolute right-3 top-2.5 text-xs text-neutral-400">Buscando…</span>
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
              <div className="text-xs text-neutral-500 uppercase tracking-wide">Producto seleccionado</div>
              <div className="font-semibold text-lg mt-0.5">{selectedProduct.name}</div>
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
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Imagen para redes sociales (1080×1080)</h2>
            <button
              onClick={downloadImage}
              className="text-xs px-4 py-2 rounded-lg bg-[#A8C62A] text-white font-medium hover:opacity-90"
            >
              ⬇ Descargar PNG
            </button>
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
