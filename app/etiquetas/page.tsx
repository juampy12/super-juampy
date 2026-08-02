"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";
import { exportLabelsPDF } from "@/app/_utils/labelsPdf";
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
  qty_buy?: number | null;
  qty_pay?: number | null;
  is_weighted?: boolean | null;
  active?: boolean | null;
};

type LabelItem = {
  product: ProductRow;
  qty: number;
};

type Store = { id: string; name: string };
type Supplier = { id: string; name: string };

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EtiquetasPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [query, setQuery] = useState("");

  // Filtro por proveedor para "Todo el catálogo" — mismo criterio que
  // /products: "" = Todos, "none" = sin proveedor, o el supplier_id.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [items, setItems] = useState<LabelItem[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // "Todo el catálogo": traer todo lo que tiene precio, o solo lo que
  // cambió de precio recientemente (para no reimprimir todo de nuevo).
  const [catalogMode, setCatalogMode] = useState<"all" | "recent">("all");
  const [recentValue, setRecentValue] = useState(24);
  const [recentUnit, setRecentUnit] = useState<"hours" | "days">("hours");

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") { router.replace("/ventas"); return; }
    loadStores(emp.store_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j?.suppliers)) setSuppliers(j.suppliers); })
      .catch(() => {});
  }, []);

  async function loadStores(preferredStoreId: string | null) {
    try {
      const res = await fetch("/api/stores", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error cargando sucursales");
      const list = Array.isArray(data?.stores) ? data.stores : [];
      if (list.length) {
        setStores(list);
        const match = preferredStoreId && list.find((s: Store) => s.id === preferredStoreId);
        setStoreId(match ? preferredStoreId! : list[0]?.id ?? "");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error cargando sucursales");
    }
  }

  async function searchProducts() {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, query: query || null, limit: 40 }),
      });
      const data = await res.json();
      const rows: ProductRow[] = Array.isArray(data)
        ? (data as ProductRow[]).filter((r) => r.active !== false)
        : [];

      // Lector de código de barras: si el texto ingresado matchea un SKU exacto, agregar directo
      const trimmed = query.trim();
      const exact = trimmed ? rows.find((r) => r.sku === trimmed) : undefined;
      if (exact) {
        addProduct(exact);
        setQuery("");
        setResults([]);
        return;
      }

      setResults(rows);
    } catch (e: any) {
      toast.error(e?.message || "Error buscando productos");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllProducts() {
    if (!storeId) return;

    // En modo "recientes", ventana en horas (admite fracciones) — el
    // backend/RPC filtra por products.price_updated_at (ver
    // sql/products_price_updated_at.sql).
    const recentHours =
      catalogMode === "recent"
        ? Math.max(0.1, recentUnit === "days" ? recentValue * 24 : recentValue)
        : null;

    setLoadingAll(true);
    try {
      const res = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          query: null,
          all: true,
          ...(recentHours != null ? { recent_hours: recentHours } : {}),
          ...(supplierId ? { supplier_id: supplierId } : {}),
        }),
      });
      const data = await res.json();
      // Excluye productos sin precio cargado (price <= 0): imprimir una
      // etiqueta "$0" no sirve — el usuario los tenía que sacar a mano.
      const rows: ProductRow[] = Array.isArray(data)
        ? (data as ProductRow[]).filter((r) => r.active !== false && Number(r.price) > 0)
        : [];
      const supplierSuffix = supplierScopeLabel ? ` de ${supplierScopeLabel}` : "";

      if (rows.length === 0) {
        toast(
          catalogMode === "recent"
            ? `No hay productos${supplierSuffix} con precio actualizado en ese rango`
            : `No se encontraron productos activos${supplierSuffix} con precio cargado`
        );
        return;
      }
      setItems(rows.map((p) => ({ product: p, qty: 1 })));
      toast.success(`${rows.length} productos${supplierSuffix} cargados`);
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

  async function generatePdf() {
    const expanded = items.flatMap((item) => Array.from({ length: item.qty }, () => item.product));
    setGeneratingPdf(true);
    try {
      await exportLabelsPDF(expanded, `etiquetas-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || "Error generando el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const totalLabels = items.reduce((sum, i) => sum + i.qty, 0);

  // Etiqueta del botón de generación masiva — deja explícito a QUÉ alcance
  // (proveedor / todo el catálogo) y bajo qué modo va a traer TODOS los
  // productos que cumplan (sin el límite de 40 del buscador de al lado).
  const supplierScopeLabel =
    supplierId === "none" ? "sin proveedor" : suppliers.find((s) => s.id === supplierId)?.name ?? null;
  const bulkScopeText = supplierScopeLabel ? supplierScopeLabel : "todo el catálogo";
  const bulkModeText = catalogMode === "recent" ? "actualizados recientemente" : "con precio";

  return (
    <div className="max-w-7xl mx-auto px-3 py-4">
        <h1 className="text-2xl font-semibold mb-4">Etiquetas de góndola</h1>

        <select
          className="border rounded-lg px-3 py-2 w-full sm:w-auto sm:self-start mb-4"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          aria-label="Sucursal"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Generación masiva: TODO el catálogo o TODO un proveedor, sin
              límite de resultados — separado del buscador de al lado, que
              siempre tiene un tope de 40 (a propósito, para agregar de a
              uno) y NO respeta este filtro de proveedor/modo. */}
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3 space-y-2">
            <div className="text-sm font-semibold text-blue-900">
              Generar etiquetas de todo el catálogo o de un proveedor
            </div>

            <select
              className="border rounded-lg px-3 py-2 w-full bg-white"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              aria-label="Proveedor"
            >
              <option value="">Proveedor: Todos</option>
              <option value="none">Proveedor: Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>Proveedor: {s.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-sm w-full">
              <select
                className="bg-transparent text-sm outline-none"
                value={catalogMode}
                onChange={(e) => setCatalogMode(e.target.value as "all" | "recent")}
                aria-label="Rango"
              >
                <option value="all">Todos con precio</option>
                <option value="recent">Actualizados recientemente</option>
              </select>
              {catalogMode === "recent" && (
                <>
                  <input
                    type="number"
                    min={1}
                    className="w-14 border rounded px-1.5 py-0.5 text-sm text-right"
                    value={recentValue}
                    onChange={(e) => setRecentValue(Math.max(1, parseInt(e.target.value) || 1))}
                    aria-label="Cantidad"
                  />
                  <select
                    className="bg-transparent text-sm outline-none"
                    value={recentUnit}
                    onChange={(e) => setRecentUnit(e.target.value as "hours" | "days")}
                    aria-label="Unidad"
                  >
                    <option value="hours">horas</option>
                    <option value="days">días</option>
                  </select>
                </>
              )}
            </div>

            <button
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              onClick={loadAllProducts}
              disabled={loadingAll || !storeId}
              title="Trae TODOS los productos que cumplan el filtro (sin límite de 40) y arma una etiqueta por cada uno"
            >
              <i className="ti ti-stack-2" aria-hidden="true" />
              {loadingAll ? "Cargando…" : `Generar etiquetas de ${bulkScopeText} (${bulkModeText})`}
            </button>
          </div>

          {/* Agregar productos sueltos: buscador de a uno, capado a 40 */}
          <div className="rounded-xl border bg-white p-3 space-y-2">
            <div className="text-sm font-semibold">Agregar productos sueltos</div>
            <div className="flex gap-2">
              <input
                className="border rounded-lg px-3 py-2 flex-1 min-w-0"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o SKU"
                onKeyDown={(e) => { if (e.key === "Enter") searchProducts(); }}
              />
              <button
                className="px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 disabled:opacity-60 shrink-0"
                onClick={searchProducts}
                disabled={loading || !storeId}
              >
                Buscar
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Muestra hasta 40 resultados para agregar de a uno — no usa el filtro de proveedor de la izquierda.
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
            <div className="text-sm text-red-900">
              <b>{totalLabels}</b> {totalLabels === 1 ? "etiqueta lista" : "etiquetas listas"} para imprimir
            </div>
            <button
              className="px-5 py-2 rounded-lg bg-[#CC2020] text-white font-semibold hover:bg-[#a81a1a] disabled:opacity-60 flex items-center gap-2"
              onClick={generatePdf}
              disabled={generatingPdf}
            >
              <i className="ti ti-file-type-pdf" aria-hidden="true" />
              {generatingPdf ? "Generando…" : `Generar PDF (${totalLabels} ${totalLabels === 1 ? "etiqueta" : "etiquetas"})`}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Search results */}
          <div className="border rounded-xl bg-white overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold bg-gray-50 border-b">
              Resultados ({results.length}{results.length === 40 ? "+" : ""})
              <span className="text-xs font-normal text-gray-500 ml-2">— clic para agregar, máx. 40</span>
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
            <div className="px-4 py-3 text-sm font-semibold bg-gray-50 border-b flex items-center justify-between">
              <span>Lista de etiquetas</span>
              {items.length > 0 && (
                <button
                  className="text-xs font-normal text-red-600 hover:text-red-800 flex items-center gap-1"
                  onClick={() => setItems([])}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                  Eliminar todos
                </button>
              )}
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
                Total: <b>{totalLabels}</b> {totalLabels === 1 ? "etiqueta" : "etiquetas"} · 50×40mm, 28 por hoja A4
              </div>
            )}
          </div>
        </div>

    </div>
  );
}
