# Auditoría Completa — Super Juampy POS

**Fecha:** 2026-06-21
**Alcance:** Seguridad, integridad de datos, funcionamiento, dependencias, rendimiento.
**Metodología:** Lectura de código + ejecución de `tsc --noEmit`, `next build`, `pnpm audit` + 4 agentes de exploración en paralelo, con verificación manual posterior de cada hallazgo crítico/alto antes de incluirlo en este informe.

> Este documento es solo diagnóstico. No se modificó ningún archivo de código durante la auditoría.

---

## 0. Resumen ejecutivo

El proyecto está en un estado **sólido en seguridad de acceso y aislamiento por sucursal** (las rondas previas de hardening se mantienen vigentes y las funciones nuevas v3 las respetan), pero tiene **una grieta de integridad de datos real** (void de venta no atómico) y **deuda de dependencias considerable** (jsPDF con CVE crítico, Next.js con múltiples DoS, xlsx sin parche disponible en npm). No hay errores de compilación ni de build.

| Área | Veredicto | Hallazgos críticos | Hallazgos altos |
|---|---|---|---|
| Seguridad | 🟢 Bueno | 0 | 0 |
| Integridad de datos | 🟡 Atención | 1 (void no atómico) | 0 |
| Funcionamiento | 🟡 Atención | 0 | 1 (RPCs sin SQL versionado) + dead code |
| Dependencias | 🔴 Acción requerida | 1 (jspdf) | varios (next, xlsx, ws) |
| Rendimiento | 🟡 Atención | 1 (N+1 en bulk-create) | 2 (queries sin límite) |

---

## 1. SEGURIDAD

### 1.1 Funciones SECURITY DEFINER

✅ **Patrón REVOKE/GRANT consistente y vigente**, incluido en las versiones nuevas.

- `sql/bulk_update_product_prices.sql`, `_v2.sql`, `_v3.sql`: las tres versiones tienen `REVOKE ALL ... FROM PUBLIC`, `REVOKE EXECUTE ... FROM anon, authenticated` y `GRANT EXECUTE ... TO service_role`. v3 (la activa, llamada desde `app/api/products/bulk-price-import/route.ts:81`) mantiene el patrón al agregar `p_markup_rates`/`p_vat_rates`.
- `supabase/employees_functions.sql` (`create_employee_with_pin`, `update_employee_pin`): cubiertas en `sql/revoke_final.sql:94-100`.
- `supabase/confirm_sale.sql` (línea 43, SECURITY DEFINER): **no tiene REVOKE/GRANT en el propio archivo**, pero está cubierta por firma exacta en `sql/revoke_final.sql:117-119`. — **Bajo**: el archivo fuente debería incluir el REVOKE inline para que quede autocontenido y no dependa de que alguien recuerde correr `revoke_final.sql` después. Fix sugerido: agregar las 3 líneas de REVOKE/GRANT al final de `supabase/confirm_sale.sql`.
- `supabase/products_top.sql:49` tenía históricamente `GRANT execute ... to anon, authenticated` — quedó revertido en `revoke_final.sql:136-138`, pero el archivo fuente sigue mostrando el GRANT permisivo como si fuera el estado deseado. — **Bajo**: actualizar `products_top.sql` para que el GRANT correcto (solo `service_role`) esté en el mismo archivo, evitando que alguien lo re-ejecute tal cual y reabra el agujero.

### 1.2 Confianza en datos del cliente (rol/store_id vs JWT)

✅ Verificado en los 4 endpoints de mayor riesgo — todos derivan `store_id`/`register_id` de la sesión para cajeros, y solo permiten que el valor del body se use si `isSupervisor(session)`:

- `app/api/pos/confirm/route.ts:225-244` — fuerza `session.store_id`/`session.register_id` para cajero, valida con `forbidCashierRegisterMismatch`.
- `app/api/sales/void/route.ts:90` — compara `sale.store_id` (leído de la DB, no del body) contra `session.store_id`.
- `app/api/cash-closure/route.ts:93-108` — mismo patrón con `forbidCashierStoreMismatch`/`forbidCashierRegisterMismatch` (`lib/session.ts:17-34`).
- `app/api/stock/adjust/route.ts:39` — rechaza si `session.store_id !== storeId` para no-supervisores.

No se encontró ningún endpoint que confíe en `role` enviado por el cliente.

### 1.3 Llamadas anon-key directas desde el cliente

✅ No hay. `app/_shims/supabase-js.ts` actúa como guardia (mock que neutraliza cualquier import accidental de `@supabase/supabase-js` en bundle de cliente). Todo acceso real pasa por `lib/supabaseAdmin.ts` (service_role) importado únicamente desde `route.ts`. `grep -rn "from.*@/lib/supabase" app/` solo devuelve archivos `route.ts`.

### 1.4 RLS

✅ Habilitado en tablas sensibles (`sql/revoke_anon_table_access.sql:17-27`: products, product_stocks, stock_movements, sales, sale_items, cash_closures, stores, registers, product_offers, product_min_stock, employees). Las políticas (`fix_confirm_sale.sql:64-86`) son permisivas para `authenticated`/`service_role`, pero esto es aceptable porque `anon`/`authenticated` ya no tienen GRANT a nivel tabla — el control real de acceso vive en las API routes. Es un modelo "backend-driven" con RLS como capa adicional, no como mecanismo principal — **medio, conceptual**: si en el futuro se habilita un cliente con rol `authenticated` real (ej. app móvil con Supabase Auth), las políticas actuales no lo frenarían. Hoy no aplica porque no existe ese cliente.

### 1.5 CORS / Security headers / CSP

✅ Headers sólidos en `next.config.mjs:9-24`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` (también en `/api/*`, `next.config.mjs:31-35`). Sin `Access-Control-Allow-Origin` (correcto para un sistema interno sin necesidad de cross-origin).

🟡 **Medio** — `middleware.ts:31` (`script-src 'self' 'unsafe-inline'`): el CSP no usa nonces, a diferencia de lo que indica la memoria de sesiones previas ("CSP con nonce por request"). El comentario en `middleware.ts:21-27` documenta que esto es intencional: Next.js 16 App Router pre-renderiza páginas estáticas en build-time y el middleware no puede inyectar nonces en HTML ya generado, y los scripts RSC de hidratación (`self.__next_f.push`) requieren inline. `'unsafe-inline'` en `script-src` reduce la protección XSS del CSP (un script inyectado vía XSS se ejecutaría igual), aunque está parcialmente mitigado por `default-src 'self'`, `frame-ancestors 'none'`, `frame-src 'none'` y los headers de `next.config.mjs`. **Fix sugerido**: si se puede forzar render dinámico (`export const dynamic = "force-dynamic"`) en las páginas que processan datos sensibles, reintroducir nonces ahí; o evaluar `next/script` con `strategy="afterInteractive"` + nonce donde sea viable. No es trivial dado el framework — documentar como riesgo aceptado si no se resuelve.

### 1.6 Validación de inputs y secretos expuestos

✅ Validación manual exhaustiva en endpoints críticos (`pos/confirm`, `products/create`, `products/update`, `employees`) — sin zod pero con checks explícitos de tipo/rango y validación cruzada contra DB antes de persistir. 🟢 No se usa zod a pesar de estar en `package.json` — es una preferencia de estilo, no un hallazgo de seguridad, pero significa que la validación no es declarativa ni centralizada (riesgo de inconsistencia futura entre endpoints). `grep -rn "process.env" app/ --include="*.tsx"` sin matches fuera de `route.ts` → sin secretos en bundle de cliente. `.env.local`, `.env.local.bak`, `.env.vercel` no están trackeados en git (`git ls-files | grep .env` vacío).

### 1.7 Aislamiento por sucursal (cajero vs otra sucursal)

✅ Consistente en los 4 endpoints de escritura crítica (`pos/confirm`, `sales/void`, `cash-closure`, `stock/adjust`) — ver 1.2. El patrón "lock cashier to assigned register" introducido en el commit `37873ec` se aplica también en los endpoints tocados después, no quedó aislado a un solo lugar.

**Veredicto sección seguridad: 🟢 sin hallazgos críticos o altos pendientes.** Los 3 hallazgos bajos (1.1, 1.5) son de robustez/documentación, no vulnerabilidades explotables hoy.

---

## 2. INTEGRIDAD DE DATOS

### 2.1 effective_price en ventas (ofertas) — ✅ OK

`app/api/pos/confirm/route.ts:261` ignora explícitamente el `unit_price` del cliente; líneas 280-315 recalculan el precio efectivo consultando `products` + `product_offers` vigentes (con prioridad store-specific sobre global, línea ~302) y ese valor recalculado es el que se persiste (línea 326) y el que define el total (línea 375). No hay path donde el cliente pueda inyectar un precio.

### 2.2 Totales de cierre recalculados server-side — ✅ OK

`lib/computeClosureTotals.ts:28-82` recalcula totales agregando desde `sales`/`sale_items` filtrando por store/fecha (timezone Argentina)/register. `app/api/cash-closures/route.ts:126` (POST) y `:203` (PUT) usan `...totals` del cálculo del servidor, pisando cualquier valor monetario que venga en el body. Los únicos campos que aceptan del cliente (`first_ticket_at`, `last_ticket_at`, líneas 136-137) no son monetarios.

### 2.3 Atomicidad del void — 🔴 **CRÍTICO, confirmado**

`app/api/sales/void/route.ts:114-200` — el void hace **4 operaciones Supabase secuenciales e independientes**, sin ninguna función RPC/transacción que las agrupe:

1. `SELECT` stock actual (líneas 118-122)
2. `UPSERT product_stocks` devolviendo cantidad (líneas 137-146)
3. `INSERT stock_movements` (líneas 154-167)
4. `UPDATE sales SET status='anulada'` (líneas 192-195)

Si falla el paso 4 después de que 1-3 tuvieron éxito (timeout de red, error transitorio de Supabase), el stock ya se devolvió pero la venta queda en `status='confirmed'` — inconsistencia real: la venta sigue contando para reportes/cierre de caja, pero el stock ya fue acreditado dos veces si alguien reintenta el void manualmente. Lo inverso (paso 4 ok, pasos 1-3 fallan a mitad) también es posible si falla el upsert pero ya se leyó el stock.

**Fix sugerido:** crear una función `void_sale_atomic(p_sale_id uuid, p_supervisor_id uuid, p_reason text, ...)` con `SECURITY DEFINER` que haga los 4 pasos dentro de la misma función PL/pgSQL (atomicidad implícita de Postgres por función), siguiendo el mismo patrón que ya usan `confirm_sale_with_stock` (`sql/fix_confirm_sale_with_stock.sql`) y `bulk_update_product_prices_v3` (REVOKE de `anon`/`authenticated`, GRANT solo a `service_role`). Reemplazar las 4 llamadas en `route.ts` por una sola `supabaseAdmin.rpc("void_sale_atomic", {...})`.

### 2.4 Idempotencia de ventas — ✅ OK

`app/api/pos/confirm/route.ts:204-216` busca por `idempotency_key` (JSONB `payment.idempotency_key`) antes de crear; si existe, devuelve la venta existente (líneas 249-252) sin duplicar. El cliente (`components/ConfirmSaleButton.tsx:65`) genera el UUID una vez por intento de venta y lo reutiliza en reintentos; `lib/offlineQueue.ts:36-38` y `lib/useOnlineSync.ts` preservan el mismo key al reintentar tras reconexión. Cubre doble-click, timeout+retry y reintento offline.

### 2.5 Productos duplicados sin mergear — 🟡 **Medio, confirmado**

La normalización de SKU (`lib/sku.ts` — `normalizeSku`, recorta ceros a la izquierda en SKUs puramente numéricos) se aplica en `app/api/products/bulk-create/route.ts:50,61` y `app/api/products/catalog/route.ts` (líneas con `byNormSku`), pero **no en `app/api/products/by-plu/route.ts`**:

- `by-plu/route.ts:19` hace su propia normalización ad-hoc (`String(parseInt(plu, 10))`) en vez de usar `normalizeSku`.
- `by-plu/route.ts:26,41` solo prueban `eq` contra el valor literal y el valor sin-ceros del *input* — nunca comparan contra el SKU de la DB ya normalizado. Si la DB tiene `sku = "000000004166"` y el cajero escanea `"4166"`, ninguna de las dos variantes (`4166`, `4166`) matchea el string `"000000004166"` con `.eq()`, así que la búsqueda falla y un cajero podría terminar creando un producto duplicado pensando que no existe.

**Fix sugerido:** en `by-plu/route.ts`, reemplazar la comparación `.eq()` por una carga acotada (`.in()`/`.like()` o RPC) que compare `normalizeSku(sku)` del lado de la DB contra `normalizeSku(plu)`, reutilizando la misma función de `lib/sku.ts` para evitar la inconsistencia.

**Veredicto sección integridad: 🟡.** 1 hallazgo crítico real (void no atómico) que debería resolverse antes de seguir escalando volumen de operaciones; el resto del pipeline de ventas (precio, totales, idempotencia) está bien defendido.

---

## 3. FUNCIONAMIENTO

### 3.1 typecheck y build

✅ `npx tsc --noEmit` → exit 0, sin errores.
✅ `npx next build` → exit 0, build completo sin warnings de error, todas las rutas (`ƒ`/`○`) compilan.

### 3.2 RPCs llamadas sin definición SQL versionada en el repo — 🟡 **Medio (no crítico — la app funciona)**

Confirmado por grep directo: las siguientes funciones se llaman desde TypeScript y tienen sentencias `REVOKE`/`GRANT` en `sql/revoke_security_definer_public.sql` y `sql/revoke_final.sql`, pero **no tienen ningún `CREATE [OR REPLACE] FUNCTION` en ningún archivo del repo** — solo existen en la base de datos remota de Supabase:

| RPC | Llamada desde |
|---|---|
| `margin_suggestions` | `app/api/intelligence/margin-suggestions/route.ts:34` |
| `register_cash_diff` | `app/api/intelligence/register-diff/route.ts:21` |
| `register_risk` | `app/api/intelligence/register-risk/route.ts:24` |
| `products_with_stock` | `app/api/products/search/route.ts:26` |
| `fn_top_products_range` | `app/api/reports/top-products/route.ts:31` |
| `fn_top_products_range_all` | `app/api/reports/top-products/route.ts:38`, `app/api/ai/assistant/route.ts:93,94,120` |

No es un bug activo (las funciones existen en producción y los endpoints funcionan), pero es un riesgo operacional: si se necesita reconstruir la base desde cero, migrar de proyecto Supabase, o revisar en code review qué hace exactamente `products_with_stock`, no hay fuente de verdad versionada — solo el nombre y los permisos. **Fix sugerido:** exportar el `CREATE OR REPLACE FUNCTION` real de cada una desde el SQL editor de Supabase (`pg_get_functiondef`) y agregarlas a `sql/`, documentando su firma.

### 3.3 Código muerto — 🟡 Medio

`components/SalesDaily.tsx`, `components/SalesPreview.tsx`, `components/SalesBySale.tsx` — confirmado que no son importados desde ningún archivo en `app/` ni `components/` (grep solo encuentra sus propias definiciones). Parecen prototipos de un dashboard de ventas que no se integró. **Fix sugerido:** confirmar con el negocio si se van a usar; si no, eliminar los 3 archivos.

### 3.4 Endpoints críticos — ✅ OK

`employee/login`, `pos/confirm`, `cash-closure`, `products/bulk-price-import`, `health` — revisados completos, sin TODOs bloqueantes, con manejo de errores explícito y sin código comentado sospechoso.

### 3.5 Consistencia SQL v1/v2/v3 de bulk_update_product_prices — ✅ OK, con deuda menor

v1 → v2 (agrega `cost_net`) → v3 (agrega `markup_rate`, `vat_rate`) son extensiones coherentes entre sí, cada una con `COALESCE` para no pisar columnas no enviadas. v3 es la única llamada desde TypeScript actualmente (`bulk-price-import/route.ts:81`). 🟡 **Bajo:** `sql/bulk_update_product_prices.sql` y `_v2.sql` quedaron como código SQL muerto en el repo (nadie las llama) — no rompen nada, pero conviene marcarlas `-- LEGACY, no usar` en el encabezado o eliminarlas para que no se confunda cuál es la vigente.

### 3.6 package.json / configs — ✅ OK

Sin dependencias huérfanas evidentes, scripts estándar funcionando. `eslint.config.mjs` desactiva `@typescript-eslint/no-explicit-any` para `app/api/**` — deuda técnica conocida y deliberada (migración gradual de tipos en endpoints), no es un hallazgo nuevo.

**Veredicto sección funcionamiento: 🟢 sin bloqueantes.** Los 2 hallazgos medios son de mantenibilidad, no de funcionalidad rota.

---

## 4. DEPENDENCIAS (`pnpm audit`)

Resumen: **2 críticas, 36 altas, 39 moderadas, 8 bajas** sobre 753 dependencias totales.

### 4.1 Dependencias de producción directas (impacto real en runtime/usuarios)

| Paquete | Versión actual | Severidad | Detalle | Parche |
|---|---|---|---|---|
| **jspdf** | 3.0.3 | 🔴 **Crítico** | Local File Inclusion / Path Traversal; además HTML Injection en "New Window", PDF/Object Injection en AcroForm, DoS vía BMP/GIF malformado | `>=4.2.1` (salto de major) |
| **next** | 16.0.8 | 🔴 Alto (acumulado) | Múltiples DoS (Server Components, Image Optimizer, conexiones), bypass de middleware/proxy (segment-prefetch, i18n, route params), SSRF vía WebSocket upgrade, XSS con CSP nonces, CSRF de Server Actions con origin null. Lista completa: ~20 advisories entre `16.0.8` y `16.2.6` | `>=16.2.6` |
| **xlsx** | 0.18.5 | 🟠 Alto | Prototype Pollution + ReDoS. **`patched_versions` reporta `<0.0.0` → no hay fix disponible vía npm** (SheetJS dejó de publicar en npm; recomiendan instalar desde su propio CDN/registro). Usado en `importar-precios` (parseo de Excel) | Sin parche en npm — requiere evaluar fuente alternativa (cdn.sheetjs.com) o reemplazo de librería |
| **@supabase/supabase-js → realtime-js → ws** | 8.18.3 | 🟠 Alto/moderado | Memory exhaustion DoS y uninitialized memory disclosure en el cliente WebSocket de Supabase Realtime | `>=8.21.0` (depende de que Supabase actualice su dependencia interna; no se puede forzar fácil sin romper resolución) |
| **postcss** (vía `next`) | 8.4.31 (transitiva de next) / 8.5.6 (directa) | 🟡 Moderado | XSS vía `</style>` sin escapar en stringify | `>=8.5.10` |

### 4.2 Dependencias de desarrollo (sin impacto en runtime de producción, pero sí en máquinas de build/CI)

Toda esta cadena viene de `@tabler/icons-webfont` (devDependency, generador de webfont de íconos, solo corre en build local — no se shippea):
`tar` (7 advisories, varias altas — path traversal/hardlink), `minimatch` (4 ReDoS), `picomatch` (2, ReDoS), `undici` (3, DoS/header injection vía `cheerio`), `brace-expansion` (1).

Cadena de `eslint`/`@eslint/eslintrc` (devDependency): `js-yaml` (prototype pollution + DoS), `ajv` (ReDoS), `flatted` (2, prototype pollution/recursión).

Estas no viajan al bundle de producción ni se exponen a usuarios finales — riesgo acotado a la máquina que corre `pnpm install`/build (CI, laptop del dev). Igual conviene actualizar cuando se pueda con `pnpm update`.

### 4.3 Prioridad de remediación de dependencias

1. **jspdf** — crítico y de uso directo (generación de etiquetas/PDF). Subir a `>=4.2.1` cuanto antes; revisar breaking changes de la migración 3.x→4.x antes de aplicar (no es un simple bump de patch).
2. **next** — actualizar a `16.2.6+` lo antes posible; viene de una serie larga de parches de seguridad post-16.0.8, varios de DoS explotables sin autenticación contra el middleware/proxy.
3. **xlsx** — evaluar migrar a la fuente oficial de SheetJS (no-npm) o a una alternativa mantenida (`exceljs`), dado que no hay parche vía npm.
4. **ws** (transitiva de supabase-js) — actualizar `@supabase/supabase-js` a la última versión 2.x para arrastrar el `realtime-js`/`ws` parchado.
5. Dependencias de devDependencies (tabler-icons-webfont, eslint chain) — actualizar en un ciclo de mantenimiento normal, no urgente.

---

## 5. RENDIMIENTO

### 5.1 N+1 confirmado — 🔴 Alto (acotado por tamaño de import)

`app/api/products/bulk-create/route.ts:95-107` — loop secuencial de `UPDATE` (uno por producto a actualizar), en vez de un batch único:

```ts
for (const p of toUpdate) {
  const id = resolveExistingId(p.sku)!;
  await supabaseAdmin.from("products").update({ price: ..., active: true }).eq("id", id);
}
```

Para importaciones grandes (cientos de productos) esto son cientos de round-trips secuenciales a Supabase — lento y sin `Promise.all` ni batch SQL. Mismo patrón ya fue resuelto para `bulk-price-import` con `bulk_update_product_prices_v3` (RPC batch) — `bulk-create` no se actualizó con el mismo patrón. **Fix sugerido:** crear/usar una función RPC batch similar (o `upsert` con `onConflict` en una sola llamada con array) para los updates de `toUpdate`.

### 5.2 Queries sin límite explícito sobre tablas que pueden superar 1000 filas — 🟠 Alto

- `app/api/marketing/suggestions/route.ts:24-25,34-36` — `product_stocks` (sin filtro de store, puede ser ~1500-3000 filas con 3 sucursales) y `sale_items` de los últimos 7 días, ambas sin `.limit()`/`.range()`. Riesgo de truncamiento silencioso a 1000 filas de Supabase si el catálogo o el volumen de ventas crece.
- `app/api/ai/alerts/route.ts:29-35` — `sales` de las últimas 8 semanas sin límite; con volumen diario sostenido puede superar 1000 filas y truncarse sin error visible (las alertas de IA quedarían calculadas sobre datos parciales sin que nadie lo note).

**Fix sugerido:** agregar `.limit()` explícito generoso (o usar `fetchAllRows` igual que en `bulk-create`, que ya pagina internamente) en ambos endpoints.

### 5.3 Riesgo medio / bajo

- `app/api/reports/summary/route.ts:80-89` — query a la vista `v_sales_daily` sin límite; riesgo bajo *si* la vista ya agrega por día×sucursal (≈1000 filas/3 años), pero no está documentado en el repo cuál es su granularidad real — vale la pena confirmarlo.
- Falta de índices explícitos: `sql/constraints.sql` define FKs/checks pero no índices compuestos para los filtros más comunes (`sales(status, created_at, store_id)`, `product_stocks(store_id, product_id)`, `cash_closures(store_id, register_id, date)`). Postgres indexa automáticamente las FKs simples, pero no los filtros combinados que usan los reportes/cierres. Riesgo bajo hoy (dataset chico), pero crecerá con el historial.

### 5.4 Lo que está bien

`products/catalog` (`.range()`), `sales` (`.limit(500)`), `sales/recent` (`.limit(50)`), `offers` (`.limit(200)`), `audit/operations` (`.limit(500)` en ambas queries), `stock/low`, `stock/adjust`, `pos/confirm` (todo con `.in()` acotado) — todos con límites o paginación explícita.

**Contexto de escala:** para un supermercado de 3 sucursales (catálogo estimado 500-1000 productos, 50-200 ventas/día), el bug de truncamiento a 1000 filas es real pero tardaría meses/años en manifestarse en la mayoría de las queries señaladas — salvo `sale_items` de la semana en `marketing/suggestions`, que podría tocar el límite con picos de venta (fin de mes, fiestas).

**Veredicto sección rendimiento: 🟡.** Nada urgente por caída de servicio, pero el N+1 de `bulk-create` y las queries sin límite de `marketing/suggestions`/`ai/alerts` conviene resolverlas pronto porque silenciosamente devuelven datos incompletos sin lanzar error.

---

## 6. VEREDICTO GENERAL

El proyecto está en **buen estado de seguridad** — las múltiples rondas de hardening previas (aislamiento por sucursal/caja, eliminación de anon-key del cliente, REVOKE de funciones SECURITY DEFINER) se mantienen vigentes y las features nuevas (bulk_update_product_prices_v3, IVA incluido en /products) no las rompieron. Typecheck y build están limpios. El punto más urgente de todo el informe es la **falta de atomicidad en el void de ventas** (2.3), porque es el único hallazgo que puede generar **datos de negocio inconsistentes silenciosamente** (stock duplicado sin que la venta refleje el cambio de estado). El segundo punto más urgente es la **deuda de dependencias** (jspdf crítico, next con ~20 CVEs acumulados desde 16.0.8), porque son vulnerabilidades conocidas y públicas con exploits documentados, aunque su explotabilidad real en este sistema interno (sin usuarios anónimos, detrás de auth) es menor que en una app pública.

### Plan de remediación priorizado

**P0 — Esta semana:**
1. Atomizar el void de ventas con una función RPC transaccional (2.3). Es el único riesgo real de corrupción de datos de negocio detectado.
2. Actualizar `jspdf` a `>=4.2.1` (4.1, crítico, uso directo en generación de etiquetas/PDF).

**P1 — Próximas 2 semanas:**
3. Actualizar `next` a `>=16.2.6` (4.1) — revisar changelog de breaking changes antes (es un salto de varios minors).
4. Arreglar normalización de SKU en `by-plu` (2.5) para que use `normalizeSku` igual que el resto — previene duplicados silenciosos.
5. Agregar `.limit()`/paginación en `marketing/suggestions` y `ai/alerts` (5.2) — hoy pueden estar devolviendo datos truncados sin error.
6. Reemplazar el loop de updates en `bulk-create` por un batch RPC (5.1).

**P2 — Próximo mes / mantenimiento:**
7. Evaluar alternativa a `xlsx` (sin parche disponible vía npm) o migrar a la fuente oficial de SheetJS (4.1).
8. Actualizar `@supabase/supabase-js` para arrastrar el parche de `ws` (4.1).
9. Versionar en `sql/` las 6 funciones RPC que hoy solo existen en la DB remota (3.2): `margin_suggestions`, `register_cash_diff`, `register_risk`, `products_with_stock`, `fn_top_products_range`, `fn_top_products_range_all`.
10. Eliminar código muerto: `SalesDaily.tsx`, `SalesPreview.tsx`, `SalesBySale.tsx` (3.3) y las versiones v1/v2 de `bulk_update_product_prices` si se confirma que no se usan (3.5).
11. Agregar índices compuestos en `sales`, `product_stocks`, `cash_closures` (5.3) — preventivo, no urgente con el volumen actual.
12. Revisar si conviene introducir nonces de CSP en las rutas que se puedan renderizar dinámicamente (1.5) — bajo impacto inmediato, mejora defensa en profundidad contra XSS.
