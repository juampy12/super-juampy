# Auditoría Funcional — Super Juampy POS
**Fecha:** 2026-06-30  
**Alcance:** flujo de venta, sesión, cierre de caja, offline, scanner  
**Revisado por:** auditoría automática del código fuente  
**Estado del branch:** `main` (limpio, sin cambios pendientes)

---

## 1. LOGIN Y PERSISTENCIA DE SESIÓN

### Cómo funciona

El login POST a `/api/employee/login` verifica código + PIN vía RPC de Supabase (`verify_employee_pin`). Si es correcto, genera un JWT firmado con HS256 (lib `jose`) con expiración fija de **12 horas** y lo guarda como cookie `sj_pos_auth` (httpOnly, secure, sameSite=strict). Además, guarda los datos del empleado en `localStorage["sj_pos_employee"]`.

El middleware (`middleware.ts`) verifica la cookie JWT en cada request antes de llegar a los API handlers. Si la cookie falta o el token expiró, redirige a `/pos-login`.

Los API handlers también verifican la sesión de forma independiente vía `getSessionFromRequest()` → `verifySession()`.

---

## 🔴 BLOQUEANTE 1 — JWT expira durante el turno sin renovación automática

**Dispara cuando:** el cajero inicia sesión al comienzo del turno (p.ej., 8 PM) y trabaja más de 12 horas seguidas sin recargar la página — o si la página fue cargada el día anterior.

**Impacto:** cualquier llamada a la API devuelve error. El middleware redirige `/api/pos/confirm` a la página de login; `fetch()` sigue el redirect 307 y recibe un 405 (POST a ruta de página sin handler). El `ConfirmSaleButton` muestra un alert con "Error al confirmar: undefined" o similar, **no encola la venta**, y el carrito queda cargado pero no se puede confirmar. El cajero se queda bloqueado con un error críptico hasta que recarga y re-loguea, momento en que **el carrito en memoria se pierde**.

**Evidencia:**
- `lib/jwt.ts` línea 22: `.setExpirationTime("12h")`
- `app/api/employee/login/route.ts` línea 79: `maxAge: 60 * 60 * 12`
- `components/ConfirmSaleButton.tsx` líneas 158-176: errores 4xx van a `alert()` y no al queue
- No existe ningún mecanismo de token refresh

**Fix sugerido:** renovar el token automáticamente en el middleware cuando quedan menos de 2h (sliding session), o hacer `/api/pos/confirm` detectar 401/redirect y mostrar un toast claro "Tu sesión expiró — recargá y volvé a ingresar", encolando la venta antes de redirigir.

---

## 🔴 BLOQUEANTE 2 — Carga de página en modo completamente offline

**Dispara cuando:** el dispositivo de caja no tiene conexión a internet cuando el cajero navega a `/ventas` (por ejemplo, primer arranque del día con router caído).

**Impacto:** los fetch a `/api/stores` y `/api/registers` fallan. `selectedStoreId` queda `null`. El buscador muestra "Elegí una sucursal antes de buscar" y el botón confirmar muestra alert "Falta sucursal". El cajero **no puede buscar ni vender** aunque el cache de productos en IndexedDB ya esté cargado de la sesión anterior.

**Evidencia:**
- `app/ventas/page.tsx` líneas 721-731: el efecto de stores no tiene fallback al store_id del localStorage
- `app/ventas/page.tsx` línea 891: `if (!selectedStoreId) { toast("Elegí una sucursal antes de buscar."); return; }`
- `lib/productCache.ts` función `initProductCache()`: solo corre cuando `selectedStoreId` está seteado (líneas 742-745)

**Fix sugerido:** en el efecto de carga de stores, si el fetch falla y `posEmployeeRef.current?.store_id` está disponible en localStorage, usarlo como fallback: `setSelectedStoreId(posEmployeeRef.current.store_id)`. Lo mismo para `register_id`.

---

## 🟡 MOLESTO 3 — Impresión de ticket no va directo a impresora térmica

**Dispara cuando:** el cajero hace clic en "Imprimir ticket" tras confirmar una venta.

**Impacto:** `exportReceiptPDF()` genera un archivo PDF de 80mm y lo **descarga** al dispositivo (`doc.save(file)`). El cajero debe: 1) esperar la descarga, 2) abrir el archivo desde el gestor de descargas, 3) enviar a imprimir desde el visor de PDF, 4) elegir la impresora. En algunos browsers el popup de descarga puede estar bloqueado. No hay integración ESC/POS ni impresión directa a impresora térmica.

**Evidencia:**
- `app/_utils/receipt.ts` línea 106: `doc.save(file)` (browser download)
- `components/ConfirmSaleButton.tsx` línea 205: `await exportReceiptPDF(...)` tras confirmar

**Fix sugerido:** para una caja con impresora térmica, integrar `escpos` o `qz-tray`. Como mínimo en el corto plazo, considerar `window.print()` con CSS de impresión `@page { size: 80mm auto }` que sí abre el diálogo de impresión directamente.

---

## 🟡 MOLESTO 4 — `window.prompt()` para productos pesables bloquea el UI

**Dispara cuando:** el cajero agrega un producto marcado como pesable (`is_weighted = true`) buscando por nombre/SKU (no por balanza).

**Impacto:** `window.prompt()` es un diálogo modal nativo que bloquea todo el procesamiento de eventos. En dispositivos Android/iOS, el diálogo puede aparecer desplazado, sin etiqueta clara, o directamente bloqueado por el browser. Si el cajero presiona "Cancelar" o cierra el diálogo, el producto no se agrega (comportamiento correcto pero confuso). No funciona si el dispositivo está en modo kiosco con prompts deshabilitados.

**Evidencia:**
- `app/ventas/page.tsx` línea 985: `const gramsStr = window.prompt(...)`
- `app/ventas/page.tsx` línea 1031: segundo `window.prompt()` en `addToCart()`

**Fix sugerido:** reemplazar `window.prompt()` con un modal React inline (similar al PosVoidModal existente) que pida los gramos con un input y botones de Confirmar/Cancelar.

---

## 🟡 MOLESTO 5 — Código de supervisor pre-llenado en modal de anulación

**Dispara cuando:** el cajero abre el modal de anulación desde el POS (botón "Anular" en "Últimas ventas").

**Impacto:** el campo "Código supervisor" aparece pre-llenado con `"900"` (línea 175 de `app/ventas/page.tsx`). Si ese es el código real del supervisor, cualquier cajero que vea la pantalla lo conoce. Es un leak de información.

**Evidencia:**
- `app/ventas/page.tsx` línea 175: `const [supervisorCode, setSupervisorCode] = useState("900");`

**Fix sugerido:** inicializar el campo vacío: `useState("")`.

---

## 🟡 MOLESTO 6 — Ventas en queue offline se abandonan silenciosamente tras 3 errores 4xx

**Dispara cuando:** el cajero hace ventas offline, se reconecta, y alguna de esas ventas tiene datos inválidos (por ejemplo, un producto fue desactivado mientras el sistema estaba offline).

**Impacto:** después de 3 intentos, la venta es removida del queue sin que el cajero pueda recuperar los datos de qué se vendió. El toast dice "⚠️ Venta no pudo sincronizarse después de 3 intentos. Revisá el historial." pero no hay log accesible ni forma de saber qué ítems tenía esa venta.

**Evidencia:**
- `lib/offlineQueue.ts` líneas 88-96: `abandoned++` tras 3 intentos 4xx
- `lib/useOnlineSync.ts` línea 34: toast genérico sin detalle de la venta

**Fix sugerido:** antes de descartar una venta abandonada, guardar su payload en un localStorage de "ventas fallidas" (`pos_failed_sales_v1`) y mostrar una UI de revisión para que el supervisor pueda ingresarla manualmente.

---

## 🟡 MOLESTO 7 — Ventas pendientes offline no se sincronizan automáticamente al recargar la página estando online

**Dispara cuando:** el cajero hizo ventas offline, cerró el browser, y volvió a abrir la página ya con internet.

**Impacto:** el badge naranja "⚠️ 2 pendientes" aparece, pero la sincronización automática **solo se dispara** en el evento `window.online` (reconexión). Si la página carga directamente online con ventas pendientes en el queue, el cajero debe presionar el badge manualmente para sincronizar. No es obvio que ese badge sea clickeable.

**Evidencia:**
- `lib/useOnlineSync.ts` líneas 44-67: sync solo en `handleOnline`, no en mount
- `app/ventas/page.tsx` línea 1447-1454: badge clickeable pero no se autocompleta

**Fix sugerido:** agregar `if (online && getQueue().length > 0) sync()` en el `useEffect` de montaje de `useOnlineSync`.

---

## 🟡 MOLESTO 8 — cuenta_corriente en pagos mixtos no se muestra correctamente en el pre-cierre

**Dispara cuando:** hubo ventas del día con método "mixto" que incluyen efectivo + cuenta corriente.

**Impacto:** en la pantalla de cierre de caja (antes de guardar), el total de "Cuenta corriente" puede aparecer como $0 para el componente de cuenta corriente dentro de ventas mixtas. El cierre guardado en DB sí es correcto (usa `computeClosureTotals.ts` que lee `cuenta_corriente`), pero el display puede confundir al supervisor.

**Evidencia:**
- `/api/cash-closure/route.ts` línea 233: `const account = safeNumber(breakdown.account ?? 0)` — lee `.account` pero la DB guarda `.cuenta_corriente`
- `/api/pos/confirm/route.ts` líneas 189-193: normaliza a `clean.cuenta_corriente`
- `lib/computeClosureTotals.ts` línea 76: `bd.cuenta_corriente ?? bd.account` — correcto
- Discrepancia entre las dos rutas

**Fix sugerido:** en `/api/cash-closure/route.ts` línea 233, cambiar `breakdown.account` por `breakdown.cuenta_corriente ?? breakdown.account`.

---

## 🟢 MENOR 9 — Rate limiter en memoria se resetea con cada deploy

**Dispara cuando:** hay un ataque de fuerza bruta contra PINs y el servidor se reinicia (deploy en Vercel, cold start de nueva instancia).

**Impacto:** el contador de intentos fallidos vuelve a 0 en cada instancia serverless. Un atacante que rota IPs o apunta a instancias distintas puede exceder el límite de 5 intentos sin ser bloqueado.

**Evidencia:**
- `lib/rateLimiter.ts` línea 12: `const store = new Map<string, Record>();` (in-memory)

**Fix sugerido:** mover el contador a Redis o Supabase para que persista entre instancias. Alternativa de bajo costo: usar la tabla de Supabase ya existente.

---

## 🟢 MENOR 10 — SUPERVISOR_PIN comparado en texto plano

**Dispara cuando:** se usa el endpoint de elevación de permisos del cajero en el POS.

**Impacto:** el PIN del supervisor (para cambiar de rol cajero → supervisor en la UI, sin anular ventas) se guarda como variable de entorno en texto plano y se compara directamente.

**Evidencia:**
- `app/api/employee/verify-supervisor-pin/route.ts` línea 30-31:
  ```ts
  const serverPin = process.env.SUPERVISOR_PIN ?? "";
  const valid = pin === serverPin;
  ```

**Fix sugerido:** hashear el PIN con bcrypt al configurar y comparar con `bcrypt.compare()`, igual que lo hace el RPC `verify_employee_pin` de Supabase.

---

## 🟢 MENOR 11 — Holds (ventas en espera) no están asociados a ningún empleado

**Dispara cuando:** el cajero A pone una venta en espera y el cajero B toma la misma caja.

**Impacto:** el cajero B ve los holds del cajero A en el panel "Retomar". Puede retomar (y cobrar) una venta que no es suya.

**Evidencia:**
- `app/ventas/lib/hold.ts` línea 17: `const HOLD_KEY = "pos_holds_v2"` — sin discriminación por empleado

**Fix sugerido:** incluir el `employee_id` en el hold y filtrar en `getHolds()` solo los del empleado actual.

---

## 🟢 MENOR 12 — Producto con precio $0 se puede vender sin warning

**Dispara cuando:** hay un producto con precio nulo o $0 en la DB (por error de carga).

**Impacto:** el producto se agrega al carrito con precio $0, el total queda en $0, y la venta se confirma. La API acepta ventas con total $0 porque no hay validación de mínimo.

**Evidencia:**
- `app/ventas/page.tsx` línea 767: `getUnitPrice` devuelve `0` si `price = null`
- `app/api/pos/confirm/route.ts` línea 375: `const total = finalItems.reduce(...)` — puede ser 0
- No hay validación de `total > 0`

**Fix sugerido:** en el backend, rechazar ventas con `total <= 0` a menos que sea una devolución explícita. En el frontend, mostrar un badge de advertencia en ítems con precio $0.

---

## 🟢 MENOR 13 — Cache de productos no se invalida por tiempo (puede ser stale)

**Dispara cuando:** el cajero deja el POS abierto varios días sin recargar.

**Impacto:** el cache en IndexedDB no tiene TTL. Si los precios se actualizan en la DB, el cache local puede mostrar precios viejos en la pantalla de búsqueda. La venta siempre usa el precio de la DB (el backend lo recalcula), pero el cajero puede ver un precio diferente al cobrado.

**Evidencia:**
- `lib/productCache.ts`: no hay lógica de expiración basada en tiempo
- `warmCache()` solo se llama al cargar la página o reconectarse, no periódicamente

**Fix sugerido:** en `warmCache()`, verificar `savedAt` y si fue hace más de 30 minutos, forzar una recarga. O simplemente agregar un `setInterval` de 30 minutos para refrescar el cache.

---

## LO QUE SÍ FUNCIONA BIEN

- **Idempotencia de ventas**: cada venta genera un UUID único. El servidor busca ese UUID en ventas de la última hora y devuelve la venta existente en vez de crear un duplicado (`/api/pos/confirm/route.ts` líneas 205-216). Cubre timeouts, doble-click y cola offline reenviando la misma venta.
- **Anti doble-click robusto**: `inFlightRef` en ConfirmSaleButton es un ref (síncrono), no estado React. El segundo clic llega después de que el ref ya se seteó en true. No hay ventana de race condition.
- **Precios siempre desde DB**: el frontend envía `unit_price` pero el backend lo ignora completamente y consulta la DB. Un cliente modificado no puede bajar precios.
- **Anulación atómica**: la anulación usa el RPC `void_sale_atomic` que revierte stock, registra movimiento y cambia el status en una sola transacción. Verifica doble el status antes de anular.
- **Ventas anuladas excluidas de totales de cierre**: tanto en `/api/cash-closure` como en `computeClosureTotals.ts`, solo ventas con `status = "confirmed"` van a los acumuladores de totales.
- **Cierre de caja recalculado desde DB**: el POST a `/api/cash-closures` ignora los totales del body y llama `computeClosureTotals()` internamente. No se puede manipular el cierre desde el frontend.
- **Doble cierre de caja bloqueado**: el servidor devuelve 409 (unique constraint `23505`) si ya existe cierre para esa fecha/caja/sucursal. El botón en el frontend está `disabled` mientras `existingClosure` tiene valor.
- **Scanner HID funcional**: el buffer acumula caracteres con un timeout de 80ms antes de procesar, suficiente para que el scanner envíe todos los caracteres. Detecta EAN-13 de balanza (primer dígito `2`, 13 dígitos) y parsea PLU + precio automáticamente.
- **Balanza EAN-13**: `parseBalanzaBarcode()` extrae PLU (dígitos 2-6) y precio (dígitos 7-11 / 10). El producto se busca por campo `plu` en la DB. El precio de balanza se envía como `source: "scale_barcode"` y el backend lo valida contra `is_weighted = true`.
- **Cola offline con sync automático**: `syncQueue()` tiene mutex de módulo (`_syncing`), persiste progreso tras cada éxito, y no descarta ventas en error 401 (sesión expirada) ni 5xx (servidor caído).
- **JWT en cookie httpOnly**: XSS no puede robar la sesión. El localStorage solo tiene datos display (nombre del empleado); la autorización real siempre viene de la cookie.
- **Rate limiting en login y void**: 5 intentos fallidos por IP en 15 minutos.
- **Hold/resume de carritos**: los holds persisten en localStorage y sobreviven recargas.
- **Búsqueda offline**: cache en IndexedDB con búsqueda por nombre y SKU. Se actualiza con cada búsqueda exitosa (`mergeIntoCachedProducts`).
- **Auditoría de cierres**: el campo `notes` del cierre registra fecha, empleado, rol, sucursal y caja de cada cierre y reemplazo en formato parseable.

---

## RESUMEN DE RIESGOS — SEMANA DEL LANZAMIENTO

En orden de prioridad:

### 1. 🔴 Sesión expira durante el turno (12 horas sin renovación)
Si el cajero trabaja un turno largo o deja la página abierta de un día para el otro, la cookie expira y el POS deja de funcionar con errores crípticos. La venta en progreso se pierde. **Acción mínima antes del lanzamiento**: documentar en el procedimiento de cajeros que deben recargar la página al inicio de cada turno y re-loguearse si ven cualquier error de confirmación.

### 2. 🔴 POS no arranca offline si la página cargó sin conexión
Si el router del local se cae justo cuando el cajero abre el browser, `selectedStoreId` queda null y no puede buscar ni vender. **Acción mínima**: en el efecto de carga de stores (línea 721 de `ventas/page.tsx`), agregar fallback desde `posEmployeeRef.current?.store_id` si el fetch falla.

### 3. 🟡 Impresión de ticket — flujo de 4 pasos que puede bloquearse
La impresión vía PDF download no es tolerable en hora pico. Si el browser bloquea descargas o el cajero no sabe abrir el PDF, simplemente no imprime. **Evaluar**: ¿los cajeros van a imprimir tickets realmente? Si no, considerar deshabilitar el botón "Imprimir ticket" por ahora para no generar confusión.

### 4. 🟡 Ventas offline abandonadas sin recovery
Si se hacen ventas offline y algún producto fue desactivado mientras tanto, esas ventas se pierden silenciosamente después de 3 intentos. **Acción mínima**: guardar el payload de las ventas abandonadas en `localStorage["pos_failed_sales_v1"]` para revisión manual.

### 5. 🟡 Productos pesables con `window.prompt()` inutilizable en móvil
Si el POS se usa en tablet, el prompt nativo puede ser muy molesto o estar deshabilitado. **Acción**: si hay productos pesables en el catálogo activo al lanzar, priorizar el reemplazo del prompt por un modal React antes del día 1.

---

*Archivos clave revisados: `app/ventas/page.tsx`, `components/ConfirmSaleButton.tsx`, `app/api/pos/confirm/route.ts`, `app/api/sales/void/route.ts`, `app/api/cash-closure/route.ts`, `app/api/cash-closures/route.ts`, `app/api/employee/login/route.ts`, `app/api/employee/verify-supervisor-pin/route.ts`, `app/pos-login/page.tsx`, `app/cierres/page.tsx`, `lib/posSession.ts`, `lib/session.ts`, `lib/jwt.ts`, `lib/offlineQueue.ts`, `lib/useOnlineSync.ts`, `lib/productCache.ts`, `lib/rateLimiter.ts`, `lib/computeClosureTotals.ts`, `middleware.ts`, `next.config.mjs`, `public/sw.js`, `public/manifest.json`, `app/_components/ServiceWorker.tsx`, `app/ventas/lib/hold.ts`, `app/_utils/receipt.ts`.*
