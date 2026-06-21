// SKUs puramente numéricos pueden venir con o sin ceros a la izquierda
// (ej: "4166" vs "000000004166", mismo EAN). Para SKUs con letras u
// otros caracteres no se toca nada — solo se recorta espacios.
export function normalizeSku(sku: string | null | undefined): string {
  const trimmed = String(sku ?? "").trim();
  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, "");
    return stripped === "" ? "0" : stripped;
  }
  return trimmed;
}
