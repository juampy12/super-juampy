import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchTimeoutError, fetchWithTimeout } from "../fetchWithTimeout";

// Punto 1 de la auditoría: la caja no puede quedar trabada en "Confirmando..."
// si la conexión queda colgada. Relojes simulados: nada espera de verdad.

/** fetch que nunca responde, pero se corta si le abortan la señal (como el real). */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("responde a tiempo: devuelve status y cuerpo, y limpia el timer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 201 }))));

    const res = await fetchWithTimeout("/api/x", { method: "POST" }, 12_000);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no responde: corta exactamente al cumplirse el tiempo con FetchTimeoutError", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    let settled: unknown = "pendiente";
    const p = fetchWithTimeout("/api/x", {}, 12_000).then(
      () => (settled = "resolvió"),
      (e: unknown) => (settled = e),
    );

    await vi.advanceTimersByTimeAsync(11_999);
    expect(settled).toBe("pendiente");

    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBeInstanceOf(FetchTimeoutError);
    expect((settled as FetchTimeoutError).timeoutMs).toBe(12_000);
  });

  it("headers llegan pero el cuerpo queda colgado: también corta (no se cuelga en res.json())", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"ok":'));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
          },
        });
        return Promise.resolve(new Response(stream, { status: 200 }));
      }),
    );

    const p = fetchWithTimeout("/api/x", {}, 12_000);
    const assertion = expect(p).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it("error de red que no es timeout: se propaga tal cual (no se disfraza de timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    await expect(fetchWithTimeout("/api/x", {}, 12_000)).rejects.toThrow(TypeError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("status sin cuerpo (204) no rompe", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));

    const res = await fetchWithTimeout("/api/x", {}, 12_000);
    expect(res.status).toBe(204);
  });

  it("pasa method, headers y body al fetch real, con una señal de corte", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("/api/pos/confirm", { method: "POST", body: "{}" }, 20_000);

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
