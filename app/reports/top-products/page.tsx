"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { startOfMonth, endOfMonth } from "date-fns";

export default function TopProductsPage() {
  const [month, setMonth] = useState<Date>(new Date());
  const from = startOfMonth(month);
  const to = endOfMonth(month);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Top Products</h1>
      <div className="max-w-sm">
        <DayPicker
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={month}
          captionLayout="dropdown"
        />
      </div>
      <p className="text-sm opacity-80">
        Rango sugerido: {from.toISOString().slice(0,10)} → {to.toISOString().slice(0,10)}
      </p>
      <div className="rounded-xl border p-4">
        {/* Placeholder no destructivo: acá iría la tabla/gráfico real */}
        <p>Placeholder: aún sin consulta a Supabase para no tocar datos.</p>
      </div>
    </div>
  );
}
