"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourlyConversionPoint } from "@/lib/analytics/conversion";
import { hourLabelAR } from "@/lib/analytics/time";

interface Props {
  data: HourlyConversionPoint[];
}

/**
 * Conversión por hora. Una sola serie (%), sin doble eje. Las horas sin
 * visitas quedan como hueco en la línea (no se dibuja un 0% que no existió).
 */
export function ConversionChart({ data }: Props) {
  const chartData = data.map((d) => ({
    hourLabel: hourLabelAR(d.hour),
    pct: d.rate === null ? null : Math.round(d.rate * 1000) / 10,
  }));
  const hasAnyData = chartData.some((d) => d.pct !== null);

  return (
    <div className="card">
      <h3>Conversión por hora</h3>
      {!hasAnyData ? (
        <p className="empty">Todavía no hay suficientes datos de hoy.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ stroke: "rgba(204,32,32,0.25)" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border, #e5e7eb)",
                fontSize: 13,
              }}
              formatter={(v) => [typeof v === "number" ? `${v}%` : "sin visitas", "Conversión"]}
              labelFormatter={(l) => `Hora ${l}`}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#cc2020"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
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
