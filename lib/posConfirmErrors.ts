// Clasificación de errores de Postgres/PostgREST en /api/pos/confirm.
//
// Por qué importa: el cliente (ConfirmSaleButton y la cola offline) decide
// qué hacer según el status HTTP. Un 5xx = "servidor caído, reintentar";
// un 4xx = "rechazo real, mostrarlo / mandarlo a Ventas con error". Antes
// TODO error de la base volvía como 500, así que un error permanente (dato
// inválido) se reintentaba para siempre y al cajero se le decía "guardada".
//
// Regla: ANTE LA DUDA, PASAJERO. Solo se marca permanente lo que es seguro
// que no se arregla reintentando la misma venta.

export const IDEMPOTENCY_CONSTRAINT = "uq_sales_idempotency_key";

export type DbErrorKind =
  /** La venta ya está registrada (choque con el índice único de idempotencia). */
  | "duplicate_sale"
  /** Reintentar la misma venta no lo va a arreglar → 422. */
  | "permanent"
  /** Caída, timeout, bloqueo, o desconocido → 500 (el cliente reintenta). */
  | "transient";

type DbErrorLike =
  | { code?: string | null; message?: string | null; details?: string | null }
  | null
  | undefined;

export function classifyDbError(err: DbErrorLike): DbErrorKind {
  const code = String(err?.code ?? "").toUpperCase();
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;

  // unique_violation: solo es "venta ya registrada" si es el índice de
  // idempotencia; cualquier otro índice único es un dato inválido.
  if (code === "23505") {
    return text.includes(IDEMPOTENCY_CONSTRAINT) ? "duplicate_sale" : "permanent";
  }

  // raise_exception: RAISE EXCEPTION explícito de la RPC ('No items',
  // 'Item inválido: ...') — validación de datos, no un problema pasajero.
  if (code === "P0001") return "permanent";

  // Clase 22 (data exception: formato inválido, fuera de rango, división por
  // cero) y clase 23 (integrity constraint: CHECK, FK, NOT NULL).
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return "permanent";

  // Todo lo demás: conexión (08xxx), timeout (57014), deadlock/serialización
  // (40xxx), función inexistente por SQL sin aplicar (42883 / PGRST202),
  // errores sin código, etc.
  return "transient";
}
