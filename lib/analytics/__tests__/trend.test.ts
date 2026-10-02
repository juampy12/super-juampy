import { describe, expect, it } from "vitest";
import {
  buildDailySeries,
  compareToWeekdayAverage,
  dailyConversion,
  formatDiff,
  isEngineSilent,
  isLowTraffic,
} from "../trend";
import { formatAge } from "../formatAge";

describe("buildDailySeries", () => {
  const days = ["2026-09-30", "2026-10-01", "2026-10-02"];

  it("devuelve una fila por día, en orden, aunque no haya datos", () => {
    const out = buildDailySeries(days, new Map(), []);
    expect(out).toEqual([
      { day: "2026-09-30", visits: null, tickets: 0, revenue: 0 },
      { day: "2026-10-01", visits: null, tickets: 0, revenue: 0 },
      { day: "2026-10-02", visits: null, tickets: 0, revenue: 0 },
    ]);
  });

  it("día con conteos en 0 es 0 visitas, día sin conteos es null (motor sin datos)", () => {
    const out = buildDailySeries(days, new Map([["2026-09-30", 0], ["2026-10-01", null]]), []);
    expect(out.map((d) => d.visits)).toEqual([0, null, null]);
  });

  it("agrupa las ventas por día de Argentina y suma tickets y facturación", () => {
    const out = buildDailySeries(days, new Map([["2026-10-01", 120]]), [
      { created_at: "2026-10-01T15:00:00Z", total: 1500 },
      { created_at: "2026-10-01T18:30:00Z", total: 2500.5 },
      { created_at: "2026-10-02T14:00:00Z", total: 900 },
    ]);
    expect(out[1]).toEqual({ day: "2026-10-01", visits: 120, tickets: 2, revenue: 4000.5 });
    expect(out[2]).toEqual({ day: "2026-10-02", visits: null, tickets: 1, revenue: 900 });
  });

  it("cruce de medianoche: una venta a las 02:30 UTC es del día anterior en Argentina (UTC-3)", () => {
    const out = buildDailySeries(days, new Map(), [{ created_at: "2026-10-02T02:30:00Z", total: 100 }]);
    expect(out.map((d) => d.tickets)).toEqual([0, 1, 0]);
  });

  it("ignora ventas fuera del rango pedido y totales no numéricos", () => {
    const out = buildDailySeries(days, new Map(), [
      { created_at: "2026-09-20T15:00:00Z", total: 999 },
      { created_at: "2026-10-01T15:00:00Z", total: null as unknown as number },
    ]);
    expect(out.map((d) => d.tickets)).toEqual([0, 1, 0]);
    expect(out.map((d) => d.revenue)).toEqual([0, 0, 0]);
  });
});

describe("dailyConversion", () => {
  it("tickets / visitas", () => {
    expect(dailyConversion({ visits: 200, tickets: 50 })).toBeCloseTo(0.25);
  });

  it("visitas = 0 da null (división por cero), no Infinity/NaN", () => {
    expect(dailyConversion({ visits: 0, tickets: 5 })).toBeNull();
  });

  it("sin datos de visitas (null) da null", () => {
    expect(dailyConversion({ visits: null, tickets: 5 })).toBeNull();
  });

  it("0 tickets con visitas > 0 da 0, no null", () => {
    expect(dailyConversion({ visits: 100, tickets: 0 })).toBe(0);
  });
});

describe("compareToWeekdayAverage", () => {
  it("con menos de 3 semanas de historia no da ningún número", () => {
    expect(compareToWeekdayAverage(80, [])).toEqual({ status: "insufficient", samples: 0 });
    expect(compareToWeekdayAverage(80, [100, 120])).toEqual({ status: "insufficient", samples: 2 });
  });

  it("con 3 semanas ya compara: hoy arriba del promedio", () => {
    const out = compareToWeekdayAverage(120, [90, 100, 110]);
    expect(out).toMatchObject({ status: "ok", samples: 3, todayVisits: 120, average: 100 });
    expect(out.status === "ok" && out.diff).toBeCloseTo(0.2);
  });

  it("hoy abajo del promedio da diferencia negativa", () => {
    const out = compareToWeekdayAverage(60, [100, 100, 100, 100]);
    expect(out.status === "ok" && out.diff).toBeCloseTo(-0.4);
  });

  it("sin conteos de hoy (motor caído) no inventa un -100%", () => {
    expect(compareToWeekdayAverage(null, [100, 100, 100])).toEqual({ status: "no-data-today", samples: 3 });
  });

  it("promedio 0 (a esta hora nunca hay visitas): diff null, no Infinity", () => {
    const out = compareToWeekdayAverage(4, [0, 0, 0]);
    expect(out).toMatchObject({ status: "ok", average: 0, diff: null });
  });
});

describe("isLowTraffic", () => {
  it("avisa con -30% o más abajo", () => {
    expect(isLowTraffic(compareToWeekdayAverage(70, [100, 100, 100]))).toBe(true);
    expect(isLowTraffic(compareToWeekdayAverage(40, [100, 100, 100]))).toBe(true);
  });

  it("no avisa con una baja menor a 30% ni si va arriba", () => {
    expect(isLowTraffic(compareToWeekdayAverage(71, [100, 100, 100]))).toBe(false);
    expect(isLowTraffic(compareToWeekdayAverage(150, [100, 100, 100]))).toBe(false);
  });

  it("sin historia suficiente no avisa nunca (sin falsos positivos)", () => {
    expect(isLowTraffic(compareToWeekdayAverage(0, [100, 100]))).toBe(false);
  });

  it("sin datos de hoy no avisa (eso es problema del motor, no del tráfico)", () => {
    expect(isLowTraffic(compareToWeekdayAverage(null, [100, 100, 100]))).toBe(false);
  });

  it("con promedio muy chico (primera hora del día) no avisa: es ruido", () => {
    expect(isLowTraffic(compareToWeekdayAverage(1, [4, 5, 6]))).toBe(false);
    expect(isLowTraffic(compareToWeekdayAverage(0, [0, 0, 0]))).toBe(false);
  });
});

describe("isEngineSilent", () => {
  it("último latido de más de 10 minutos: sin señal", () => {
    expect(isEngineSilent(601)).toBe(true);
    expect(isEngineSilent(8 * 24 * 3600)).toBe(true);
  });

  it("hasta 10 minutos todavía no alerta", () => {
    expect(isEngineSilent(0)).toBe(false);
    expect(isEngineSilent(600)).toBe(false);
  });

  it("local sin ningún latido histórico (sin motor instalado): no alerta", () => {
    expect(isEngineSilent(null)).toBe(false);
  });
});

describe("formatDiff", () => {
  it("pone el signo y redondea a entero", () => {
    expect(formatDiff(0.204)).toBe("+20%");
    expect(formatDiff(-0.35)).toBe("−35%");
    expect(formatDiff(0.001)).toBe("0%");
  });
});

describe("formatAge", () => {
  it("segundos, minutos y horas", () => {
    expect(formatAge(2)).toBe("recién");
    expect(formatAge(40)).toBe("hace 40s");
    expect(formatAge(11 * 60)).toBe("hace 11 min");
    expect(formatAge(5 * 3600)).toBe("hace 5 h");
  });

  it("a partir de 2 días lo dice en días (un motor caído hace una semana)", () => {
    expect(formatAge(47 * 3600)).toBe("hace 47 h");
    expect(formatAge(8 * 24 * 3600)).toBe("hace 8 días");
  });
});
