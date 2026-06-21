# Diagnóstico de aislamiento e integridad — Super Juampy POS

Fecha: 2026-06-14  
Estado: solo diagnóstico, sin modificaciones de código aún.

---

## 1. store_id / register_id manipulables en `/api/pos/confirm`

**Archivo:** `app/api/pos/confirm/route.ts` líneas 133–134

**Código actual:**
```typescript
const storeId = resolveStoreId(body);          // del body, sin validar contra sesión
const register_id = body.register_id ?? ...    // del body, sin validar contra sesión
```

**Problema:** Los valores `store_id` y `register_id` se toman directamente del body del request. El JWT tiene `store_id` y `register_id` del empleado autenticado, pero nunca se comparan con los valores del body.

**Explotabilidad:** Un cajero autenticado puede mandar `store_id` de cualquier otra sucursal en el body y la venta queda registrada allí. Solo requiere tener una sesión válida (cualquier cajero).

**Severidad: ALTA.** Directo, no requiere nada especial.

**Fix:** Para cajeros, forzar `storeId = session.store_id` y `register_id = session.register_id`. Solo supervisores podrían especificar una sucursal distinta.

---

## 2. `/api/ai/alerts` sin check de rol supervisor

**Archivo:** `app/api/ai/alerts/route.ts` línea 15

**Código actual:**
```typescript
const session = await getSessionFromRequest(req);
if (!session) return unauthorized();
// NO hay check de isSupervisor()
```

**Datos expuestos a cualquier cajero autenticado:**
- Stock crítico de todas las sucursales
- Ventas de hoy y tendencias históricas de todo el negocio
- Discrepancias en cierres de caja de todas las sucursales
- Productos vendidos con déficit de stock

**Explotabilidad:** Requiere sesión válida (no anónimo), pero cualquier cajero puede acceder a datos gerenciales completos sin filtro por sucursal.

**Severidad: MEDIA-ALTA.**

**Fix:** Agregar `if (!isSupervisor(session)) return forbidden()` antes del try en el GET handler.

---

## 3. Anulación (void) — atomicidad y ownership

**Archivo:** `app/api/sales/void/route.ts`

### 3a. Ownership de la venta
El `sale.store_id` se usa para devolver stock al lugar correcto, pero **no se valida que coincida con `session.store_id`**. Un cajero que conociera un `sale_id` UUID de otra sucursal podría anularlo si tiene el PIN.

### 3b. PIN global
El PIN de anulación es `SUPERVISOR_PIN` del entorno — un único PIN para todo el sistema, no por supervisor individual. Es la arquitectura actual del sistema.

### 3c. Falta de atomicidad
Hay 3 operaciones independientes en serie sin transacción:
1. Upsert stocks devueltos
2. Insert movimientos de stock
3. Update status de la venta a `anulada`

Si el proceso se interrumpe entre operaciones el estado queda inconsistente (ej: stock devuelto pero venta sigue `confirmed`). Requests concurrentes con el mismo `saleId` tienen una race window entre la lectura del status y la escritura.

**Severidad:**
- Atomicidad: MEDIA (raro en práctica, pero posible con mala red o doble-click)
- Ownership cross-sucursal: BAJA (necesita conocer un UUID de otra sucursal)
- PIN global: BAJA (arquitectura actual aceptada)

**Fix:**
- Ownership: una línea — `if (!isSupervisor(session) && sale.store_id !== session.store_id) return forbidden()`
- Atomicidad real: mover la lógica a una función SECURITY DEFINER en PostgreSQL con un bloque de transacción explícito

---

## 4. Cierres de caja — integridad de totales

**Archivos:** `app/api/cash-closure/route.ts` (GET) y `app/api/cash-closures/route.ts` (POST/PUT)

### Lo que está bien
El GET de `/api/cash-closure` calcula todos los totales 100% server-side desde las ventas reales en la DB.

### El problema
El POST/PUT de `/api/cash-closures` persiste exactamente lo que manda el cliente sin validar:
```typescript
// app/api/cash-closures/route.ts líneas 89–105
total_sales: body.total_sales,    // del cliente, sin verificar
total_cash: body.total_cash,      // del cliente, sin verificar
...
```

La UI calcula los totales con el GET y los manda en el POST, pero el servidor no verifica que coincidan con la realidad. Un cajero puede cerrar con totales fabricados que divergen del registro real en la DB.

El control de ownership sí existe: `session.store_id !== body.store_id` (línea 83). Un cajero no puede cerrar otra sucursal.

**Severidad: MEDIA.** Sirve para maquillar discrepancias de caja. Las ventas individuales no se pueden alterar (están en la DB), pero el cierre puede no reflejar la realidad.

**Fix:** En el POST/PUT, recalcular los totales server-side desde `sales` para el día y sucursal dados, igual que lo hace el GET de `cash-closure`, e ignorar los totales del body.

---

## 5. Precio efectivo (ofertas) en `/api/pos/confirm`

**Archivo:** `app/api/pos/confirm/route.ts` líneas 178–215

**Código actual:**
```typescript
const { data: prods } = await supabaseAdmin
  .from("products")
  .select("id, price, active")   // no lee effective_price ni campos de oferta
  ...
productMap.set(String(p.id), { price: toNum(p.price, 0) });
items = items.map((it) => ({ ...it, unit_price: productMap.get(it.product_id)!.price }));
```

**Problema:** El precio se obtiene siempre de `products.price` (precio regular). Si el producto tiene una oferta activa, el cajero ve el `effective_price` (precio con oferta) en pantalla, pero la venta se registra al precio regular.

**Impacto:** El cliente paga el precio de oferta que ve en pantalla, pero la venta queda registrada con el precio regular. Los reportes de ventas y el cierre de caja muestran totales inflados respecto a lo realmente cobrado.

**Explotabilidad desde seguridad:** No es manipulable por el cliente (si acaso, les cobra de más al cliente). Es un bug de lógica de negocio.

**Severidad: BUG DE NEGOCIO IMPORTANTE / seguridad BAJA.**

**Fix:** En la query de productos, incluir `effective_price` o joinear con la tabla de ofertas vigentes, y usar ese precio cuando corresponda.

---

## 6. Dependencias vulnerables (`pnpm audit --prod`)

**Resultado: 46 vulnerabilidades — 2 críticas, 18 altas**

### jspdf `^3.0.2` → vulnerabilidades CRÍTICAS y ALTAS

| CVE | Tipo | Severidad | Fix |
|-----|------|-----------|-----|
| GHSA-f8cm-6447-x5h2 | Path Traversal / LFI | CRÍTICA | `>=4.0.0` |
| GHSA-wfv2-pwc8-crg5 | HTML Injection en New Window | CRÍTICA | `>=4.2.1` |
| GHSA-pqxr-3g65-p328 | JS Injection en AcroFormChoiceField | ALTA | `>=4.1.0` |
| GHSA-* | DoS via BMP dimensions sin validar | ALTA | `>=4.2.1` |

**Versión que cubre todo:** `>=4.2.1`

**Riesgo contextual:** Las vulnerabilidades críticas requieren render de HTML o archivos controlados por attacker. En un POS interno con usuarios conocidos el riesgo real es bajo, pero aplica si los PDFs incluyen datos de entrada de usuarios.

### xlsx `^0.18.5` → vulnerabilidades ALTAS (sin parche en npm)

| CVE | Tipo | Severidad | Situación |
|-----|------|-----------|-----------|
| GHSA-4r6h-8v6p-xvw6 | Prototype Pollution | ALTA | Sin parche disponible en npm |
| GHSA-5pgg-2g8v-p4x9 | ReDoS | ALTA | Sin parche disponible en npm |

SheetJS dejó de publicar en npm. No existe versión parcheada disponible vía `pnpm update`.

**Riesgo contextual:** El prototype pollution es explotable si se parsea un `.xlsx` subido por usuarios. Si el import de productos acepta archivos externos, es un vector real.

**Fix:** Reemplazar `xlsx` por `exceljs` (en npm, mantenido activamente), o eliminar la funcionalidad de exportación/importación Excel si no es crítica.

### next `16.0.8` → vulnerabilidades ALTAS y BAJAS

| CVE | Tipo | Severidad | Fix |
|-----|------|-----------|-----|
| GHSA-mwv6-3258-q52c | DoS con Server Components | ALTA | `>=16.0.9` |
| GHSA-h25m-26qc-wcjf | DoS por deserialización HTTP insegura | ALTA | `>=16.0.11` |
| GHSA-3g8h-86w9-wvmq | Cache poisoning vía middleware redirects | BAJA | `>=16.2.5` |
| GHSA-vfv6-92ff-j949 | Cache poisoning vía RSC cache-busting | BAJA | `>=16.2.5` |

**Versión que cubre todo:** `>=16.2.5`

---

## Priorización de fixes recomendada

| # | Fix | Severidad | Esfuerzo estimado |
|---|-----|-----------|-------------------|
| 1 | `next` upgrade a `>=16.2.5` | Alta (DoS) | Mínimo — actualizar package.json + verificar breaking changes |
| 2 | `jspdf` upgrade a `>=4.2.1` | Crítica | Mínimo — verificar breaking changes de API v4 |
| 3 | `store_id` en confirm forzado desde sesión JWT | Alta | ~5 líneas en confirm/route.ts |
| 4 | Rol supervisor en `/api/ai/alerts` | Media-Alta | 1 línea |
| 5 | Fix `effective_price` en confirm | Media-Alta (bug negocio) | ~15 líneas + query a offers |
| 6 | Recalcular totales en POST/PUT cash-closures | Media | ~30 líneas |
| 7 | Ownership check en void | Baja-Media | 1 línea |
| 8 | Atomicidad del void (función SQL transaccional) | Media | Grande — nueva función SECURITY DEFINER |
| 9 | `xlsx` — sin parche en npm | Alta | Reemplazar por `exceljs` o eliminar feature |
