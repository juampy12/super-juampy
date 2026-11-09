// fetch con límite de tiempo TOTAL (headers + cuerpo de la respuesta).
//
// Con internet inestable la conexión puede quedar "colgada": los paquetes
// salen y no vuelve nada, y el navegador puede tardar minutos en rendirse.
// En la caja eso deja el botón en "Confirmando..." con el cliente esperando;
// en el sync deja tomados los candados de la cola. Este helper corta a los
// `timeoutMs` y tira FetchTimeoutError, que los callers tratan igual que un
// error de red (la venta se encola / sigue en la cola, con la misma clave de
// idempotencia, así que si el servidor llegó a guardarla no se duplica).
//
// El cuerpo se lee DENTRO del límite y se devuelve en un Response nuevo:
// así un `await res.json()` posterior nunca puede colgarse esperando bytes.
// Usa AbortController + setTimeout (no AbortSignal.timeout) para soportar
// navegadores más viejos.

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`El servidor no respondió en ${Math.round(timeoutMs / 1000)} segundos`);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

// Status que por especificación no pueden llevar cuerpo en un Response.
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const body = NULL_BODY_STATUS.has(res.status) ? null : await res.text();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (e) {
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
