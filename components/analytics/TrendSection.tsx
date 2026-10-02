"use client";

import type { DailyResponse } from "@/lib/analytics/types";
import type { WeekdayComparison } from "@/lib/analytics/trend";
import { TREND_DAYS } from "@/lib/analytics/useDaily";
import { DailyConversionChart } from "./DailyConversionChart";
import { DailyVisitsChart } from "./DailyVisitsChart";
import { ErrorRetry } from "./ErrorRetry";
import { TodayVsAverageKpi } from "./TodayVsAverageKpi";

interface Props {
  daily: DailyResponse | null;
  comparison: WeekdayComparison | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * Tendencia de los últimos 14 días: "hoy vs. tu promedio" arriba, y debajo
 * visitas por día y conversión por día, lado a lado (dos gráficos de una
 * serie cada uno, sin doble eje).
 */
export function TrendSection({ daily, comparison, loading, error, onRetry }: Props) {
  return (
    <section className="trend">
      <h2>Tendencia (últimos {TREND_DAYS} días)</h2>
      {error ? <ErrorRetry message={error} onRetry={onRetry} /> : null}
      <TodayVsAverageKpi loading={loading} today={daily?.today ?? null} comparison={comparison} />
      {daily ? (
        <div className="grid">
          <DailyVisitsChart data={daily.days} today={daily.today} />
          <DailyConversionChart data={daily.days} today={daily.today} />
        </div>
      ) : loading ? (
        <div className="skeleton">Cargando…</div>
      ) : null}
      <style jsx>{`
        .trend {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        h2 {
          margin: 8px 0 0;
          font-size: 17px;
          color: var(--fg, #111827);
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 860px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
        .skeleton {
          color: var(--muted, #6b7280);
          font-size: 14px;
        }
      `}</style>
    </section>
  );
}
