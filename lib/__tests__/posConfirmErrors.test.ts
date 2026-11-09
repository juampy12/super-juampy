import { describe, expect, it } from "vitest";
import { classifyDbError } from "../posConfirmErrors";

// Punto 2 de la auditoría: separar errores permanentes (422, no se
// reintentan para siempre) de pasajeros (500, el cliente reintenta).
// Regla: ante la duda, pasajero.

describe("classifyDbError", () => {
  it("23505 sobre uq_sales_idempotency_key → venta ya registrada", () => {
    expect(
      classifyDbError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_sales_idempotency_key"',
        details: "Key ((payment ->> 'idempotency_key'::text))=(abc) already exists.",
      }),
    ).toBe("duplicate_sale");
  });

  it("23505 sobre otro índice único → permanente (no es la misma venta)", () => {
    expect(
      classifyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "otro_idx"' }),
    ).toBe("permanent");
  });

  it.each([
    ["P0001", "Item inválido: {...}"], // RAISE EXCEPTION de la RPC
    ["22P02", 'invalid input syntax for type uuid: "x"'],
    ["22003", "numeric field overflow"],
    ["22012", "division by zero"],
    ["23514", 'new row violates check constraint "chk_sales_total_positive"'],
    ["23503", "insert or update violates foreign key constraint"],
    ["23502", "null value in column violates not-null constraint"],
  ])("%s → permanente", (code, message) => {
    expect(classifyDbError({ code, message })).toBe("permanent");
  });

  it.each([
    ["08006", "connection failure"],
    ["57014", "canceling statement due to statement timeout"],
    ["40P01", "deadlock detected"],
    ["40001", "could not serialize access"],
    ["55P03", "lock not available"],
    ["42883", "function does not exist"], // SQL todavía no aplicado
    ["PGRST202", "Could not find the function"],
    ["XX000", "internal error"],
  ])("%s → pasajero", (code, message) => {
    expect(classifyDbError({ code, message })).toBe("transient");
  });

  it("sin código, null o undefined → pasajero", () => {
    expect(classifyDbError({ message: "fetch failed" })).toBe("transient");
    expect(classifyDbError({ code: "", message: "" })).toBe("transient");
    expect(classifyDbError(null)).toBe("transient");
    expect(classifyDbError(undefined)).toBe("transient");
  });
});
