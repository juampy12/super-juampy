"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";
import toast from "react-hot-toast";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  price: number;
  effective_price: number;
  has_offer: boolean;
  offer_type: string | null;
  offer_value: number | null;
  active?: boolean | null;
};

type LabelItem = {
  product: ProductRow;
  qty: number;
};

type Store = { id: string; name: string };

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Label({ product }: { product: ProductRow }) {
  const hasOffer = product.has_offer && product.effective_price < product.price;
  return (
    <div className="label-cell">
      <div className="label-name">{product.name}</div>
      {hasOffer ? (
        <div className="label-price-block">
          <span className="label-price-old">${fmt(product.price)}</span>
          <span className="label-price-offer">${fmt(product.effective_price)}</span>
        </div>
      ) : (
        <div className="label-price">${fmt(product.price)}</div>
      )}
      <div className="label-footer">Super Juampy</div>
    </div>
  );
}

export default function EtiquetasPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [items, setItems] = useState<LabelItem[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") { router.replace("/ventas"); return; }
    loadStores(emp.store_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStores(preferredStoreId: string | null) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stores?select=id,name&order=name.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
      },
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      setStores(data);
      const match = preferredStoreId && data.find((s: Store) => s.id === preferredStoreId);
      setStoreId(match ? preferredStoreId! : data[0]?.id ?? "");
    }
  }

  async function searchProducts() {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/products_with_stock`,
        {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_store: storeId, p_query: query || null, p_limit: 40 }),
        }
      );
      const data = await res.json();
      const rows: ProductRow[] = Array.isArray(data)
        ? (data as ProductRow[]).filter((r) => r.active !== false)
        : [];
      setResults(rows);
    } catch (e: any) {
      toast.error(e?.message || "Error buscando productos");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllProducts() {
    if (!storeId) return;
    setLoadingAll(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/products_with_stock`,
        {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_store: storeId, p_query: null, p_limit: 999 }),
        }
      );
      const data = await res.json();
      const rows: ProductRow[] = Array.isArray(data)
        ? (data as ProductRow[]).filter((r) => r.active !== false)
        : [];
      if (rows.length === 0) { toast("No se encontraron productos activos"); return; }
      setItems(rows.map((p) => ({ product: p, qty: 1 })));
      toast.success(`${rows.length} productos cargados`);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando catálogo");
    } finally {
      setLoadingAll(false);
    }
  }

  function addProduct(p: ProductRow) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === p.id);
      if (existing) {
        return prev.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product: p, qty: 1 }];
    });
    toast.success(`${p.name} agregado`);
  }

  function updateQty(id: string, qty: number) {
    if (qty < 1) return;
    setItems((prev) => prev.map((i) => i.product.id === id ? { ...i, qty } : i));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== id));
  }

  function printLabels() {
    window.print();
  }

  const totalLabels = items.reduce((sum, i) => sum + i.qty, 0);

  // Expand items to individual label instances for the print grid
  const expanded = items.flatMap((item) =>
    Array.from({ length: item.qty }, (_, k) => ({ ...item, key: `${item.product.id}-${k}` }))
  );

  return (
    <>
      {/* ── Print styles ───────────────────────────────────────────── */}
      <style>{`
        @media print {
          body > div > div > nav,
          body > div > div > .no-print,
          .no-print {
            display: none !important;
          }
          body, html {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body > div {
            max-width: none !important;
            padding: 0 !important;
          }
          body > div > div {
            padding: 0 !important;
            max-width: none !important;
          }
          .print-area {
            display: block !important;
          }
          .screen-only {
            display: none !important;
          }
        }

        @media screen {
          .print-area {
            display: none;
          }
        }

        /* Label grid */
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          width: 210mm;
          margin: 0 auto;
          padding: 4mm;
          box-sizing: border-box;
        }

        .label-cell {
          border: 1px dashed #bbb;
          padding: 6mm 4mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 52mm;
          text-align: center;
          background: white;
          box-sizing: border-box;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .label-name {
          font-size: 13pt;
          font-weight: 700;
          color: #111;
          line-height: 1.2;
          margin-bottom: 4mm;
          word-break: break-word;
        }

        .label-price {
          font-size: 22pt;
          font-weight: 900;
          color: #111;
          letter-spacing: -0.5px;
        }

        .label-price-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1mm;
        }

        .label-price-old {
          font-size: 13pt;
          font-weight: 500;
          color: #666;
          text-decoration: line-through;
        }

        .label-price-offer {
          font-size: 24pt;
          font-weight: 900;
          color: #cc2020;
        }

        .label-footer {
          margin-top: 4mm;
          font-size: 7pt;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      `}</style>

      {/* ── Screen UI ──────────────────────────────────────────────── */}
      <div className="no-print max-w-7xl mx-auto px-3 py-4">
        <h1 className="text-2xl font-semibold mb-4">Etiquetas de góndola</h1>

        {/* Controls row */}
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <select
            className="border rounded-lg px-3 py-2 min-w-[200px]"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            className="border rounded-lg px-3 py-2 min-w-[240px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o SKU"
            onKeyDown={(e) => { if (e.key === "Enter") searchProducts(); }}
          />
          <button
            className="px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 disabled:opacity-60"
            onClick={searchProducts}
            disabled={loading || !storeId}
          >
            Buscar
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            onClick={loadAllProducts}
            disabled={loadingAll || !storeId}
            title="Carga todos los productos activos del catálogo con 1 etiqueta cada uno"
          >
            <i className="ti ti-stack-2" aria-hidden="true" />
            {loadingAll ? "Cargando…" : "Todo el catálogo"}
          </button>
          {items.length > 0 && (
            <button
              className="px-5 py-2 rounded-lg bg-[#CC2020] text-white font-semibold hover:bg-[#a81a1a] ml-auto flex items-center gap-2"
              onClick={printLabels}
            >
              <i className="ti ti-printer" aria-hidden="true" />
              Imprimir ({totalLabels} {totalLabels === 1 ? "etiqueta" : "etiquetas"})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Search results */}
          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold bg-gray-50 border-b">
              Resultados ({results.length})
              <span className="text-xs font-normal text-gray-500 ml-2">— clic para agregar</span>
            </div>
            <div className="max-h-[480px] overflow-auto divide-y">
              {results.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">
                  {loading ? "Buscando…" : "Buscá un producto arriba"}
                </p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => addProduct(p)}
                  >
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>SKU {p.sku}</span>
                      {p.has_offer ? (
                        <>
                          <span className="line-through">${fmt(p.price)}</span>
                          <span className="text-red-600 font-semibold">${fmt(p.effective_price)}</span>
                          <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">OFERTA</span>
                        </>
                      ) : (
                        <span>${fmt(p.price)}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Label list */}
          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold bg-gray-50 border-b">
              Lista de etiquetas
            </div>
            <div className="max-h-[480px] overflow-auto divide-y">
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">
                  Agregá productos desde el panel izquierdo
                </p>
              ) : (
                items.map((item) => (
                  <div key={item.product.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{item.product.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        {item.product.has_offer ? (
                          <>
                            <span className="line-through">${fmt(item.product.price)}</span>
                            <span className="text-red-600 font-semibold">${fmt(item.product.effective_price)}</span>
                          </>
                        ) : (
                          <span>${fmt(item.product.price)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="w-7 h-7 rounded-full border text-lg leading-none hover:bg-gray-100"
                        onClick={() => updateQty(item.product.id, item.qty - 1)}
                        disabled={item.qty <= 1}
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={item.qty}
                        onChange={(e) => updateQty(item.product.id, Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 text-center border rounded-lg py-1 text-sm"
                      />
                      <button
                        className="w-7 h-7 rounded-full border text-lg leading-none hover:bg-gray-100"
                        onClick={() => updateQty(item.product.id, item.qty + 1)}
                      >+</button>
                      <button
                        className="ml-1 w-7 h-7 rounded-full flex items-center justify-center bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-800 transition-colors"
                        onClick={() => removeItem(item.product.id)}
                        title="Quitar producto"
                      >
                        <i className="ti ti-x text-sm" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {items.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
                Total: <b>{totalLabels}</b> {totalLabels === 1 ? "etiqueta" : "etiquetas"} · 4 por fila en A4
              </div>
            )}
          </div>
        </div>

        {/* Label preview */}
        {items.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Vista previa</h2>
              <button
                className="px-5 py-2 rounded-lg bg-[#CC2020] text-white font-semibold hover:bg-[#a81a1a] flex items-center gap-2"
                onClick={printLabels}
              >
                <i className="ti ti-printer" aria-hidden="true" />
                Imprimir
              </button>
            </div>
            <div className="overflow-x-auto border rounded-xl bg-white p-4">
              <div ref={printRef} className="labels-grid" style={{ display: "grid" }}>
                {expanded.map(({ product, key }) => (
                  <Label key={key} product={product} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Print-only area ─────────────────────────────────────────── */}
      <div className="print-area">
        <div className="labels-grid">
          {expanded.map(({ product, key }) => (
            <Label key={key} product={product} />
          ))}
        </div>
      </div>
    </>
  );
}
