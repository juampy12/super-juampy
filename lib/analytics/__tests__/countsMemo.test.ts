import { describe, expect, it } from "vitest";
import { applyCounts, type CountsMemo } from "../countsMemo";
import type { CountRow } from "../types";

function row(id: number, entries: number): CountRow {
  return { id, ts: `2026-09-23T10:00:${String(id).padStart(2, "0")}Z`, entries, occupancy: 0 };
}

describe("applyCounts", () => {
  it("sin memoria previa, reemplaza con la respuesta completa y toma el mayor id", () => {
    const res = { rows: [row(1, 1), row(2, 3)], day: "2026-09-23", latestAgeSeconds: 4 };
    const memo = applyCounts(null, res);
    expect(memo).toEqual({ day: "2026-09-23", rows: res.rows, lastId: 2 });
  });

  it("con memoria del mismo día, agrega solo las filas con id > lastId", () => {
    const memo: CountsMemo = { day: "2026-09-23", rows: [row(1, 1), row(2, 3)], lastId: 2 };
    const res = { rows: [row(1, 1), row(2, 3), row(3, 6)], day: "2026-09-23", latestAgeSeconds: 1 };
    const next = applyCounts(memo, res);
    expect(next.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(next.lastId).toBe(3);
  });

  it("sin filas nuevas, devuelve la MISMA referencia de memo (no recalcula aguas abajo)", () => {
    const memo: CountsMemo = { day: "2026-09-23", rows: [row(1, 1)], lastId: 1 };
    const res = { rows: [row(1, 1)], day: "2026-09-23", latestAgeSeconds: null };
    const next = applyCounts(memo, res);
    expect(next).toBe(memo);
  });

  it("si cambió el día, descarta lo acumulado y toma la respuesta como el día completo", () => {
    const memo: CountsMemo = { day: "2026-09-22", rows: [row(1, 50)], lastId: 1 };
    const res = { rows: [row(1, 2)], day: "2026-09-23", latestAgeSeconds: 3 };
    const next = applyCounts(memo, res);
    expect(next).toEqual({ day: "2026-09-23", rows: res.rows, lastId: 1 });
  });

  it("día vacío (sin filas nunca) no rompe el cálculo de lastId", () => {
    const res = { rows: [] as CountRow[], day: "2026-09-23", latestAgeSeconds: null };
    const memo = applyCounts(null, res);
    expect(memo).toEqual({ day: "2026-09-23", rows: [], lastId: 0 });
  });
});
