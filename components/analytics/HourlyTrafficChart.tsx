"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyPoint } from "@/lib/analytics/types";

interface Props {
  data: HourlyPoint[];
}

/**
 * Ingresos por hora. Una sola serie (magnitud) => un único tono secuencial.
 * Sin doble eje, sin arcoíris: la barra dice cuánta gente entró en cada hora.
 */
export function HourlyTrafficChart({ data }: Props) {
  const chartData = data.map((d) => ({
    hourLabel: `${new Date(d.hour).getHours()}h`,
    entries: d.entries,
  }));

  return (
    <div className="card">
      <h3>Ingresos por hora</h3>
      {chartData.length === 0 ? (
        <p className="empty">Todavía no hay datos de hoy.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border, #eef0f2)" />
            <XAxis
              dataKey="hourLabel"
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
              formatter={(v: number) => [`${v} ingresos`, ""]}
              labelFormatter={(l) => `Hora ${l}`}
            />
            <Bar dataKey="entries" fill="#1A5FA8" radius={[4, 4, 0, 0]} maxBarSize={38} />
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
