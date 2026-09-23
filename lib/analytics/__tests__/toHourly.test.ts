import { describe, expect, it } from "vitest";
import { toHourly } from "../queries";
import type { CountRow } from "../types";

function row(id: number, ts: string, entries: number, occupancy = 0): CountRow {
  return { id, ts, entries, occupancy };
}

describe("toHourly", () => {
  it("devuelve [] sin filas", () => {
    expect(toHourly([])).toEqual([]);
  });

  it("resuelve la primera hora sin caso especial (prev virtual = 0)", () => {
    const rows = [row(1, "2026-09-23T13:05:00Z", 7)];
    const out = toHourly(rows);
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", entries: 7 }]);
  });

  it("suma deltas entre filas consecutivas dentro de la misma hora (telescópico)", () => {
    const rows = [
      row(1, "2026-09-23T13:05:00Z", 2),
      row(2, "2026-09-23T13:10:00Z", 5),
      row(3, "2026-09-23T13:15:00Z", 9),
    ];
    const out = toHourly(rows);
    // 2-0 + 5-2 + 9-5 = 9 (== el último acumulado, porque no hubo reinicio)
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", entries: 9 }]);
  });

  it("trata cur.entries < prev.entries como reinicio del motor (suma cur.entries)", () => {
    const rows = [
      row(1, "2026-09-23T13:05:00Z", 10),
      row(2, "2026-09-23T13:10:00Z", 15),
      row(3, "2026-09-23T13:15:00Z", 3), // el motor se reinició: 15 -> 3
    ];
    const out = toHourly(rows);
    // 10-0 + 15-10 + (reinicio: 3) = 18
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", entries: 18 }]);
  });

  it("un reinicio no afecta las horas ya cerradas, solo agrega al total de la hora del corte", () => {
    const rows = [
      row(1, "2026-09-23T13:05:00Z", 20),
      row(2, "2026-09-23T14:05:00Z", 5), // reinicio, ya en la hora siguiente
    ];
    const out = toHourly(rows);
    expect(out).toEqual([
      { hour: "2026-09-23T13:00:00.000Z", entries: 20 },
      { hour: "2026-09-23T14:00:00.000Z", entries: 5 },
    ]);
  });

  it("rellena huecos de horas sin filas con 0 ingresos", () => {
    const rows = [row(1, "2026-09-23T08:10:00Z", 4), row(2, "2026-09-23T11:10:00Z", 9)];
    const out = toHourly(rows);
    expect(out.map((h) => h.hour)).toEqual([
      "2026-09-23T08:00:00.000Z",
      "2026-09-23T09:00:00.000Z",
      "2026-09-23T10:00:00.000Z",
      "2026-09-23T11:00:00.000Z",
    ]);
    expect(out.map((h) => h.entries)).toEqual([4, 0, 0, 5]);
  });

  it("no asume las filas ya ordenadas por ts (ordena antes de calcular deltas)", () => {
    const rows = [
      row(2, "2026-09-23T13:10:00Z", 5),
      row(1, "2026-09-23T13:05:00Z", 2),
      row(3, "2026-09-23T13:15:00Z", 9),
    ];
    const out = toHourly(rows);
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", entries: 9 }]);
  });

  it("multi-cámara: solo importa la secuencia de entries recibida (ya filtrada a la cámara de entrada)", () => {
    // El heatmap/health de otras cámaras no pasa por acá — toHourly solo ve
    // filas de analytics_counts, que el motor solo escribe desde la cámara de
    // entrada. Este test documenta esa suposición con una secuencia normal.
    const rows = [row(1, "2026-09-23T09:00:30Z", 1), row(2, "2026-09-23T09:30:00Z", 3)];
    const out = toHourly(rows);
    expect(out).toEqual([{ hour: "2026-09-23T09:00:00.000Z", entries: 3 }]);
  });
});
