import { describe, expect, it } from "vitest";
import { startOfDayArgentina, todayArgentina } from "../server";

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
