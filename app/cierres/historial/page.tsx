"use client";

import React, { useEffect, useState } from "react";

type Store = { id: string; name: string };

const STORES: Store[] = [
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Av. San Martín" },
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Alberdi" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", name: "Tacuari" },
];

type ClosureRow = {
  id: string;
  store_id: string | null;
  date: string;
  closed_at: string | null;
  total_sales: number;
  total_tickets: number;
  total_cash: number;
};

function formatMoney(n: number) {
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";

  // Si viene como YYYY-MM-DD (fecha de cierre), no usar Date()
  // porque UTC la corre un día para atrás
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }

  // Fallback si alguna vez viene con hora
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-AR");
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function storeName(storeId: string | null) {
  if (!storeId) return "—";
  const s = STORES.find((st) => st.id === storeId);
  return s?.name ?? storeId.slice(0, 8);
}

export default function CashClosuresHistoryPage() {
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadClosures() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/cash-closures", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "Error al cargar los cierres de caja");
      }

      const list = Array.isArray(json.data) ? json.data : [];

      const mapped: ClosureRow[] = list.map((r: any) => ({
        id: String(r.id),
        store_id: r.store_id ? String(r.store_id) : null,
        date: String(r.date),
        closed_at: r.closed_at ? String(r.closed_at) : null,
        total_sales: Number(r.total_sales ?? 0),
        total_tickets: Number(r.total_tickets ?? 0),
        total_cash: Number(r.total_cash ?? 0),
      }));

      setRows(mapped);
    } catch (err: any) {
      console.error("Error cargando historial de cierres", err);
      setError(err.message ?? "Error al cargar los cierres de caja");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClosures();
  }, []);

  return (
    <main className="p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Historial de cierres</h1>
          <p className="text-sm text-neutral-500">
            Listado de cierres de caja por fecha y sucursal.
          </p>
        </div>

        <button
          type="button"
          onClick={loadClosures}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium bg-neutral-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <section className="rounded-xl border p-4">
        {error && (
          <p className="mb-3 text-sm text-red-600">
            Error: {error || "No se pudieron cargar los cierres."}
          </p>
        )}

        {loading && rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Cargando cierres…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay cierres de caja registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Sucursal</th>
                  <th className="text-right py-2 px-2">Total ventas</th>
                  <th className="text-right py-2 px-2">Efectivo</th>
                  <th className="text-right py-2 px-2">Tickets</th>
                  <th className="text-left py-2 px-2">Hora de cierre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1 px-2">{formatDate(r.date)}</td>
                    <td className="py-1 px-2">{storeName(r.store_id)}</td>
                    <td className="py-1 px-2 text-right">
                      {formatMoney(r.total_sales)}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {formatMoney(r.total_cash)}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {r.total_tickets}
                    </td>
                    <td className="py-1 px-2">{formatTime(r.closed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
