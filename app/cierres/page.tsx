"use client";

import React, { useEffect, useState } from "react";

type Store = { id: string; name: string };

type Kpis = {
  totalAmount: number;
  tickets: number;
  avgTicket: number;
};

const STORES: Store[] = [
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", name: "Av. San Martín" },
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", name: "Alberdi" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", name: "Tacuari" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashClosurePage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [selectedStore, setSelectedStore] = useState<string>(
    STORES[0]?.id ?? ""
  );

  const [kpis, setKpis] = useState<Kpis>({
    totalAmount: 0,
    tickets: 0,
    avgTicket: 0,
  });
  const [loading, setLoading] = useState(false);

  async function loadClosure() {
    try {
      if (!selectedDate || !selectedStore) return;

      setLoading(true);

      const params = new URLSearchParams();
      params.append("from", selectedDate);
      params.append("to", selectedDate);
      params.append("store_id", selectedStore);

      const res = await fetch(`/api/reports/summary?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("CASH CLOSURE RESPONSE:", data);

      if (data.kpis) {
        setKpis({
          totalAmount: Number(data.kpis.totalAmount ?? 0),
          tickets: Number(data.kpis.tickets ?? 0),
          avgTicket: Number(data.kpis.avgTicket ?? 0),
        });
      } else {
        setKpis({ totalAmount: 0, tickets: 0, avgTicket: 0 });
      }
    } catch (err) {
      console.error("Error cargando cierre de caja", err);
      alert("Error cargando el cierre de caja");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClosure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedStore]);

  const storeName =
    STORES.find((s) => s.id === selectedStore)?.name ?? "Sucursal";

  return (
    <main className="p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cierre de caja</h1>
          <p className="text-sm text-neutral-500">
            Resumen diario de ventas por sucursal.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex flex-col text-sm">
            <label className="text-neutral-500 mb-1">Fecha</label>
            <input
              type="date"
              className="rounded border px-2 py-1 text-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col text-sm">
            <label className="text-neutral-500 mb-1">Sucursal</label>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
            >
              {STORES.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tarjetas de cierre */}
      <section className="grid gap-4 md:grid-cols-4">
        {/* Total grande tipo ticket de caja */}
        <div className="md:col-span-2 rounded-xl border p-4 bg-neutral-50">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Total del día
          </div>
          <div className="text-4xl font-bold mb-2">
            {loading
              ? "Cargando..."
              : `$${kpis.totalAmount.toLocaleString("es-AR")}`}
          </div>
          <div className="text-sm text-neutral-600">
            {storeName} · {selectedDate || "-"}
          </div>
        </div>

        {/* Tickets */}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">Tickets</div>
          <div className="text-3xl font-semibold">
            {loading ? "…" : kpis.tickets}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Cantidad de ventas confirmadas en el día.
          </p>
        </div>

        {/* Ticket promedio */}
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500 mb-1">Ticket promedio</div>
          <div className="text-3xl font-semibold">
            {loading
              ? "…"
              : `$${kpis.avgTicket.toLocaleString("es-AR", {
                  maximumFractionDigits: 2,
                })}`}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Total / cantidad de tickets.
          </p>
        </div>
      </section>

      {/* Pie explicativo */}
      <section className="rounded-xl border p-4 text-xs text-neutral-500">
        Basado solo en ventas con estado <strong>confirmed</strong> de la fecha
        seleccionada y la sucursal elegida. Usá este resumen como base para tu
        cierre de caja físico.
      </section>
    </main>
  );
}
