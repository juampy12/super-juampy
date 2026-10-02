"use client";

import { formatAge } from "@/lib/analytics/formatAge";
import { formatDiff, type WeekdayComparison } from "@/lib/analytics/trend";

interface Props {
  storeName: string;
  /** Antigüedad (segundos) del último latido si el motor está sin señal; `null` si no aplica. */
  engineSilentSeconds: number | null;
  /** Comparación de hoy contra el promedio si el tráfico viene bajo; `null` si no aplica. */
  lowTraffic: Extract<WeekdayComparison, { status: "ok" }> | null;
}

/**
 * Alertas del panel, arriba de todo y solo cuando aplican: "motor sin señal"
 * (fuerte: sin motor no hay datos confiables de nada) y "tráfico bajo hoy"
 * (aviso suave). Solo visuales — no mandan mail ni push.
 */
export function AlertBanners({ storeName, engineSilentSeconds, lowTraffic }: Props) {
  if (engineSilentSeconds === null && lowTraffic === null) return null;

  return (
    <div className="alerts">
      {engineSilentSeconds !== null ? (
        <div className="alert strong" role="alert">
          <strong>Motor sin señal</strong>
          <span>
            La cámara/motor de {storeName} no está enviando datos desde {formatAge(engineSilentSeconds)}. Las
            visitas y la ocupación de este panel están desactualizadas hasta que vuelva.
          </span>
        </div>
      ) : null}
      {lowTraffic !== null && lowTraffic.diff !== null ? (
        <div className="alert soft" role="status">
          <strong>Tráfico bajo hoy</strong>
          <span>
            {storeName} lleva {lowTraffic.todayVisits.toLocaleString("es-AR")} visitas, {formatDiff(lowTraffic.diff)}{" "}
            respecto de tu promedio a esta hora ({Math.round(lowTraffic.average).toLocaleString("es-AR")}).
          </span>
        </div>
      ) : null}
      <style jsx>{`
        .alerts {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .alert {
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
        }
        .strong {
          background: #cc2020;
          color: #fff;
          border: 1px solid #a81a1a;
        }
        .strong strong {
          font-size: 16px;
        }
        .soft {
          background: #fff8e6;
          color: #7a5300;
          border: 1px solid #f1d68a;
        }
      `}</style>
    </div>
  );
}
