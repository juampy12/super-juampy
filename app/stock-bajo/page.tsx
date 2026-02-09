"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getPosEmployee } from "@/lib/posSession";

type Store = { id: string; name: string };

type Row = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;
  stock: number;
  min_stock: number;
  missing: number;
};

type SortKey = "missing" | "stock" | "min_stock" | "value" | "name";
type SortDir = "asc" | "desc";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default function StockBajoPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [onlyMissing, setOnlyMissing] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("missing");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ✅ rol (para mostrar botón "Configurar mínimos" solo supervisor)
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [roleReady, setRoleReady] = useState(false);

  useEffect(() => {
    const emp = getPosEmployee();
    setIsSupervisor(emp?.role === "supervisor");
    setRoleReady(true);
  }, []);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          alert("Error cargando sucursales: " + error.message);
          return;
        }
        const list = (data ?? []) as Store[];
        setStores(list);
        if (list.length && !selectedStoreId) setSelectedStoreId(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!selectedStoreId) {
      alert("Elegí una sucursal.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("low_stock_products", {
        p_store: selectedStoreId,
        p_query: query.trim() || null,
        p_limit: 400,
      });

      if (error) {
        console.error(error);
        alert("Error buscando stock bajo: " + error.message);
        return;
      }
      setRows((data ?? []) as Row[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedStoreId) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const filtered = useMemo(() => {
    const base = rows ?? [];
    return onlyMissing ? base.filter((r) => Number(r.missing) > 0) : base;
  }, [rows, onlyMissing]);

  const withValue = useMemo(() => {
    return filtered.map((r) => {
      const unit = Number(r.price ?? 0);
      const miss = Number(r.missing ?? 0);
      const value = unit * miss;
      return { ...r, _value: value };
    });
  }, [filtered]);

  const sortedRows = useMemo(() => {
    const arr = [...withValue];
    const dir = sortDir === "asc" ? 1 : -1;

    arr.sort((a: any, b: any) => {
      if (sortKey === "name") {
        return String(a.name).localeCompare(String(b.name)) * dir;
      }
      if (sortKey === "value") {
        return (Number(a._value) - Number(b._value)) * dir;
      }
      return (Number(a[sortKey]) - Number(b[sortKey])) * dir;
    });

    return arr as Array<Row & { _value: number }>;
  }, [withValue, sortKey, sortDir]);

  const totalMissing = useMemo(
    () => sortedRows.reduce((sum, r) => sum + (Number(r.missing) || 0), 0),
    [sortedRows]
  );

  const totalValue = useMemo(
    () => sortedRows.reduce((sum, r: any) => sum + (Number(r._value) || 0), 0),
    [sortedRows]
  );

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function sortIndicator(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  async function copyList() {
    const lines = sortedRows.map((r: any) => {
      const sku = r.sku ?? "-";
      const miss = Number(r.missing ?? 0).toFixed(0);
      return `${r.name} | SKU: ${sku} | Faltan: ${miss}`;
    });

    const text =
      `📦 Stock bajo (${stores.find((s) => s.id === selectedStoreId)?.name ?? ""})\n` +
      `Items: ${sortedRows.length} | Faltante total: ${Number(totalMissing).toFixed(0)}\n\n` +
      lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      alert("Lista copiada ✅");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Lista copiada ✅");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Stock bajo</h1>
          <p className="text-sm text-neutral-600">
            Detectá faltantes vs mínimo por sucursal y armá pedido rápido.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* ✅ Solo supervisor: link a mínimos */}
          {roleReady && isSupervisor && (
            <Link
              href="/minimos"
              className="rounded border px-3 py-2 text-sm hover:bg-neutral-50"
              title="Configurar mínimos por producto y sucursal"
            >
              Configurar mínimos
            </Link>
          )}

          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void copyList()}
            disabled={loading || sortedRows.length === 0}
            title="Copia la lista para enviar por WhatsApp"
          >
            Copiar lista
          </button>

          <button
            className="rounded bg-black text-white px-4 py-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Buscando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <div className="text-sm text-neutral-600">Sucursal</div>
          <select
            className="border rounded px-3 py-2"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-neutral-600">Buscar</div>
          <input
            className="border rounded px-3 py-2 w-64"
            placeholder="Nombre o SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh();
            }}
          />
        </div>

        <label className="flex items-center gap-2 select-none text-sm border rounded px-3 py-2">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Solo faltantes
        </label>

        <div className="ml-auto grid grid-cols-3 gap-2">
          <div className="border rounded-lg px-3 py-2 bg-white">
            <div className="text-xs text-neutral-500">Items</div>
            <div className="text-lg font-semibold">{sortedRows.length}</div>
          </div>
          <div className="border rounded-lg px-3 py-2 bg-white">
            <div className="text-xs text-neutral-500">Faltante total</div>
            <div className="text-lg font-semibold">{Number(totalMissing).toFixed(0)}</div>
          </div>
          <div className="border rounded-lg px-3 py-2 bg-white">
            <div className="text-xs text-neutral-500">Valor faltante</div>
            <div className="text-lg font-semibold">{money.format(totalValue)}</div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded-xl bg-white overflow-hidden">
        {sortedRows.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">
            {onlyMissing
              ? "No hay faltantes vs mínimo para esta sucursal."
              : "Sin datos (o no configuraste mínimos)."}
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white z-20 border-b">
                <tr className="text-left">
                  <th
                    className="py-2 px-3 cursor-pointer"
                    onClick={() => toggleSort("name")}
                    title="Ordenar por nombre"
                  >
                    Producto{sortIndicator("name")}
                  </th>
                  <th className="py-2 px-3">SKU</th>

                  <th
                    className="py-2 px-3 text-right cursor-pointer"
                    onClick={() => toggleSort("stock")}
                    title="Ordenar por stock"
                  >
                    Stock{sortIndicator("stock")}
                  </th>

                  <th
                    className="py-2 px-3 text-right cursor-pointer"
                    onClick={() => toggleSort("min_stock")}
                    title="Ordenar por mínimo"
                  >
                    Mínimo{sortIndicator("min_stock")}
                  </th>

                  <th
                    className="py-2 px-3 text-right cursor-pointer"
                    onClick={() => toggleSort("missing")}
                    title="Ordenar por faltantes"
                  >
                    Faltan{sortIndicator("missing")}
                  </th>

                  <th
                    className="py-2 px-3 text-right cursor-pointer"
                    onClick={() => toggleSort("value")}
                    title="Ordenar por valor faltante"
                  >
                    Valor{sortIndicator("value")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((r: any) => {
                  const stock = Number(r.stock ?? 0);
                  const min = Number(r.min_stock ?? 0);
                  const miss = Number(r.missing ?? 0);
                  const ratio = min > 0 ? Math.max(0, Math.min(1, stock / min)) : 1;

                  const badge =
                    miss > 0 ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                        ⚠ Stock bajo
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700">
                        OK
                      </span>
                    );

                  return (
                    <tr
                      key={r.id}
                      className={["border-b last:border-0", miss > 0 ? "bg-red-50/40" : ""].join(" ")}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate" title={r.name}>
                              {r.name}
                            </div>
                            <div className="mt-1 h-2 w-48 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className="h-2 bg-black"
                                style={{ width: `${Math.round(ratio * 100)}%` }}
                                title={`${Math.round(ratio * 100)}% del mínimo`}
                              />
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                              {Math.round(ratio * 100)}% del mínimo
                            </div>
                          </div>
                          {badge}
                        </div>
                      </td>

                      <td className="py-2 px-3">{r.sku ?? "-"}</td>

                      <td className="py-2 px-3 text-right">{stock.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{min.toFixed(2)}</td>

                      <td
                        className={[
                          "py-2 px-3 text-right font-semibold",
                          miss > 0 ? "text-red-700" : "text-neutral-700",
                        ].join(" ")}
                      >
                        {miss.toFixed(2)}
                      </td>

                      <td className="py-2 px-3 text-right">
                        {money.format(Number(r._value ?? 0))}
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
        Nota: para que aparezcan alertas, primero tenés que configurar “mínimo” por producto y sucursal.
        {roleReady && isSupervisor && (
          <>
            {" "}
            <Link href="/minimos" className="underline">
              Configurar mínimos
            </Link>
            .
          </>
        )}
      </div>
    </div>
  );
}
