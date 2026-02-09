"use client";

import { useEffect, useState } from "react";

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

export default function CatalogoPage() {
  // 🔒 roles (client-only, sin romper hydration)
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsSupervisor(isSupervisorClient());
    setReady(true);
  }, []);

  // 📦 estados del formulario (SIEMPRE se declaran)
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

  const calcPrice = calcFinalPrice(n(cost, 0), n(vat, 21), n(margin, 0));
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
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      {!ready ? (
        <div className="border rounded bg-white p-4 text-sm text-gray-600">
          Cargando…
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-4">
            Catálogo — Crear producto
          </h1>

          {!isSupervisor && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              Estás como <b>empleado</b>. Solo un <b>supervisor</b> puede crear
              productos.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded bg-white p-4">
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
        </>
      )}
    </div>
  );
}
