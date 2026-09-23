import type { HeatmapRow } from "./types";

const MAX_DIM = 256;

/**
 * Valida la forma de una grilla de calor antes de dibujarla: `cols`/`rows`
 * enteros entre 1 y 256, y `grid` con exactamente `rows` filas de `cols`
 * valores numéricos finitos cada una. Datos corruptos o de una versión de
 * motor incompatible no deben dibujarse (mejor un aviso que un canvas roto o
 * una grilla que no corresponde a lo que dice `cols`/`rows`).
 */
export function isValidHeatmap(h: HeatmapRow): boolean {
  if (!Number.isInteger(h.cols) || h.cols < 1 || h.cols > MAX_DIM) return false;
  if (!Number.isInteger(h.rows) || h.rows < 1 || h.rows > MAX_DIM) return false;
  if (!Array.isArray(h.grid) || h.grid.length !== h.rows) return false;
  for (const row of h.grid) {
    if (!Array.isArray(row) || row.length !== h.cols) return false;
    for (const v of row) {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
    }
  }
  return true;
}
