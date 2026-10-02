"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/analytics/types";
import { dayLabelAR, weekdayNameAR } from "@/lib/analytics/time";

interface Props {
  data: DailyPoint[];
  /** Hoy (YYYY-MM-DD): su barra va en un tono más claro porque el día no terminó. */
  today: string;
}

/**
 * Visitas por día (max de `entries` de cada día). Una sola serie, mismo tono
 * que "Ingresos por hora". Un día sin datos del motor queda sin barra (no se
 * dibuja un 0 que no existió).
 */
export function DailyVisitsChart({ data, today }: Props) {
  const chartData = data.map((d) => ({ day: d.day, visits: d.visits }));
  const hasAnyData = chartData.some((d) => d.visits !== null);

  return (
    <div className="card">
      <h3>Visitas por día</h3>
      {!hasAnyData ? (
        <p className="empty">Todavía no hay datos de visitas en estos días.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border, #eef0f2)" />
            <XAxis
              dataKey="day"
              tickFormatter={dayLabelAR}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "var(--muted, #6b7280)" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "var(--muted, #6b7280)" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(26,95,168,0.08)" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border, #e5e7eb)",
                fontSize: 13,
              }}
              formatter={(v) => [typeof v === "number" ? `${v.toLocaleString("es-AR")} visitas` : "sin datos", ""]}
              labelFormatter={(l) => {
                const day = String(l);
                return `${weekdayNameAR(day)} ${dayLabelAR(day)}${day === today ? " (hoy, hasta ahora)" : ""}`;
              }}
            />
            <Bar dataKey="visits" radius={[4, 4, 0, 0]} maxBarSize={38}>
              {chartData.map((d) => (
                <Cell key={d.day} fill={d.day === today ? "#8fb5dc" : "#1A5FA8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <style jsx>{`
        .card {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 14px;
          padding: 18px 20px;
        }
        h3 {
          margin: 0 0 12px;
          font-size: 15px;
          color: var(--fg, #111827);
        }
        .empty {
          color: var(--muted, #6b7280);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
