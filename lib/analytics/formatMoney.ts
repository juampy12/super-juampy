/** Formatea un monto en pesos argentinos, sin decimales (misma convención que /reports y /cierres). */
export function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}
