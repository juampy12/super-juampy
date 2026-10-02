import { describe, expect, it } from "vitest";
import { startOfDayArgentina, todayArgentina } from "../server";
import { dayAR, dayLabelAR, lastDays, shiftDay, timeLabelAR, weekdayNameAR } from "../time";

describe("todayArgentina (zona horaria)", () => {
  it("un mediodía UTC cae en el mismo día en Argentina", () => {
    expect(todayArgentina(new Date("2026-09-23T15:00:00Z"))).toBe("2026-09-23");
  });

  it("cruce de medianoche: 02:59 UTC todavía es el día anterior en Argentina (UTC-3)", () => {
    expect(todayArgentina(new Date("2026-09-23T02:59:00Z"))).toBe("2026-09-22");
  });

  it("cruce de medianoche: a las 03:00 UTC ya es el día siguiente en Argentina", () => {
    expect(todayArgentina(new Date("2026-09-23T03:00:00Z"))).toBe("2026-09-23");
  });

  it("no tiene horario de verano: el offset -3 se mantiene en cualquier época del año", () => {
    // 2026-01-15 (verano boreal / invierno... da igual, Argentina no cambia)
    expect(todayArgentina(new Date("2026-01-15T02:00:00Z"))).toBe("2026-01-14");
    expect(todayArgentina(new Date("2026-01-15T03:00:00Z"))).toBe("2026-01-15");
  });
});

describe("startOfDayArgentina", () => {
  it("arma el ISO con el offset -03:00 fijo", () => {
    expect(startOfDayArgentina("2026-09-23")).toBe("2026-09-23T00:00:00-03:00");
  });

  it("ese ISO corresponde efectivamente a las 03:00 UTC", () => {
    const iso = startOfDayArgentina("2026-09-23");
    expect(new Date(iso).toISOString()).toBe("2026-09-23T03:00:00.000Z");
  });
});

describe("timeLabelAR", () => {
  it("formatea HH:mm en hora de Argentina (UTC-3)", () => {
    expect(timeLabelAR("2026-09-23T17:05:00Z")).toBe("14:05");
  });

  it("cruce de medianoche: 02:30 UTC son las 23:30 del día anterior", () => {
    expect(timeLabelAR("2026-09-23T02:30:00Z")).toBe("23:30");
  });
});

describe("dayAR", () => {
  it("cruce de medianoche: 02:59 UTC es el día anterior en Argentina, 03:00 UTC ya es el siguiente", () => {
    expect(dayAR("2026-09-23T02:59:00Z")).toBe("2026-09-22");
    expect(dayAR("2026-09-23T03:00:00Z")).toBe("2026-09-23");
  });
});

describe("shiftDay / lastDays", () => {
  it("resta días cruzando mes y año", () => {
    expect(shiftDay("2026-10-02", -7)).toBe("2026-09-25");
    expect(shiftDay("2026-01-03", -7)).toBe("2025-12-27");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("lastDays devuelve n días terminando en hoy, del más viejo al más nuevo", () => {
    const days = lastDays("2026-10-02", 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-09-19");
    expect(days.at(-1)).toBe("2026-10-02");
  });

  it("7 días atrás cae en el mismo día de la semana", () => {
    expect(weekdayNameAR(shiftDay("2026-10-02", -7))).toBe(weekdayNameAR("2026-10-02"));
  });
});

describe("dayLabelAR / weekdayNameAR", () => {
  it("etiqueta dd/mm", () => {
    expect(dayLabelAR("2026-10-02")).toBe("02/10");
  });

  it("día de la semana en español", () => {
    expect(weekdayNameAR("2026-10-02")).toBe("viernes");
    expect(weekdayNameAR("2026-10-04")).toBe("domingo");
  });
});
