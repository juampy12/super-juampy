/** Formatea una antigüedad en segundos para mostrar "actualizado hace X". */
export function formatAge(seconds: number): string {
  if (seconds < 5) return "recién";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}
