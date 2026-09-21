"use client";

import type { CountRow, HourlyPoint } from "@/lib/analytics/types";

interface Props {
  latest: CountRow | null;
  hourly: HourlyPoint[];
}

/** Tres números clave del día: visitas totales, ocupación actual, hora pico. */
export function KpiCards({ latest, hourly }: Props) {
  const totalEntries = hourly.reduce((a, h) => a + h.entries, 0);
  const occupancy = latest?.occupancy ?? 0;

  const peak = hourly.reduce<HourlyPoint | null>(
    (best, h) => (best === null || h.entries > best.entries ? h : best),
    null
  );
  const peakLabel = peak ? `${new Date(peak.hour).getHours()}:00 hs` : "—";

  return (
    <div className="kpi-row">
      <Kpi label="Visitas hoy" value={totalEntries.toLocaleString("es-AR")} />
      <Kpi label="Personas ahora" value={occupancy.toLocaleString("es-AR")} />
      <Kpi label="Hora pico" value={peakLabel} sub={peak ? `${peak.entries} ingresos` : ""} />

      <style jsx>{`
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 640px) {
          .kpi-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub ? <span className="kpi-sub">{sub}</span> : null}
      <style jsx>{`
        .kpi {
          background: var(--card, #ffffff);
          border: 1px solid var(--border, #e5e7eb);
          border-top: 3px solid #1a5fa8;
          border-radius: 14px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .kpi-label {
          font-size: 13px;
          color: var(--muted, #6b7280);
        }
        .kpi-value {
          font-size: 30px;
          font-weight: 700;
          color: var(--fg, #111827);
          line-height: 1.1;
        }
        .kpi-sub {
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
      `}</style>
    </div>
  );
}
