"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/analytics/types";
import { formatMoney } from "@/lib/analytics/formatMoney";
import { dayLabelAR, weekdayNameAR } from "@/lib/analytics/time";
import { dailyConversion } from "@/lib/analytics/trend";

interface Props {
  data: DailyPoint[];
  today: string;
}

interface ChartPoint {
  day: string;
  pct: number | null;
  tickets: number;
  revenue: number;
}

/**
 * Conversión por día (tickets confirmados ÷ visitas). Una sola serie (%), sin
 * doble eje. Un día sin visitas queda como hueco en la línea y "—" en el
 * detalle: no hay con qué dividir, no es que la conversión haya sido 0%.
 */
export function DailyConversionChart({ data, today }: Props) {
  const chartData: ChartPoint[] = data.map((d) => {
    const rate = dailyConversion(d);
    return {
      day: d.day,
      pct: rate === null ? null : Math.round(rate * 1000) / 10,
      tickets: d.tickets,
      revenue: d.revenue,
    };
  });
  const hasAnyData = chartData.some((d) => d.pct !== null);

  return (
    <div className="card">
      <h3>Conversión por día</h3>
      {!hasAnyData ? (
        <p className="empty">Todavía no hay días con visitas para calcular la conversión.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ stroke: "rgba(204,32,32,0.25)" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border, #e5e7eb)",
                fontSize: 13,
              }}
              content={({ active, payload }) => {
                const p = (payload?.[0] as { payload?: ChartPoint } | undefined)?.payload;
                if (!active || !p) return null;
                return (
                  <div
                    style={{
                      background: "var(--card, #fff)",
                      border: "1px solid var(--border, #e5e7eb)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      {weekdayNameAR(p.day)} {dayLabelAR(p.day)}
                      {p.day === today ? " (hoy, hasta ahora)" : ""}
                    </div>
                    <div style={{ color: "#cc2020", fontWeight: 600 }}>
                      Conversión: {p.pct === null ? "— (sin visitas)" : `${p.pct.toLocaleString("es-AR")}%`}
                    </div>
                    <div>
                      {p.tickets.toLocaleString("es-AR")} tickets · {formatMoney(p.revenue)}
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#cc2020"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
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
