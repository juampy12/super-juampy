"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPosEmployee } from "@/lib/posSession";
import toast from "react-hot-toast";

type Store = { id: string; name: string };

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
  stock: number;
  is_weighted?: boolean | null;

  // ✅ para ocultar desactivados
  active?: boolean | null;
};

type OfferType = "fixed_price" | "percent" | "nxm" | "second_unit_pct";

type Offer = {
  id: string;
  product_id: string;
  store_id: string | null;
  type: OfferType;
  value: number;
  qty_buy: number | null;
  qty_pay: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
};

const NXM_SHORTCUTS: Array<{ label: string; qty_buy: number; qty_pay: number }> = [
  { label: "2x1", qty_buy: 2, qty_pay: 1 },
  { label: "3x2", qty_buy: 3, qty_pay: 2 },
  { label: "3x1", qty_buy: 3, qty_pay: 1 },
];

const SECOND_UNIT_SHORTCUTS = [50, 70];

function isoLocalInput(dt?: Date) {
  const d = dt ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function OfertasPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [isGlobal, setIsGlobal] = useState<boolean>(false);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<ProductRow | null>(null);

  const [type, setType] = useState<OfferType>("fixed_price");
  const [value, setValue] = useState<number>(0);
  const [qtyBuy, setQtyBuy] = useState<number>(2);
  const [qtyPay, setQtyPay] = useState<number>(1);
  const [startsAt, setStartsAt] = useState<string>(
    isoLocalInput(new Date(Date.now() - 60_000))
  );
  const [endsAt, setEndsAt] = useState<string>(
    isoLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60_000))
  );

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // mapa product_id -> "Nombre (SKU)" para mostrar lindo en Ofertas activas
  const [productMap, setProductMap] = useState<
    Record<string, { name: string; sku: string; active?: boolean | null }>
  >({});

  const effectiveStoreId = useMemo(() => storeId, [storeId]);

  async function loadStores() {
    try {
      const res = await fetch("/api/stores", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error cargando sucursales");
      const list = Array.isArray(data?.stores) ? data.stores : [];
      setStores(list);
      if (list.length && !storeId) setStoreId(list[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando sucursales");
    }
  }

  async function searchProducts() {
    if (!effectiveStoreId) return;
    setLoading(true);
        try {
      const res = await fetch("/api/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: effectiveStoreId,
          query: query || null,
          limit: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error buscando productos");

      // ✅ ocultar desactivados (active=false). Si no viene active => se muestra (modo seguro).
      const rowsAll = Array.isArray(data) ? (data as ProductRow[]) : [];
      const rows = rowsAll.filter((r) => (r as any)?.active !== false);

      setProducts(rows);

      // refrescar map con lo que tenemos a mano
      const next: Record<string, { name: string; sku: string; active?: boolean | null }> = {};
      for (const r of rows) next[r.id] = { name: r.name, sku: r.sku, active: (r as any)?.active ?? null };
      setProductMap((prev) => ({ ...prev, ...next }));

      // ✅ si el seleccionado quedó desactivado/no aparece, lo limpiamos
      if (selected && (selected as any)?.active === false) setSelected(null);
    } catch (e: any) {
      toast.error(e?.message || "Error buscando productos");
    } finally {
      setLoading(false);
    }
  }

  async function fetchOffers(url: string): Promise<Offer[]> {
    try {
      const res = await fetch(url);
      const data = await res.json();
      const list: Offer[] = data?.offers ?? [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  async function loadOffers() {
    if (!storeId) return;

    const list = await fetchOffers(`/api/offers?store_id=${encodeURIComponent(storeId)}`);
    setOffers(list);

    // traer nombres de productos que no estén en el map todavía
    const missing = list
      .map((o: Offer) => o.product_id)
      .filter((id: string) => !productMap[id]);
    const uniq: string[] = Array.from(new Set(missing));
    if (uniq.length) {
      try {
        const res = await fetch("/api/pos/products-by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: uniq }),
        });
        const json = await res.json();
        if (Array.isArray(json.products)) {
          const add: Record<string, { name: string; sku: string; active?: boolean | null }> = {};
          for (const p of json.products) add[p.id] = { name: p.name, sku: p.sku, active: p.active ?? null };
          setProductMap((prev) => ({ ...prev, ...add }));
        }
      } catch { }
    }
  }

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") { router.replace("/ventas"); return; }
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (storeId) loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ✅ SIN PIN
  async function createOffer() {
    if (!selected) return void toast("Seleccioná un producto");
    if (!storeId) return void toast("Seleccioná una sucursal");

    // ✅ seguridad extra: no permitir crear oferta a desactivados
    if ((selected as any)?.active === false) {
      return void toast.error("Ese producto está desactivado. Reactivalo en Catálogo.");
    }

    if (type === "nxm") {
      if (selected.is_weighted) {
        return void toast.error("Las ofertas NxM no están disponibles para productos pesables");
      }
      if (!Number.isInteger(qtyBuy) || !Number.isInteger(qtyPay) || qtyPay < 1 || qtyBuy <= qtyPay) {
        return void toast.error("Revisá qty_buy / qty_pay: llevá debe ser mayor que pagá (mínimo 1)");
      }
      if (qtyBuy > 10) return void toast.error("qty_buy no puede superar 10");
    } else if (type === "second_unit_pct") {
      if (selected.is_weighted) {
        return void toast.error("Esta promo no está disponible para productos pesables");
      }
      if (!value || value <= 0 || value >= 100) {
        return void toast.error("El descuento de la 2da unidad debe ser un porcentaje entre 0 y 100");
      }
    } else if (!value || value <= 0) {
      return void toast.error("Valor inválido");
    }

    setLoading(true);

    const payload = {
      product_id: selected.id,
      store_id: isGlobal ? null : storeId,
      type,
      value: type === "nxm" ? 0 : value,
      qty_buy: type === "nxm" ? qtyBuy : type === "second_unit_pct" ? 2 : undefined,
      qty_pay: type === "nxm" ? qtyPay : undefined,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    };

    const res = await fetch("/api/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "Error creando oferta");
    } else {
      toast.success("Oferta creada");
      await loadOffers();
      await searchProducts();
    }
    setLoading(false);
  }

  // ✅ SIN PIN
  async function deactivateOffer(id: string) {
    setLoading(true);
    
    const res = await fetch("/api/offers", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "Error desactivando oferta");
    } else {
      toast.success("Oferta desactivada");
      await loadOffers();
      await searchProducts();
    }
    setLoading(false);
  }

  const selectedLabel = selected ? `${selected.name} (SKU ${selected.sku})` : "—";

  // ✅ Filtrar ofertas activas cuyo producto esté desactivado (si lo sabemos por productMap)
  const visibleOffers = useMemo(() => {
    return offers.filter((o) => {
      const p = productMap[o.product_id];
      if (!p) return true; // si no sabemos, mostramos (modo seguro)
      return p.active !== false;
    });
  }, [offers, productMap]);

  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden px-3 py-4">
      <h1 className="text-2xl font-semibold mb-4">Ofertas</h1>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="grid grid-cols-1 gap-1 sm:flex sm:items-center sm:gap-2">
          <span className="text-sm opacity-80">Sucursal:</span>
          <select
            className="border rounded-lg px-3 py-2 w-full sm:w-auto sm:min-w-[200px]"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isGlobal}
            onChange={(e) => setIsGlobal(e.target.checked)}
          />
          Global (todas las sucursales)
        </label>


      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Buscar y elegir producto */}
        <div className="border rounded-xl p-4 bg-white/5">
          <div className="font-semibold mb-3">Buscar producto</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="border rounded-lg px-3 py-2 w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o SKU"
              onKeyDown={(e) => {
                if (e.key === "Enter") searchProducts();
              }}
            />
            <button
              className="rounded-lg bg-black px-4 py-2 text-white hover:bg-black/80 disabled:opacity-60 sm:w-auto"
              onClick={searchProducts}
              disabled={loading || !storeId}
            >
              Buscar
            </button>
          </div>

          <div className="mt-3 text-sm opacity-80">
            Tip: escribí y apretá <b>Enter</b>.
          </div>

          <div className="mt-4 border rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-sm font-semibold bg-black/5">
              Productos (elegí uno)
            </div>
            <div className="max-h-[360px] overflow-auto">
              {products.length === 0 ? (
                <div className="px-3 py-3 text-sm opacity-70">
                  No hay resultados
                </div>
              ) : (
                products.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2 border-t hover:bg-black/5 ${
                      selected?.id === p.id ? "bg-black/10" : ""
                    }`}
                    onClick={() => {
                      setSelected(p);
                      setValue(type === "fixed_price" ? Number(p.price || 0) : 10);
                    }}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs opacity-80">
                      SKU {p.sku} · Stock {Number(p.stock)} · Normal $
                      {Number(p.price).toFixed(2)}
                      {p.has_offer ? (
                        p.offer_type === "nxm" && p.qty_buy && p.qty_pay ? (
                          <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-purple-100 text-purple-800 font-semibold">
                            {p.qty_buy}X{p.qty_pay}
                          </span>
                        ) : p.offer_type === "second_unit_pct" && p.offer_value ? (
                          <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-purple-100 text-purple-800 font-semibold">
                            2DA -{p.offer_value}%
                          </span>
                        ) : (
                          <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
                            OFERTA ${Number(p.effective_price).toFixed(2)}
                          </span>
                        )
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Crear oferta */}
        <div className="border rounded-xl p-4 bg-white/5">
          <div className="font-semibold mb-3">Crear oferta</div>

          <div className="text-sm mb-3">
            Producto: <b>{selectedLabel}</b>
          </div>

          <div className="grid grid-cols-1 gap-3 overflow-x-hidden md:grid-cols-2">
            <label className="text-sm">
              Tipo
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={type}
                onChange={(e) => setType(e.target.value as OfferType)}
              >
                <option value="fixed_price">Precio fijo</option>
                <option value="percent">% Descuento</option>
                <option value="nxm" disabled={Boolean(selected?.is_weighted)}>
                  2x1 / 3x2 (NxM){selected?.is_weighted ? " — no disponible para pesables" : ""}
                </option>
                <option value="second_unit_pct" disabled={Boolean(selected?.is_weighted)}>
                  2da unidad al X%{selected?.is_weighted ? " — no disponible para pesables" : ""}
                </option>
              </select>
            </label>

            {type === "nxm" ? (
              <label className="text-sm">
                Llevá / Pagá
                {selected?.is_weighted && (
                  <span className="mt-1 block text-xs text-red-600">
                    Este producto es pesable: las ofertas NxM no están disponibles.
                  </span>
                )}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {NXM_SHORTCUTS.map((s) => (
                    <button
                      type="button"
                      key={s.label}
                      onClick={() => { setQtyBuy(s.qty_buy); setQtyPay(s.qty_pay); }}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                        qtyBuy === s.qty_buy && qtyPay === s.qty_pay
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "hover:bg-black/5"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="w-16 rounded-lg border px-2 py-2 text-center"
                    type="number"
                    min={2}
                    max={10}
                    value={qtyBuy}
                    onChange={(e) => setQtyBuy(Number(e.target.value))}
                  />
                  <span className="text-xs opacity-70">lleva</span>
                  <input
                    className="w-16 rounded-lg border px-2 py-2 text-center"
                    type="number"
                    min={1}
                    max={9}
                    value={qtyPay}
                    onChange={(e) => setQtyPay(Number(e.target.value))}
                  />
                  <span className="text-xs opacity-70">paga</span>
                </div>
                {selected && qtyBuy > qtyPay && qtyPay >= 1 && (
                  <span className="text-xs text-emerald-600 mt-1 block">
                    Ej: {qtyBuy} unidades a ${Number(selected.price).toFixed(2)} c/u → pagás{" "}
                    {qtyPay} × ${Number(selected.price).toFixed(2)} = $
                    {(qtyPay * Number(selected.price)).toFixed(2)} (antes $
                    {(qtyBuy * Number(selected.price)).toFixed(2)})
                  </span>
                )}
              </label>
            ) : type === "second_unit_pct" ? (
              <label className="text-sm">
                Descuento en la 2da unidad
                {selected?.is_weighted && (
                  <span className="mt-1 block text-xs text-red-600">
                    Este producto es pesable: esta promo no está disponible.
                  </span>
                )}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SECOND_UNIT_SHORTCUTS.map((pct) => (
                    <button
                      type="button"
                      key={pct}
                      onClick={() => setValue(pct)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                        value === pct
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "hover:bg-black/5"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="w-20 rounded-lg border px-2 py-2 text-center"
                    type="number"
                    min={1}
                    max={99}
                    value={value || ""}
                    onChange={(e) => setValue(Number(e.target.value))}
                    placeholder="Ej: 50"
                  />
                  <span className="text-xs opacity-70">% de descuento en la 2da unidad</span>
                </div>
                {selected && value > 0 && value < 100 && (
                  <span className="text-xs text-emerald-600 mt-1 block">
                    Ej: 2 unidades a ${Number(selected.price).toFixed(2)} c/u → pagás $
                    {Number(selected.price).toFixed(2)} + $
                    {(Number(selected.price) * (1 - value / 100)).toFixed(2)} = $
                    {(Number(selected.price) * (1 + (1 - value / 100))).toFixed(2)} (antes $
                    {(Number(selected.price) * 2).toFixed(2)})
                  </span>
                )}
              </label>
            ) : (
              <label className="text-sm">
                Valor ({type === "fixed_price" ? "precio final" : "%"})
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  type="number"
                  value={value || ""}
                  onChange={(e) => setValue(Number(e.target.value))}
                  placeholder={type === "fixed_price" ? "Ej: 2999" : "Ej: 20"}
                />
                {selected && value > 0 && (
                  <span className="text-xs text-emerald-600 mt-1 block">
                    {type === "fixed_price"
                      ? `Precio normal $${Number(selected.price).toFixed(2)} → oferta $${Number(value).toFixed(2)}`
                      : `Precio normal $${Number(selected.price).toFixed(2)} → oferta $${(Number(selected.price) * (1 - value / 100)).toFixed(2)} (-${value}%)`
                    }
                  </span>
                )}
              </label>
            )}

            <label className="min-w-0 text-sm">
              Desde
              <input
                className="mt-1 w-full max-w-full min-w-0 rounded-lg border px-3 py-2 text-sm"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>

            <label className="min-w-0 text-sm">
              Hasta
              <input
                className="mt-1 w-full max-w-full min-w-0 rounded-lg border px-3 py-2 text-sm"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>

          <button
            className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            onClick={createOffer}
            disabled={loading || !selected}
          >
            Activar oferta
          </button>

          <hr className="my-5 opacity-40" />

          <div className="font-semibold mb-2">Ofertas activas (vigentes)</div>

          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[300px] overflow-auto">
              {visibleOffers.length === 0 ? (
                <div className="px-3 py-3 text-sm opacity-70">
                  No hay ofertas activas
                </div>
              ) : (
                visibleOffers.map((o) => {
                  const p = productMap[o.product_id];
                  const label = p ? `${p.name} (SKU ${p.sku})` : o.product_id;

                  return (
                    <div key={o.id} className="px-3 py-3 border-t">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium">{label}</div>
                          <div className="text-xs opacity-80 mt-1">
                            <b>
                              {o.type === "fixed_price"
                                ? `$${o.value}`
                                : o.type === "percent"
                                ? `-${o.value}%`
                                : o.type === "second_unit_pct"
                                ? `2da unidad -${o.value}%`
                                : `Llevá ${o.qty_buy} · Pagá ${o.qty_pay}`}
                            </b>
                            <span className="mx-2">·</span>
                            {o.store_id ? "Sucursal" : "Global"}
                            <span className="mx-2">·</span>
                            {new Date(o.starts_at).toLocaleString()} →{" "}
                            {new Date(o.ends_at).toLocaleString()}
                          </div>
                        </div>

                        <button
                          className="rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-60 sm:py-1.5"
                          onClick={() => deactivateOffer(o.id)}
                          disabled={loading}
                        >
                          Desactivar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="text-xs opacity-70 mt-3">
            Nota: máximo 1 oferta activa por producto. Si querés cambiarla,
            desactivá la actual y creá otra.
          </div>
        </div>
      </div>
    </div>
  );
}
