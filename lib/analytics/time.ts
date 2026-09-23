// Utilidades de horario en zona Argentina (isomórficas: se usan tanto en las
// rutas /api/analytics/* como en los componentes cliente). Argentina no tiene
// horario de verano, así que el offset es -3 fijo todo el año.

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Hora 0..23 de un timestamp ISO, en hora de Argentina. */
export function hourNumberAR(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AR_TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Etiqueta corta de hora para gráficos (ej. "14h"), en hora de Argentina. */
export function hourLabelAR(iso: string): string {
  return `${hourNumberAR(iso)}h`;
}
