/** Tipos del dominio de analítica. Reflejan las tablas de schema.sql. */

export interface CountRow {
  id: number;
  store_id: string;
  ts: string; // ISO timestamptz
  entries: number; // acumulado en la sesión del motor
  exits: number; // acumulado en la sesión del motor
  occupancy: number; // personas detectadas en ese instante
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
  peakOccupancy: number;
}

export interface HealthRow {
  id: number;
  store_id: string;
  camera_id: string;
  ts: string;
  fps: number;
  status: string; // "online" | "offline"
}

export interface ZoneDwellRow {
  id: number;
  store_id: string;
  ts: string;
  zone: string;
  dwell_seconds: number;
}

export interface Store {
  id: string;
  name: string;
}
