"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

export default function TopProductsPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Top de productos</h1>
          <p className="text-sm text-muted-foreground">
            Reporte de productos más vendidos en un rango de fechas.
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Rango de fechas</h2>
        <DayPicker />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Resultados</h2>
        <p className="text-sm text-muted-foreground">
          TODO: conectar este reporte con los datos reales de ventas (Supabase).
        </p>
      </section>
    </main>
  );
}
