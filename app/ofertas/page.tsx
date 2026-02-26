"use client";

import { useEffect, useMemo, useState } from "react";

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
  stock: number;

  // ✅ para ocultar desactivados
  active?: boolean | null;
};

type Offer = {
  id: string;
  product_id: string;
  store_id: string | null;
  type: "fixed_price" | "percent";
  value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
};

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
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [isGlobal, setIsGlobal] = useState<boolean>(false);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<ProductRow | null>(null);

  const [type, setType] = useState<"fixed_price" | "percent">("fixed_price");
  const [value, setValue] = useState<number>(0);
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
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stores?select=id,name&order=name.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
      },
    });
    const data = await res.json();
    setStores(Array.isArray(data) ? data : []);
    if (Array.isArray(data) && data.length && !storeId) setStoreId(data[0].id);
  }

  async function searchProducts() {
    if (!effectiveStoreId) return;
    setLoading(true);
    setMsg("");
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
          body: JSON.stringify({
            p_store: effectiveStoreId,
            p_query: query || null,
            p_limit: 30,
          }),
        }
      );
      const data = await res.json();

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
      setMsg(e?.message || "Error buscando productos");
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

    // 1) intentamos por sucursal
    const byStore = await fetchOffers(
      `/api/offers?store_id=${encodeURIComponent(storeId)}`
    );

    // 2) intentamos traer todas (por si /api/offers por store no incluye globales)
    const all = await fetchOffers(`/api/offers`);

    // merge sin duplicados y filtrando global + store actual
    const map = new Map<string, Offer>();

    for (const o of byStore) map.set(o.id, o);

    for (const o of all) {
      if (o.store_id === null || o.store_id === storeId) {
        map.set(o.id, o);
      }
    }

    const merged = Array.from(map.values());
    setOffers(merged);

    // traer info de productos para lo que falte en el map (por REST, sin RPC)
    const missing = merged
      .map((o) => o.product_id)
      .filter((id) => !productMap[id]);

    const uniq = Array.from(new Set(missing));
    if (uniq.length) {
      const ids = uniq
        .slice(0, 100)
        .map((id) => `"${id}"`)
        .join(",");

      // ✅ pedimos active también (si existe y RLS lo permite)
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=id,name,sku,active&id=in.(${ids})`;
      const r = await fetch(url, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
        },
      });
      const prod = await r.json();
      if (Array.isArray(prod)) {
        const add: Record<string, { name: string; sku: string; active?: boolean | null }> = {};
        for (const p of prod) add[p.id] = { name: p.name, sku: p.sku, active: (p as any)?.active ?? null };
        setProductMap((prev) => ({ ...prev, ...add }));
      }
    }
  }

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (storeId) loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ✅ SIN PIN
  async function createOffer() {
    if (!selected) return setMsg("Seleccioná un producto");
    if (!storeId) return setMsg("Seleccioná una sucursal");
    if (!value || value <= 0) return setMsg("Valor inválido");

    // ✅ seguridad extra: no permitir crear oferta a desactivados
    if ((selected as any)?.active === false) {
      return setMsg("Ese producto está desactivado. Reactivalo en Catálogo si querés hacer oferta.");
    }

    setLoading(true);
    setMsg("");

    const payload = {
      product_id: selected.id,
      store_id: isGlobal ? null : storeId,
      type,
      value,
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
      setMsg(data?.error || "Error creando oferta");
    } else {
      setMsg("Oferta creada ✅");
      await loadOffers();
      await searchProducts();
    }
    setLoading(false);
  }

  // ✅ SIN PIN
  async function deactivateOffer(id: string) {
    setLoading(true);
    setMsg("");

    const res = await fetch("/api/offers", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error || "Error desactivando oferta");
    } else {
      setMsg("Oferta desactivada ✅");
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
    <div className="max-w-7xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-semibold mb-4">Ofertas</h1>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-80">Sucursal:</span>
          <select
            className="border rounded-lg px-3 py-2 min-w-[260px]"
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

        {msg && <div className="text-sm ml-auto">{msg}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Buscar y elegir producto */}
        <div className="border rounded-xl p-4 bg-white/5">
          <div className="font-semibold mb-3">Buscar producto</div>
          <div className="flex gap-2">
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
              className="px-4 py-2 rounded-lg bg-black text-white hover:bg-black/80 disabled:opacity-60"
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
                        <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
                          OFERTA ${Number(p.effective_price).toFixed(2)}
                        </span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              Tipo
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="fixed_price">Precio fijo</option>
                <option value="percent">% Descuento</option>
              </select>
            </label>

            <label className="text-sm">
              Valor ({type === "fixed_price" ? "precio final" : "%"})
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                type="number"
                value={value || ""}
                onChange={(e) => setValue(Number(e.target.value))}
                placeholder={type === "fixed_price" ? "Ej: 2999" : "Ej: 20"}
              />
            </label>

            <label className="text-sm">
              Desde
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>

            <label className="text-sm">
              Hasta
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{label}</div>
                          <div className="text-xs opacity-80 mt-1">
                            <b>
                              {o.type === "fixed_price"
                                ? `$${o.value}`
                                : `-${o.value}%`}
                            </b>
                            <span className="mx-2">·</span>
                            {o.store_id ? "Sucursal" : "Global"}
                            <span className="mx-2">·</span>
                            {new Date(o.starts_at).toLocaleString()} →{" "}
                            {new Date(o.ends_at).toLocaleString()}
                          </div>
                        </div>

                        <button
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
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
