"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OccupancyPoint } from "@/lib/analytics/occupancy";
import { HOUR_MS, hourLabelAR, hourStartIso, timeLabelAR } from "@/lib/analytics/time";

interface Props {
  data: OccupancyPoint[];
}

/**
 * Personas dentro a lo largo del día. Una sola serie, mismo tono que "Ingresos
 * por hora". Eje X temporal real (no por categoría) con una marca por hora, y
 * línea escalonada: la ocupación se mantiene hasta la próxima lectura del motor.
 */
export function OccupancyChart({ data }: Props) {
  const chartData = data.map((d) => ({ t: new Date(d.ts).getTime(), occupancy: d.occupancy }));

  const ticks: number[] = [];
  if (chartData.length > 0) {
    const first = chartData[0].t;
    const last = chartData[chartData.length - 1].t;
    for (let t = new Date(hourStartIso(new Date(first).toISOString())).getTime(); t <= last; t += HOUR_MS) {
      if (t >= first) ticks.push(t);
    }
  }

  return (
    <div className="card">
      <h3>Ocupación durante el día</h3>
      {chartData.length === 0 ? (
        <p className="empty">Todavía no hay datos de hoy.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border, #eef0f2)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t: number) => hourLabelAR(new Date(t).toISOString())}
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
              cursor={{ stroke: "rgba(26,95,168,0.25)" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border, #e5e7eb)",
                fontSize: 13,
              }}
              formatter={(v) => [`${String(v)} personas`, ""]}
              labelFormatter={(t) => `${timeLabelAR(Number(t))} hs`}
            />
            <Line
              type="stepAfter"
              dataKey="occupancy"
              stroke="#1A5FA8"
              strokeWidth={2}
              dot={false}
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
