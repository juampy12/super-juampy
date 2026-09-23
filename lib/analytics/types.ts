/** Tipos del dominio de analítica. Reflejan las tablas de schema.sql. */

export interface CountRow {
  id: number;
  ts: string; // ISO timestamptz
  entries: number; // acumulado del día, persiste entre reinicios del motor
  occupancy: number; // entries - exits ya resuelto por el motor (personas dentro)
}

export interface HeatmapRow {
  id: number;
  store_id: string;
  ts: string;
  cols: number;
  rows: number;
  grid: number[][]; // [rows][cols], valores 0..1
}

export interface HourlyPoint {
  hour: string; // ISO, truncado a la hora
  entries: number; // ingresos en esa hora
}

/** Último latido de una cámara puntual (multi-cámara: una fila por camera_id). */
export interface HealthRow {
  id: number;
  camera_id: string;
  ts: string;
  fps: number;
  status: string; // "online" | "offline", tal cual lo escribe el motor
  /** Antigüedad del latido en segundos, calculada por el servidor (no el reloj del navegador). */
  ageSeconds: number;
  /** status === "online" && ageSeconds por debajo del umbral de "sin señal". */
  online: boolean;
}

export interface HealthResponse {
  cameras: HealthRow[];
  onlineCount: number;
  totalCount: number;
}

/** Permanencia total del día en una zona (suma de analytics_zone_dwell). */
export interface ZoneSeconds {
  zone: string;
  seconds: number;
}

/** Ventas confirmadas de una hora puntual (para cruzar con visitas y calcular conversión). */
export interface SalesHourPoint {
  hour: string; // ISO, truncado a la hora (misma clave que HourlyPoint.hour)
  sales: number;
  revenue: number;
}

/** public.sales de hoy (hora de Argentina), solo lectura — nunca se escribe desde acá. */
export interface SalesResponse {
  totalSales: number;
  totalRevenue: number;
  perHour: SalesHourPoint[];
}

export interface Store {
  id: string;
  name: string;
}
