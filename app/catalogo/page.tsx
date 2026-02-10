"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

  const calcPrice = useMemo(
    () => calcFinalPrice(n(cost, 0), n(vat, 21), n(margin, 0)),
    [cost, vat, margin]
  );
  const finalPrice = useFinal ? n(finalManual, 0) : calcPrice;
  const priceCase = finalPrice * Math.max(1, n(unitsCase, 1));

  const reset = () => {
    setName("");
    setIsOwn(true);
    setSku("");
    setCost(0);
    setVat(21);
    setMargin(40);
    setUnitsCase(1);
    setUseFinal(false);
    setFinalManual(0);
  };

  const createProduct = async () => {
    if (!isSupervisor) {
      alert("Solo supervisor puede crear productos.");
      return;
    }
    if (!name.trim()) {
      alert("Falta el nombre");
      return;
    }
    if (!isOwn && !sku.trim()) {
      alert("Si NO es producto propio, el SKU/código de barras es obligatorio.");
      return;
    }

    setCreating(true);
    try {
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
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        alert(`Error creando producto: ${json?.error ?? "desconocido"}`);
        return;
      }

      alert(
        `Producto creado ✅\nSKU: ${json.product?.sku}\nNombre: ${json.product?.name}`
      );
      reset();
      setTab("editar");
      setQ(json.product?.sku ?? "");
      // no auto-buscamos para no confundir
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
  const [working, setWorking] = useState(false);

  function pick(p: ProductMini) {
    setSelected(p);
    setEditName(p.name ?? "");
  }

  // ✅ NUEVO: cargar TODOS los desactivados al tildar
  async function loadInactiveOnly() {
    setSearching(true);
    setResults([]);
    setSelected(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, price, active")
        .eq("active", false)
        .order("name", { ascending: true })
        .limit(300);

      if (error) {
        alert("Error buscando: " + error.message);
        return;
      }

      const list = (data ?? []) as ProductMini[];
      setResults(list);
      if (list.length === 1) pick(list[0]);
      if (list.length === 0) alert("No hay productos desactivados.");
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
      alert("Escribí SKU o nombre para buscar");
      return;
    }

    setSearching(true);
    setResults([]);
    setSelected(null);

    try {
      const isNumeric = /^\d+$/.test(term);
      const desiredActive = showInactive ? false : true;

      // 1) si es numérico -> buscar por sku exacto primero
      if (isNumeric) {
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, price, active")
          .eq("sku", term)
          .eq("active", desiredActive)
          .limit(20);

        if (error) {
          alert("Error buscando: " + error.message);
          return;
        }

        const list = (data ?? []) as ProductMini[];
        if (list.length > 0) {
          setResults(list);
          pick(list[0]);
          return;
        }
        // si no encontró por SKU, caemos a nombre
      }

      // 2) buscar por nombre (ilike)
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, price, active")
        .eq("active", desiredActive)
        .ilike("name", `%${term}%`)
        .order("name", { ascending: true })
        .limit(50);

      if (error) {
        alert("Error buscando: " + error.message);
        return;
      }

      const list = (data ?? []) as ProductMini[];
      setResults(list);
      if (list.length === 1) pick(list[0]);
      if (list.length === 0) alert("No se encontraron productos.");
    } finally {
      setSearching(false);
    }
  }

  async function saveProductName() {
    if (!isSupervisor) {
      alert("Solo supervisor puede editar productos.");
      return;
    }
    if (!selected?.id) return;

    const newName = editName.trim();
    if (!newName) {
      alert("El nombre no puede quedar vacío");
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
        alert(`Error guardando: ${json?.error ?? "desconocido"}`);
        return;
      }

      const updated = json.product as ProductMini;
      setSelected(updated);
      setResults((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      alert("Nombre actualizado ✅");
    } finally {
      setWorking(false);
    }
  }

  async function deactivateProduct() {
    if (!isSupervisor) {
      alert("Solo supervisor puede desactivar productos.");
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
        alert(`Error desactivando: ${json?.error ?? "desconocido"}`);
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

      alert("Producto desactivado ✅");
    } finally {
      setWorking(false);
    }
  }

  async function reactivateProduct() {
    if (!isSupervisor) {
      alert("Solo supervisor puede reactivar productos.");
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
        alert(`Error reactivando: ${json?.error ?? "desconocido"}`);
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

      alert("Producto reactivado ✅");
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
            <div className="border rounded-xl bg-white p-4 shadow-sm">
              <div className="text-lg font-semibold mb-3">Crear producto</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600">Nombre *</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Pan hamburguesa x6"
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
                  <label className="text-sm text-gray-600">
                    SKU {isOwn ? "(opcional)" : "* obligatorio"}
                  </label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder={
                      isOwn ? "Dejar vacío para autogenerar" : "Código de barras"
                    }
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Costo</label>
                  <input
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={cost}
                    onChange={(e) => setCost(n(e.target.value, 0))}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">IVA %</label>
                  <input
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={vat}
                    onChange={(e) => setVat(n(e.target.value, 21))}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Margen %</label>
                  <input
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={margin}
                    onChange={(e) => setMargin(n(e.target.value, 0))}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">Unid/caja</label>
                  <input
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right"
                    value={unitsCase}
                    onChange={(e) =>
                      setUnitsCase(Math.max(1, n(e.target.value, 1)))
                    }
                  />
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
                    type="number"
                    className="border rounded px-3 py-2 w-full text-right font-semibold"
                    value={useFinal ? finalManual : calcPrice}
                    onChange={(e) => {
                      setFinalManual(n(e.target.value, 0));
                      setUseFinal(true);
                    }}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Precio caja estimado: <b>{money(priceCase)}</b>
                  </div>
                </div>

                <div className="md:col-span-2 flex gap-2 justify-end mt-2">
                  <button
                    className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
                    onClick={reset}
                    type="button"
                  >
                    Limpiar
                  </button>

                  <button
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    onClick={createProduct}
                    disabled={creating || !isSupervisor}
                    type="button"
                  >
                    {creating ? "Creando..." : "Crear producto"}
                  </button>
                </div>
              </div>
            </div>
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
                    <input
                      className="border rounded px-3 py-2 w-full"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
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
                    <button
                      className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                      onClick={() => void saveProductName()}
                      disabled={working || !isSupervisor}
                      type="button"
                    >
                      {working ? "..." : "Guardar nombre"}
                    </button>

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
