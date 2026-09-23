"use client";

import { formatMoney } from "@/lib/analytics/formatMoney";

interface Props {
  loading: boolean;
  /** 0..1, o null si todavía no hay visitas registradas hoy. */
  rate: number | null;
  /** $ARS, o null si todavía no hay visitas registradas hoy. */
  revenuePerVisit: number | null;
}

/**
 * Visitas → ventas: los dos KPIs de conversión, arriba de todo el panel.
 * Sin visitas todavía (motor recién arrancando, o caído) no hay conversión
 * que calcular: se muestra "—" con una nota, nunca 0%.
 */
export function ConversionKpis({ loading, rate, revenuePerVisit }: Props) {
  const noTraffic = !loading && rate === null;

  return (
    <div className="conv-row">
      <Kpi
        label="Conversión hoy"
        value={loading ? "—" : rate !== null ? `${(rate * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"}
        sub={noTraffic ? "sin datos de tráfico aún" : "visitas que terminaron en una venta"}
      />
      <Kpi
        label="Valor por visita"
        value={loading ? "—" : revenuePerVisit !== null ? formatMoney(revenuePerVisit) : "—"}
        sub={noTraffic ? "sin datos de tráfico aún" : "ingreso promedio por persona que entra"}
      />

      <style jsx>{`
        .conv-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        @media (max-width: 640px) {
          .conv-row {
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
          border-top: 3px solid #cc2020;
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
