import { describe, expect, it } from "vitest";
import { computeConversion, toHourlyConversion } from "../conversion";
import type { HourlyPoint, SalesHourPoint } from "../types";

describe("computeConversion", () => {
  it("calcula tasa e ingreso por visita con visitas > 0", () => {
    const out = computeConversion(25, 50_000, 200);
    expect(out.rate).toBeCloseTo(0.125);
    expect(out.revenuePerVisit).toBeCloseTo(250);
  });

  it("visitas = 0 da null en vez de Infinity/NaN (división por cero)", () => {
    const out = computeConversion(5, 10_000, 0);
    expect(out).toEqual({ rate: null, revenuePerVisit: null });
  });

  it("visitas negativas (dato corrupto) también se tratan como sin datos", () => {
    const out = computeConversion(5, 10_000, -1);
    expect(out).toEqual({ rate: null, revenuePerVisit: null });
  });

  it("0 ventas con visitas > 0 da conversión 0, no null (sí hay con qué dividir)", () => {
    const out = computeConversion(0, 0, 100);
    expect(out).toEqual({ rate: 0, revenuePerVisit: 0 });
  });
});

describe("toHourlyConversion", () => {
  function sale(hour: string, sales: number, revenue = sales * 1000): SalesHourPoint {
    return { hour, sales, revenue };
  }
  function visit(hour: string, entries: number): HourlyPoint {
    return { hour, entries };
  }

  it("sin datos en ninguna de las dos series, da []", () => {
    expect(toHourlyConversion([], [])).toEqual([]);
  });

  it("cruza ventas y visitas de la misma hora", () => {
    const out = toHourlyConversion(
      [sale("2026-09-23T13:00:00.000Z", 5)],
      [visit("2026-09-23T13:00:00.000Z", 20)]
    );
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", rate: 0.25 }]);
  });

  it("hora con visitas pero sin ventas: conversión 0 (no null)", () => {
    const out = toHourlyConversion([], [visit("2026-09-23T13:00:00.000Z", 20)]);
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", rate: 0 }]);
  });

  it("hora con ventas pero sin visitas registradas: null (división por cero), no Infinity", () => {
    const out = toHourlyConversion([sale("2026-09-23T13:00:00.000Z", 3)], []);
    expect(out).toEqual([{ hour: "2026-09-23T13:00:00.000Z", rate: null }]);
  });

  it("rellena huecos de horas entre la primera y la última con rate null si no hay visitas", () => {
    const out = toHourlyConversion(
      [],
      [visit("2026-09-23T08:00:00.000Z", 10), visit("2026-09-23T10:00:00.000Z", 5)]
    );
    expect(out.map((h) => h.hour)).toEqual([
      "2026-09-23T08:00:00.000Z",
      "2026-09-23T09:00:00.000Z",
      "2026-09-23T10:00:00.000Z",
    ]);
    // La hora 09 no tiene visitas: sin datos, no 0% ni conversión inventada.
    expect(out.map((h) => h.rate)).toEqual([0, null, 0]);
  });
});
