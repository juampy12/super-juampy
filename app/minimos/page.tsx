"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Store = { id: string; name: string };
type ProductRow = { id: string; sku: string | null; name: string };

const PAGE_SIZE = 200;

export default function MinimosPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number>(0);

  // input values (editable)
  const [minValue, setMinValue] = useState<Record<string, string>>({});
  // original values loaded from DB (para detectar cambios)
  const [minOrig, setMinOrig] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const totalPages = useMemo(() => {
    const n = Math.ceil((totalCount || 0) / PAGE_SIZE);
    return n > 0 ? n : 1;
  }, [totalCount]);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setMsg("Error cargando sucursales: " + error.message);
          return;
        }
        const list = (data ?? []) as Store[];
        setStores(list);
        if (list.length && !storeId) setStoreId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

// Reset + autocargar catálogo al cambiar sucursal
useEffect(() => {
  if (!storeId) return;

  setRows([]);
  setMinValue({});
  setMinOrig({});
  setMsg("");
  setPage(0);
  setTotalCount(0);

  // 👇 AUTO-CARGA: primeros 200 apenas entrás
  void searchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [storeId]);

  async function loadMins(productIds: string[]) {
    if (!storeId || productIds.length === 0) return;

    const { data, error } = await supabase
      .from("product_min_stock")
      .select("product_id,min_stock")
      .eq("store_id", storeId)
      .in("product_id", productIds);

    if (error) {
      console.error(error);
      setMsg("Error cargando mínimos: " + error.message);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.product_id] = String(row.min_stock ?? "");
    }

    // guardamos originales y también completamos inputs
    setMinOrig((prev) => ({ ...prev, ...map }));
    setMinValue((prev) => ({ ...prev, ...map }));
  }

  async function searchPage(p: number) {
    if (!storeId) return setMsg("Elegí una sucursal.");

    const term = q.trim();
    setLoading(true);
    setMsg("");

    try {
      const from = p * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select("id,sku,name", { count: "exact" })
        .order("name", { ascending: true });

      if (term) {
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      const { data, error, count } = await query.range(from, to);

      if (error) {
        console.error(error);
        setMsg("Error buscando productos: " + error.message);
        return;
      }

      const list = (data ?? []) as ProductRow[];
      setRows(list);
      setTotalCount(count ?? 0);
      setPage(p);

      // cargar mínimos para los productos de la página
      await loadMins(list.map((x) => x.id));

      setMsg(
        term
          ? `Resultados: ${count ?? 0} — página ${p + 1}/${Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}`
          : `Mostrando catálogo — página ${p + 1}/${Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))}`
      );
    } finally {
      setLoading(false);
    }
  }

  function onSearch() {
    // nueva búsqueda => página 0
    void searchPage(0);
  }

  const dirtyIdsOnPage = useMemo(() => {
    const ids: string[] = [];
    for (const r of rows) {
      const v = (minValue[r.id] ?? "").trim();
      const o = (minOrig[r.id] ?? "").trim();
      // normalizamos coma/punto
      const vn = v.replace(",", ".");
      const on = o.replace(",", ".");
      if (vn !== on) ids.push(r.id);
    }
    return ids;
  }, [rows, minValue, minOrig]);

  async function saveAllChanges() {
    if (!storeId) return setMsg("Elegí una sucursal.");
    if (dirtyIdsOnPage.length === 0) return setMsg("No hay cambios para guardar.");

    setSaving(true);
    setMsg("");

    try {
      // guardamos uno por uno (seguro y simple)
      for (const id of dirtyIdsOnPage) {
        const raw = (minValue[id] ?? "").trim().replace(",", ".");
        const n = Number(raw);

        if (!Number.isFinite(n) || n < 0) {
          setMsg("Hay un mínimo inválido (tiene que ser número >= 0). Revisá los cambios.");
          setSaving(false);
          return;
        }

        const { error } = await supabase.rpc("set_min_stock", {
          p_store: storeId,
          p_product: id,
          p_min: n,
        });

        if (error) {
          console.error(error);
          setMsg("Error guardando mínimos: " + error.message);
          setSaving(false);
          return;
        }

        // update original para que deje de marcarse como cambiado
        setMinOrig((prev) => ({ ...prev, [id]: String(n) }));
      }

      setMsg(`✅ Guardado OK (${dirtyIdsOnPage.length} cambios).`);
    } finally {
      setSaving(false);
    }
  }

  // Para que no quede “vacío” como en tu screenshot:
  // si querés, podés tocar Buscar sin escribir nada y trae página 1.
  // (No auto-cargamos para que no sea pesado)
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock mínimo</h1>
        <p className="text-sm text-neutral-600">
          Configurá el mínimo por producto y sucursal para que aparezca en “Stock bajo”.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium">Sucursal</label>
          <select
            className="border rounded px-3 py-2"
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

        <div className="space-y-1">
          <label className="text-sm font-medium">Buscar producto</label>
          <input
            className="border rounded px-3 py-2 w-80"
            placeholder="Nombre o SKU (vacío = catálogo)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>

        <button
          onClick={onSearch}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
          disabled={loading || !storeId}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-2 rounded border disabled:opacity-60"
            onClick={() => void searchPage(Math.max(0, page - 1))}
            disabled={loading || page <= 0}
            title="Página anterior"
          >
            ◀
          </button>

          <div className="text-sm">
            Página <b>{page + 1}</b> / <b>{totalPages}</b>
          </div>

          <button
            className="px-3 py-2 rounded border disabled:opacity-60"
            onClick={() => void searchPage(Math.min(totalPages - 1, page + 1))}
            disabled={loading || page >= totalPages - 1}
            title="Página siguiente"
          >
            ▶
          </button>

          <button
            className="ml-2 px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
            onClick={() => void saveAllChanges()}
            disabled={saving || dirtyIdsOnPage.length === 0}
            title="Guarda todos los cambios de esta página"
          >
            {saving ? "Guardando..." : `Guardar cambios (${dirtyIdsOnPage.length})`}
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-neutral-700">{msg}</div>}

      <div className="border rounded overflow-hidden bg-white">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">Sin resultados.</div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white z-10 border-b">
                <tr className="text-left">
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3 w-44">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const v = (minValue[p.id] ?? "").trim();
                  const o = (minOrig[p.id] ?? "").trim();
                  const changed = v.replace(",", ".") !== o.replace(",", ".");
                  return (
                    <tr key={p.id} className={`border-b last:border-0 ${changed ? "bg-yellow-50" : ""}`}>
                      <td className="py-2 px-3">
                        <div className="font-medium">{p.name}</div>
                      </td>
                      <td className="py-2 px-3">{p.sku ?? "-"}</td>
                      <td className="py-2 px-3">
                        <input
                          className={`border rounded px-2 py-1 w-36 ${changed ? "border-yellow-400" : ""}`}
                          placeholder="Ej: 5"
                          inputMode="numeric"
                          value={minValue[p.id] ?? ""}
                          onChange={(e) =>
                            setMinValue((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500">
        Nota: se guardan todos los cambios de la <b>página actual</b> con “Guardar cambios”.
      </div>
    </div>
  );
}
