import { describe, expect, it } from "vitest";
import { currentOccupancy, toOccupancySeries } from "../occupancy";
import type { CountRow } from "../types";

function row(id: number, ts: string, occupancy: number, entries = 0): CountRow {
  return { id, ts, entries, occupancy };
}

describe("currentOccupancy", () => {
  it("sin filas da null (no un 0 que no existió)", () => {
    expect(currentOccupancy([])).toBeNull();
  });

  it("toma la occupancy de la fila más reciente por ts", () => {
    const rows = [row(1, "2026-09-23T13:05:00Z", 4), row(2, "2026-09-23T13:10:00Z", 7)];
    expect(currentOccupancy(rows)).toBe(7);
  });

  it("no depende del orden del arreglo (los polls incrementales agregan por id)", () => {
    const rows = [row(3, "2026-09-23T13:10:00Z", 7), row(2, "2026-09-23T13:05:00Z", 4)];
    expect(currentOccupancy(rows)).toBe(7);
  });

  it("mismo ts: desempata por id mayor", () => {
    const rows = [row(5, "2026-09-23T13:10:00Z", 9), row(4, "2026-09-23T13:10:00Z", 2)];
    expect(currentOccupancy(rows)).toBe(9);
  });

  it("nunca negativo: occupancy < 0 se muestra como 0", () => {
    expect(currentOccupancy([row(1, "2026-09-23T13:05:00Z", -3)])).toBe(0);
  });
});

describe("toOccupancySeries", () => {
  it("devuelve [] sin filas", () => {
    expect(toOccupancySeries([])).toEqual([]);
  });

  it("usa occupancy como valor directo (no deltas), ordenado por ts", () => {
    const rows = [
      row(2, "2026-09-23T13:10:00Z", 3, 20),
      row(1, "2026-09-23T13:05:00Z", 8, 15),
      row(3, "2026-09-23T13:15:00Z", 5, 22),
    ];
    expect(toOccupancySeries(rows)).toEqual([
      { ts: "2026-09-23T13:05:00Z", occupancy: 8 },
      { ts: "2026-09-23T13:10:00Z", occupancy: 3 },
      { ts: "2026-09-23T13:15:00Z", occupancy: 5 },
    ]);
  });

  it("varias filas en el mismo minuto: se queda con la última", () => {
    const rows = [
      row(1, "2026-09-23T13:05:10Z", 4),
      row(2, "2026-09-23T13:05:40Z", 6),
      row(3, "2026-09-23T13:06:00Z", 5),
    ];
    expect(toOccupancySeries(rows)).toEqual([
      { ts: "2026-09-23T13:05:40Z", occupancy: 6 },
      { ts: "2026-09-23T13:06:00Z", occupancy: 5 },
    ]);
  });

  it("acota valores negativos a 0", () => {
    const rows = [row(1, "2026-09-23T13:05:00Z", -2), row(2, "2026-09-23T13:06:00Z", 1)];
    expect(toOccupancySeries(rows).map((p) => p.occupancy)).toEqual([0, 1]);
  });
});
