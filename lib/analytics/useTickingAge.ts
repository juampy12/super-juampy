"use client";

import { useEffect, useState } from "react";

export interface AgeBaseline {
  /** Antigüedad (segundos) calculada por el servidor en el momento del fetch. */
  seconds: number;
  /** Date.now() del navegador cuando se recibió ese baseline. */
  capturedAtMs: number;
}

/**
 * Antigüedad "en vivo" de un dato: arranca del valor que mandó el servidor
 * (calculado con SU reloj) y le va sumando localmente el tiempo transcurrido
 * desde que se recibió — nunca compara el ts del dato con el reloj del
 * navegador. Así un reloj de cliente desincronizado no hace que un dato
 * fresco se vea viejo (o viceversa).
 */
export function useTickingAge(baseline: AgeBaseline | null): number | null {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!baseline) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [baseline]);

  if (!baseline) return null;
  return baseline.seconds + Math.max(0, Math.floor((Date.now() - baseline.capturedAtMs) / 1000));
}
