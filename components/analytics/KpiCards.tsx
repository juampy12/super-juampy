"use client";

import type { CountRow, HourlyPoint } from "@/lib/analytics/types";
import { formatAge } from "@/lib/analytics/formatAge";
import { hourNumberAR } from "@/lib/analytics/time";

interface Props {
  latest: CountRow | null;
  hourly: HourlyPoint[];
  loading: boolean;
  /** Antigüedad en vivo de `latest`, calculada por el servidor. */
  latestAgeSeconds: number | null;
}

/** Tres números clave del día: visitas totales, ocupación actual, hora pico. */
export function KpiCards({ latest, hourly, loading, latestAgeSeconds }: Props) {
  const totalEntries = hourly.reduce((a, h) => a + h.entries, 0);

  const peak = hourly.reduce<HourlyPoint | null>(
    (best, h) => (best === null || h.entries > best.entries ? h : best),
    null
  );
  const peakLabel = peak ? `${hourNumberAR(peak.hour)}:00 hs` : "—";

  // Mientras carga no hay que mostrar 0 como si fuera un dato real.
  const showValues = !loading;

  return (
    <div className="kpi-row">
      <Kpi label="Visitas hoy" value={showValues ? totalEntries.toLocaleString("es-AR") : "—"} />
      <Kpi
        label="Personas ahora"
        value={showValues && latest ? latest.occupancy.toLocaleString("es-AR") : "—"}
        sub={showValues && latestAgeSeconds != null ? `actualizado ${formatAge(latestAgeSeconds)}` : undefined}
      />
      <Kpi
        label="Hora pico"
        value={showValues ? peakLabel : "—"}
        sub={showValues && peak ? `${peak.entries} ingresos` : ""}
      />

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
