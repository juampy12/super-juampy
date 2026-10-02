"use client";

import { MIN_WEEKDAY_SAMPLES, formatDiff, type WeekdayComparison } from "@/lib/analytics/trend";
import { weekdayNameAR } from "@/lib/analytics/time";

interface Props {
  loading: boolean;
  /** Hoy (YYYY-MM-DD, hora de Argentina), para nombrar el día de la semana. */
  today: string | null;
  comparison: WeekdayComparison | null;
}

/** "jueves" → "jueves", "sábado" → "sábados". */
function plural(weekday: string): string {
  return weekday.endsWith("s") ? weekday : `${weekday}s`;
}

/**
 * "Hoy vs. tu promedio": visitas de hoy hasta ahora contra el promedio del
 * mismo día de la semana a esta misma hora. Verde si va arriba, rojo si va
 * abajo. Sin historia suficiente no se muestra ningún porcentaje.
 */
export function TodayVsAverageKpi({ loading, today, comparison }: Props) {
  const weekdays = today ? plural(weekdayNameAR(today)) : "días";

  let value = "—";
  let tone: "up" | "down" | "flat" = "flat";
  let sub = " ";

  if (!loading && comparison) {
    if (comparison.status === "insufficient") {
      sub = `Juntando más datos: hay ${comparison.samples} de ${MIN_WEEKDAY_SAMPLES} ${weekdays} necesarios para comparar`;
    } else if (comparison.status === "no-data-today") {
      sub = "todavía no hay datos de tráfico de hoy";
    } else if (comparison.diff === null) {
      sub = `los ${weekdays} a esta hora todavía no suele haber visitas`;
    } else {
      value = formatDiff(comparison.diff);
      const pct = Math.round(comparison.diff * 100);
      tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
      sub = `${comparison.todayVisits.toLocaleString("es-AR")} visitas hoy vs. ${Math.round(
        comparison.average
      ).toLocaleString("es-AR")} de promedio a esta hora (últimos ${comparison.samples} ${weekdays})`;
    }
  }

  return (
    <div className="kpi">
      <span className="kpi-label">Hoy vs. tu promedio</span>
      <span className={`kpi-value ${tone}`}>{value}</span>
      <span className="kpi-sub">{sub}</span>
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
        .kpi-value.up {
          color: #15803d;
        }
        .kpi-value.down {
          color: #cc2020;
        }
        .kpi-sub {
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
      `}</style>
    </div>
  );
}
