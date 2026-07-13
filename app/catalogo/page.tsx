"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

function n(v: any, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function money(v: number) {
  return `$${(Math.round(v * 100) / 100).toFixed(2)}`;
}
function calcFinalPrice(costNet: number, vatRate: number, markupRate: number) {
  const withVat = costNet * (1 + vatRate / 100);
  const withMarkup = withVat * (1 + markupRate / 100);
  return Math.round(withMarkup * 100) / 100;
}
function isSupervisorClient() {
  try {
    const v =
      localStorage.getItem("pos_role") ||
      localStorage.getItem("role") ||
      localStorage.getItem("user_role") ||
      "";
    return String(v).toLowerCase() === "supervisor";
  } catch {
    return false;
  }
}

type ProductMini = {
  id: string;
  sku: string | null;
  plu: string | null;
  name: string;
  price: number | null;
  active: boolean | null;
};

export default function CatalogoPage() {
  // 🔒 roles (client-only, sin romper hydration)
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsSupervisor(isSupervisorClient());
    setReady(true);
  }, []);

  // =========================
  // UI: tabs
  // =========================
  const [tab, setTab] = useState<"crear" | "editar">("crear");

  // =========================
  // CREAR PRODUCTO
  // =========================
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [isOwn, setIsOwn] = useState(true);
  const [sku, setSku] = useState("");

  const [cost, setCost] = useState(0);
  const [vat, setVat] = useState(21);
  const [margin, setMargin] = useState(40);
  const [unitsCase, setUnitsCase] = useState(1);

  const [useFinal, setUseFinal] = useState(false);
  const [finalManual, setFinalManual] = useState(0);

  const [isWeighted, setIsWeighted] = useState(false);
  const [initialStock, setInitialStock] = useState(0);
  const [stockStoreId, setStockStoreId] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stores");
        const json = await res.json().catch(() => ({}));
        setStores(json?.stores ?? []);
      } catch {
        // silencioso: el selector queda vacío, no bloquea la carga
      }
    })();
  }, []);

  // Refs para navegar el form a pura tecla (SKU escaneado -> Enter -> siguiente campo)
  const skuRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const vatRef = useRef<HTMLInputElement>(null);
  const marginRef = useRef<HTMLInputElement>(null);
  const unitsCaseRef = useRef<HTMLInputElement>(null);
  const finalPriceRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);

  function focusNext(e: React.KeyboardEvent, nextRef: React.RefObject<HTMLElement | null>) {
    if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      nextRef.current?.focus();
    }
  }

  function submitOnEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      void createProduct();
    }
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      void createProduct();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void createProduct();
  }

  const calcPrice = useMemo(
    () => calcFinalPrice(n(cost, 0), n(vat, 21), n(margin, 0)),
    [cost, vat, margin]
  );
  const finalPrice = useFinal ? n(finalManual, 0) : calcPrice;
  const priceCase = finalPrice * Math.max(1, n(unitsCase, 1));

  // Reset completo (botón "Limpiar"): también borra IVA/Margen/Sucursal
  const resetAll = () => {
    setName("");
    setIsOwn(true);
    setSku("");
    setCost(0);
    setVat(21);
    setMargin(40);
    setUnitsCase(1);
    setUseFinal(false);
    setFinalManual(0);
    setIsWeighted(false);
    setInitialStock(0);
    setStockStoreId("");
  };

  // Reset tras crear: IVA%, Margen% y Sucursal persisten (mismo remito, misma sucursal)
  const resetAfterCreate = () => {
    setName("");
    setIsOwn(true);
    setSku("");
    setCost(0);
    setUnitsCase(1);
    setUseFinal(false);
    setFinalManual(0);
    setIsWeighted(false);
    setInitialStock(0);
  };

  const createProduct = async () => {
    if (!isSupervisor) {
      toast.error("Solo supervisor puede crear productos.");
      return;
    }
    if (!name.trim()) {
      toast.error("Falta el nombre");
      return;
    }
    if (!isOwn && !sku.trim()) {
      toast.error("Si NO es producto propio, el SKU/código de barras es obligatorio.");
      return;
    }
    if (n(initialStock, 0) > 0 && !stockStoreId) {
      toast.error("Elegí una sucursal para el stock inicial.");
      return;
    }

    setCreating(true);
    try {
      const wantsStock = n(initialStock, 0) > 0;
      const res = await fetch("/api/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          is_own_product: isOwn,

          cost_net: n(cost, 0),
          vat_rate: n(vat, 21),
          markup_rate: n(margin, 0),
          units_per_case: Math.max(1, n(unitsCase, 1)),

          use_final_price: useFinal,
          final_price: useFinal ? n(finalManual, 0) : null,

          is_weighted: isWeighted,

          initial_stock: wantsStock ? n(initialStock, 0) : null,
          stock_store_id: wantsStock ? stockStoreId : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        toast.error(`Error creando producto: ${json?.error ?? "desconocido"}`);
        return;
      }

      toast.success(`✓ ${json.product?.name ?? name.trim()} creado`);
      if (json?.stock_warning) {
        toast.error(`El producto se creó, pero el stock inicial falló: ${json.stock_warning}`);
      }
      resetAfterCreate();
      skuRef.current?.focus();
    } finally {
      setCreating(false);
    }
  };

  // =========================
  // EDITAR / DESACTIVAR
  // =========================
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductMini[]>([]);
  const [selected, setSelected] = useState<ProductMini | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlu, setEditPlu] = useState("");
  const [working, setWorking] = useState(false);

  function pick(p: ProductMini) {
    setSelected(p);
    setEditName(p.name ?? "");
    setEditPlu(p.plu ?? "");
  }

  // ✅ NUEVO: cargar TODOS los desactivados al tildar
  async function loadInactiveOnly() {
    setSearching(true);
    setResults([]);
    setSelected(null);
    try {
      const res = await fetch("/api/products/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: "false", limit: 300 }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error("Error buscando: " + (json.error ?? res.status)); return; }

      const list = (json.data ?? []) as ProductMini[];
      setResults(list);
      if (list.length === 1) pick(list[0]);
      if (list.length === 0) toast("No hay productos desactivados.");
    } finally {
      setSearching(false);
    }
  }

  async function searchProducts() {
    const term = q.trim();

    // ✅ Regla pedida:
    // - Si showInactive está tildado: SOLO desactivados
    //    - si term vacío: traer TODOS desactivados
    //    - si term con texto: filtrar desactivados por sku o nombre
    // - Si showInactive NO está tildado: SOLO activos (requiere término)
    if (showInactive && !term) {
      await loadInactiveOnly();
      return;
    }

    if (!term) {
      toast.error("Escribí SKU o nombre para buscar");
      return;
    }

    setSearching(true);
    setResults([]);
    setSelected(null);

    try {
      const desiredActive = showInactive ? "false" : "true";
      // El endpoint maneja SKU exacto primero (si es numérico) con fallback a nombre
      const res = await fetch("/api/products/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: term, active: desiredActive, limit: 50 }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error("Error buscando: " + (json.error ?? res.status)); return; }

      const list = (json.data ?? []) as ProductMini[];
      setResults(list);
      if (list.length === 1) pick(list[0]);
      if (list.length === 0) toast("No se encontraron productos.");
    } finally {
      setSearching(false);
    }
  }

  async function saveProductName() {
    if (!isSupervisor) {
      toast.error("Solo supervisor puede editar productos.");
      return;
    }
    if (!selected?.id) return;

    const newName = editName.trim();
    if (!newName) {
      toast.error("El nombre no puede quedar vacío");
      return;
    }

    setWorking(true);
    try {
      const res = await fetch("/api/products/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, name: newName }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        toast.error(`Error guardando: ${json?.error ?? "desconocido"}`);
        return;
      }

      const updated = json.product as ProductMini;
      setSelected(updated);
      setResults((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("Nombre actualizado");
    } finally {
      setWorking(false);
    }
  }

  async function savePlu() {
    if (!isSupervisor) { toast.error("Solo supervisor puede editar productos."); return; }
    if (!selected?.id) return;

    setWorking(true);
    try {
      const res = await fetch("/api/products/update-plu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, plu: editPlu.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) { toast.error(`Error guardando PLU: ${json?.error ?? "desconocido"}`); return; }

      const updated = { ...selected, plu: editPlu.trim() || null };
      setSelected(updated);
      setResults((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("PLU actualizado");
    } finally {
      setWorking(false);
    }
  }

  async function deactivateProduct() {
    if (!isSupervisor) {
      toast.error("Solo supervisor puede desactivar productos.");
      return;
    }
    if (!selected?.id) return;

    const ok = window.confirm(
      `¿Desactivar este producto?\n\n${selected.name}\nSKU: ${
        selected.sku ?? "—"
      }\n\nNo se borra, solo se oculta.`
    );
    if (!ok) return;

    setWorking(true);
    try {
      const res = await fetch("/api/products/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        toast.error(`Error desactivando: ${json?.error ?? "desconocido"}`);
        return;
      }

      const updated = json.product as ProductMini;
      setSelected(updated);

      // ✅ si estamos viendo activos, lo sacamos para no confundir
      if (!showInactive) {
        setResults((prev) => prev.filter((p) => p.id !== updated.id));
        setSelected(null);
      } else {
        // si estamos viendo desactivados, refrescamos la lista de desactivados
        await loadInactiveOnly();
      }

      toast.success("Producto desactivado");
    } finally {
      setWorking(false);
    }
  }

  async function reactivateProduct() {
    if (!isSupervisor) {
      toast.error("Solo supervisor puede reactivar productos.");
      return;
    }
    if (!selected?.id) return;

    const ok = window.confirm(`¿Reactivar este producto?\n\n${selected.name}`);
    if (!ok) return;

    setWorking(true);
    try {
      const res = await fetch("/api/products/update-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, active: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        toast.error(`Error reactivando: ${json?.error ?? "desconocido"}`);
        return;
      }

      // ✅ si estoy viendo desactivados, lo saco de la lista (porque ya no es desactivado)
      if (showInactive) {
        setResults((prev) => prev.filter((p) => p.id !== selected.id));
        setSelected(null);
      } else {
        const updated = json.product as ProductMini;
        setSelected(updated);
        setResults((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }

      toast.success("Producto reactivado");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      {!ready ? (
        <div className="border rounded bg-white p-4 text-sm text-gray-600">
          Cargando…
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-2xl font-semibold">Catálogo</h1>
            <p className="text-sm text-gray-600">
              Crear, editar nombre y desactivar productos (sin borrar historial).
            </p>
          </div>

          {!isSupervisor && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              Estás como <b>empleado</b>. Solo un <b>supervisor</b> puede crear,
              editar o desactivar productos.
            </div>
          )}

          {/* Tabs */}
          <div className="mb-4 inline-flex rounded-xl border bg-white p-1 shadow-sm">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === "crear" ? "bg-black text-white" : "hover:bg-neutral-100"
              }`}
              onClick={() => setTab("crear")}
              type="button"
            >
              Crear producto
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === "editar" ? "bg-black text-white" : "hover:bg-neutral-100"
              }`}
              onClick={() => setTab("editar")}
              type="button"
            >
              Editar / Desactivar
            </button>
          </div>

          {/* ===== CREAR ===== */}
          {tab === "crear" && (
            <form
              className="border rounded-xl bg-white p-4 shadow-sm"
              onSubmit={handleSubmit}
              onKeyDown={handleFormKeyDown}
            >
              <div className="text-lg font-semibold mb-3">Crear producto</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600">
                    SKU / código de barras {isOwn ? "(opcional)" : "* obligatorio"}
                  </label>
                  <input
                    ref={skuRef}
                    autoFocus
                    className="border rounded px-3 py-2 w-full"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    onKeyDown={(e) => focusNext(e, nameRef)}
                    placeholder={
                      isOwn ? "Escanear o dejar vacío para autogenerar" : "Escanear código de barras"
                    }
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isOwn}
                    onChange={(e) => setIsOwn(e.target.checked)}
                  />
                  <span className="text-sm">
                    Producto propio (si no tiene código de barras, se genera SKU
                    automático)
                  </span>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600">Nombre *</label>
                  <input
                    ref={nameRef}
                    className="border rounded px-3 py-2 w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => focusNext(e, costRef)}
                    placeholder="Ej: Pan hamburguesa x6"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Costo</label>
                  <input
                    ref={costRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={cost}
                    onChange={(e) => setCost(n(e.target.value, 0))}
                    onKeyDown={(e) => focusNext(e, vatRef)}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">IVA %</label>
                  <input
                    ref={vatRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={vat}
                    onChange={(e) => setVat(n(e.target.value, 21))}
                    onKeyDown={(e) => focusNext(e, marginRef)}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Margen %</label>
                  <input
                    ref={marginRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={margin}
                    onChange={(e) => setMargin(n(e.target.value, 0))}
                    onKeyDown={(e) => focusNext(e, unitsCaseRef)}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Unidades por bulto/caja</label>
                  <input
                    ref={unitsCaseRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={unitsCase}
                    onChange={(e) =>
                      setUnitsCase(Math.max(1, n(e.target.value, 1)))
                    }
                    onKeyDown={(e) => focusNext(e, finalPriceRef)}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Si comprás por unidad, dejá 1. Si el proveedor vende por
                    caja/pack, poné cuántas unidades trae (ej: caja x6 → 6).
                  </div>
                  {unitsCase > 1 && cost > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Costo por bulto/caja: <b>{money(cost * unitsCase)}</b>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useFinal}
                    onChange={(e) => setUseFinal(e.target.checked)}
                  />
                  <span className="text-sm">Precio final manual</span>
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600">Precio final</label>
                  <input
                    ref={finalPriceRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right font-semibold"
                    value={useFinal ? finalManual : calcPrice}
                    onChange={(e) => {
                      setFinalManual(n(e.target.value, 0));
                      setUseFinal(true);
                    }}
                    onKeyDown={(e) => focusNext(e, stockRef)}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Precio caja estimado: <b>{money(priceCase)}</b>
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isWeighted}
                    onChange={(e) => setIsWeighted(e.target.checked)}
                  />
                  <span className="text-sm">
                    Se vende por peso (kg) — el precio de arriba es <b>por kilo</b>
                  </span>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Sucursal (stock inicial)</label>
                  <select
                    className="border rounded px-3 py-2 w-full"
                    value={stockStoreId}
                    onChange={(e) => setStockStoreId(e.target.value)}
                  >
                    <option value="">Elegir sucursal…</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="all">Todas las sucursales activas</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Stock inicial (opcional)</label>
                  <input
                    ref={stockRef}
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={initialStock}
                    onChange={(e) => setInitialStock(Math.max(0, n(e.target.value, 0)))}
                    onKeyDown={submitOnEnter}
                  />
                </div>

                <div className="md:col-span-2 flex gap-2 justify-end mt-2">
                  <button
                    className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
                    onClick={resetAll}
                    type="button"
                  >
                    Limpiar
                  </button>

                  <button
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={creating || !isSupervisor}
                    type="submit"
                  >
                    {creating ? "Creando..." : "Crear producto (Enter)"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ===== EDITAR / DESACTIVAR ===== */}
          {tab === "editar" && (
            <div className="border rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Editar / Desactivar</div>
                  <div className="text-xs text-gray-500">
                    Buscá por SKU (ej: 4002) o por nombre (ej: pan hamburguesa)
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setShowInactive(checked);
                      setSelected(null);
                      setResults([]);
                      if (checked) {
                        setQ("");
                        void loadInactiveOnly(); // ✅ auto-carga desactivados
                      }
                    }}
                  />
                  Ver desactivados
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="border rounded px-3 py-2 flex-1"
                  placeholder={
                    showInactive
                      ? "Buscar dentro de desactivados (opcional)..."
                      : "Buscar por SKU o nombre..."
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchProducts();
                  }}
                />
                <button
                  className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
                  onClick={() => void searchProducts()}
                  disabled={searching}
                  type="button"
                >
                  {searching ? "..." : "Buscar"}
                </button>
              </div>

              {results.length > 0 && (
                <div className="mt-3 border rounded-md overflow-hidden">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pick(p)}
                      className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-neutral-50 ${
                        selected?.id === p.id ? "bg-neutral-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-600">
                            SKU: {p.sku ?? "—"} · $
                            {Number(p.price ?? 0).toFixed(2)}
                            {" · "}
                            {p.active ? (
                              <span className="text-green-700 font-semibold">
                                ACTIVO
                              </span>
                            ) : (
                              <span className="text-red-700 font-semibold">
                                DESACTIVADO
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">Seleccionar</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selected && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-sm text-gray-600">Nombre</label>
                    <div className="flex gap-2">
                      <input
                        className="border rounded px-3 py-2 flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <button
                        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 shrink-0"
                        onClick={() => void saveProductName()}
                        disabled={working || !isSupervisor}
                        type="button"
                      >
                        {working ? "..." : "Guardar"}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm text-gray-600">
                      PLU (balanza){" "}
                      <span className="text-xs text-gray-400">— código corto para etiquetas de peso, ej: 9</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="border rounded px-3 py-2 w-32"
                        value={editPlu}
                        onChange={(e) => setEditPlu(e.target.value)}
                        placeholder="ej: 9"
                      />
                      <button
                        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                        onClick={() => void savePlu()}
                        disabled={working || !isSupervisor}
                        type="button"
                      >
                        {working ? "..." : "Guardar PLU"}
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-gray-700">
                    <div>
                      <b>SKU:</b> {selected.sku ?? "—"}
                    </div>
                    <div>
                      <b>Precio:</b> ${Number(selected.price ?? 0).toFixed(2)}
                    </div>
                    <div>
                      <b>Estado:</b>{" "}
                      {selected.active ? (
                        <span className="text-green-700 font-semibold">
                          ACTIVO
                        </span>
                      ) : (
                        <span className="text-red-700 font-semibold">
                          DESACTIVADO
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-end gap-2 justify-end">

                    {selected.active ? (
                      <button
                        className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50"
                        onClick={() => void deactivateProduct()}
                        disabled={working || !isSupervisor}
                        type="button"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button
                        className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
                        onClick={() => void reactivateProduct()}
                        disabled={working || !isSupervisor}
                        type="button"
                        title="Reactivar producto"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
