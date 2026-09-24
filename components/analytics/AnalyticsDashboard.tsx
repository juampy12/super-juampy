"use client";

import { useMemo, useState } from "react";
import { useTodayCounts } from "@/lib/analytics/useTodayCounts";
import { useLatestHeatmap } from "@/lib/analytics/useLatestHeatmap";
import { useDeviceStatus } from "@/lib/analytics/useDeviceStatus";
import { useZones } from "@/lib/analytics/useZones";
import { useSales } from "@/lib/analytics/useSales";
import { toHourly } from "@/lib/analytics/queries";
import { computeConversion, toHourlyConversion } from "@/lib/analytics/conversion";
import { currentOccupancy, toOccupancySeries } from "@/lib/analytics/occupancy";
import type { Store } from "@/lib/analytics/types";
import { KpiCards } from "./KpiCards";
import { ConversionKpis } from "./ConversionKpis";
import { ConversionChart } from "./ConversionChart";
import { HourlyTrafficChart } from "./HourlyTrafficChart";
import { OccupancyChart } from "./OccupancyChart";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { StorePicker } from "./StorePicker";
import { TopZones } from "./TopZones";
import { ErrorRetry } from "./ErrorRetry";

interface Props {
  stores: Store[];
}

/**
 * Panel de analítica de clientes para el POS.
 * Se actualiza por polling a medida que el motor de visión escribe métricas.
 */
export function AnalyticsDashboard({ stores }: Props) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const { rows, loading, error, refetch, latestAgeSeconds } = useTodayCounts(storeId);
  const { heatmap, ageSeconds: heatmapAge } = useLatestHeatmap(storeId);
  const device = useDeviceStatus(storeId);
  const { zones, loading: zonesLoading, error: zonesError, refetch: refetchZones } = useZones(storeId);
  const { sales, loading: salesLoading, error: salesError, refetch: refetchSales } = useSales(storeId);

  const hourly = useMemo(() => toHourly(rows), [rows]);
  const occupancyNow = useMemo(() => currentOccupancy(rows), [rows]);
  const occupancySeries = useMemo(() => toOccupancySeries(rows), [rows]);
  const totalVisits = useMemo(() => hourly.reduce((a, h) => a + h.entries, 0), [hourly]);
  const conversion = useMemo(
    () => computeConversion(sales.totalSales, sales.totalRevenue, totalVisits),
    [sales, totalVisits]
  );
  const hourlyConversion = useMemo(() => toHourlyConversion(sales.perHour, hourly), [sales, hourly]);

  const deviceLabel =
    device.totalCount === 0 ? "Sin señal" : `${device.onlineCount} de ${device.totalCount} cámaras en línea`;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Analítica de clientes</h1>
          <p className="privacy">
            Datos anónimos · no se guarda video ni se identifica a nadie
          </p>
        </div>
        <div className="head-right">
          <StorePicker stores={stores} value={storeId} onChange={setStoreId} />
          <span className={`live ${device.online ? "on" : ""}`}>
            <i /> {deviceLabel}
          </span>
        </div>
      </header>

      {error ? <ErrorRetry message={error} onRetry={refetch} /> : null}
      {loading ? <div className="skeleton">Cargando…</div> : null}

      <KpiCards
        occupancyNow={occupancyNow}
        hourly={hourly}
        loading={loading}
        latestAgeSeconds={latestAgeSeconds}
      />

      {salesError ? <ErrorRetry message={salesError} onRetry={refetchSales} /> : null}
      <ConversionKpis
        loading={loading || salesLoading}
        rate={conversion.rate}
        revenuePerVisit={conversion.revenuePerVisit}
      />

      <OccupancyChart data={occupancySeries} />

      <div className="grid">
        <HourlyTrafficChart data={hourly} />
        <HeatmapCanvas heatmap={heatmap} ageSeconds={heatmapAge} />
      </div>

      <ConversionChart data={hourlyConversion} />

      <TopZones zones={zones} loading={zonesLoading} error={zonesError} onRetry={refetchZones} />

      <style jsx>{`
        .dash {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 16px;
        }
        .dash-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        h1 {
          margin: 0;
          font-size: 22px;
          color: var(--fg, #111827);
          padding-left: 10px;
          border-left: 4px solid #cc2020;
        }
        .privacy {
          margin: 4px 0 0;
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
        .head-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
        .live i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #9ca3af;
        }
        .live.on i {
          background: #A8C62A;
          box-shadow: 0 0 0 3px rgba(168, 198, 42, 0.35);
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
    </div>
  );
}
