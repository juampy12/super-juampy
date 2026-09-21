"use client";

import type { ZoneSeconds } from "@/lib/analytics/types";

interface Props {
  /** Zonas con su permanencia del día, de mayor a menor. */
  zones: ZoneSeconds[];
  loading?: boolean;
  error?: string | null;
}

/**
 * Ranking de zonas por permanencia: nombre, barra proporcional a su % del total y
 * el porcentaje. La zona de menor tránsito se marca como oportunidad de reubicar
 * productos (solo si hay al menos dos zonas: con una sola sería a la vez la más
 * caliente y la más fría).
 */
export function TopZones({ zones, loading = false, error = null }: Props) {
  const ranked = zones.filter((z) => z.seconds > 0);
  const total = ranked.reduce((a, z) => a + z.seconds, 0);
  const coldZone = ranked.length >= 2 ? ranked[ranked.length - 1].zone : null;

  return (
    <div className="card">
      <h3>Zonas más calientes</h3>
      <p className="sub">
        Dónde para la gente. Las zonas frías son oportunidad de reubicar productos.
      </p>

      {ranked.length === 0 ? (
        <p className="empty">
          {error
            ? `No pude cargar las zonas: ${error}`
            : loading
              ? "Cargando…"
              : "Todavía no hay zonas con datos."}
        </p>
      ) : (
        <ol className="list">
          {ranked.map((z, i) => {
            const pct = (z.seconds / total) * 100;
            const isCold = z.zone === coldZone;
            return (
              <li key={z.zone} className="row">
                <span className="rank">{i + 1}</span>
                <span className="name">
                  {z.zone}
                  {isCold ? <em className="tag">zona fría · oportunidad</em> : null}
                </span>
                <span className="track" aria-hidden="true">
                  <span className="bar" style={{ width: `${pct}%` }} />
                </span>
                <span className="pct">{pct < 1 ? "<1%" : `${Math.round(pct)}%`}</span>
              </li>
            );
          })}
        </ol>
      )}

      <style jsx>{`
        .card {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 14px;
          padding: 18px 20px;
        }
        h3 {
          margin: 0;
          font-size: 15px;
          color: var(--fg, #111827);
        }
        .sub {
          margin: 4px 0 14px;
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
        .empty {
          margin: 0;
          font-size: 14px;
          color: var(--muted, #6b7280);
        }
        .list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .row {
          display: grid;
          grid-template-columns: 20px minmax(120px, 240px) 1fr 44px;
          align-items: center;
          gap: 12px;
        }
        .rank {
          font-size: 12px;
          color: var(--muted, #6b7280);
          text-align: right;
        }
        .name {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px 8px;
          font-size: 14px;
          color: var(--fg, #111827);
        }
        .tag {
          font-style: normal;
          font-size: 11px;
          font-weight: 600;
          color: #cc2020;
          background: #fdf1f1;
          border: 1px solid #f3c4c4;
          border-radius: 999px;
          padding: 1px 8px;
          white-space: nowrap;
        }
        .track {
          height: 10px;
          border-radius: 5px;
          background: var(--border, #e5e7eb);
          overflow: hidden;
        }
        .bar {
          display: block;
          height: 100%;
          border-radius: 5px;
          background: #1a5fa8;
        }
        .pct {
          font-size: 13px;
          font-weight: 600;
          text-align: right;
          color: var(--fg, #111827);
        }
        @media (max-width: 560px) {
          .row {
            grid-template-columns: 20px 1fr 40px;
          }
          .track {
            grid-column: 2 / 4;
            grid-row: 2;
          }
        }
      `}</style>
    </div>
  );
}
