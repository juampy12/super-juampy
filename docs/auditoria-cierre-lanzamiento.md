# Auditoría de Cierre — Pre-Lanzamiento Super Juampy POS

**Fecha:** 2026-07-10
**Alcance:** chequeo integral final antes de congelar el código para arrancar producción el lunes.
**Método:** solo diagnóstico (4 agentes en paralelo: salud general, coherencia entre features, seguridad, cabos sueltos/SQL). No se tocó código ni se corrió contra la DB real de producción.
**Se apoya en:** `docs/auditoria-funcional-lanzamiento.md` (2026-06-30) y `docs/verificacion-final-pre-lanzamiento.md` (2026-07-03), archivadas hoy en esta misma carpeta.

---

## 1. SALUD GENERAL

| Chequeo | Estado |
|---|---|
| `npx tsc --noEmit` | ✅ LIMPIO — sin errores |
| `npm run build` | ✅ LIMPIO — "Compiled successfully", 55/55 páginas. Único aviso: `middleware` file convention deprecada en Next 16 (sugiere migrar a `proxy`), no bloquea el build |
| `git status` / `git log origin/main..main` | ✅ LIMPIO — rama al día con `origin/main`, cero commits locales sin pushear |
| `.md` sueltos sin commitear | ✅ Resuelto — `auditoria-funcional-lanzamiento.md` y `verificacion-final-pre-lanzamiento.md` movidos a `docs/` y commiteados junto con este archivo. `auditoria-motor-promos.md` y `revision-final-mobile.md` en la raíz ya estaban trackeados, sin acción necesaria |
| `npm run lint` | 🟡 2646 errores en 1068 archivos, pero es deuda técnica preexistente desde el commit `d04ab64` (10-nov-2025, reglas type-aware de `@typescript-eslint` estrictas) — **no es regresión de esta ronda**. También 4 errores de parsing en configs (`.mjs`) fuera del `tsconfig.json`, bug menor del propio linter. No bloqueante |
| Config / env vars | 🟡 No hay `vercel.json` ni `.env.example` en el repo. Falta `ANTHROPIC_API_KEY` en `.env.local` y `.env.vercel` — si el asistente IA (`/api/ai/assistant`, `/api/ai/alerts`) se va a usar desde el día 1, **hay que confirmar que esa key está seteada en el entorno real de Vercel** (puede estarlo ahí sin estar en los archivos locales, pero conviene verificarlo explícitamente) |

---

## 2. COHERENCIA ENTRE LAS ÚLTIMAS FEATURES

Se verificaron 5 hipótesis de fricción entre: motor de promos (nxm/second_unit_pct), panel `/inicio` + redirects mobile supervisor + HeaderNav, alta ágil de catálogo + `plu` + `normalizeSku`, precios batch (`/products` + bulk-update), asistente IA, y marketing.

- **Redirects mobile-supervisor vs. flujo de cajero** — ✅ Sin problema. La lógica vive en `pos-login/page.tsx` y `ventas/page.tsx` (no en HeaderNav, que es cosmético), con guardas que solo aplican a `role==="supervisor"`. No hay bucle de redirección; un cajero nunca es afectado.
- **Columna `plu` vs. balanza EAN-13** — ✅ Sin problema, mismo concepto en todo el código. Nota menor: el fallback por sufijo de SKU en `by-plu/route.ts` podría dar falso positivo si existe un SKU muy corto que normalice igual a un PLU real — vale revisar el catálogo real antes del lanzamiento si hay SKUs cortos.
- **Batch de precios vs. ofertas activas** — ✅ Sin problema. `products.price` y `product_offers` son independientes; el precio efectivo se recalcula en cada venta, nunca se congela. Gap de UX menor (no bug): `/products` no avisa si el producto que se edita en batch tiene una oferta nxm/second_unit_pct activa.
- **Asistente IA — columnas `is_active`** — ✅ Sin problema. Las 6 queries a `product_offers` en el repo usan `is_active` de forma consistente; no quedó ningún query con el typo viejo.
- **Marketing vs. tipos de promo** — ✅ Sin problema. Los templates generan etiquetas específicas ("Llevá X, pagá Y" / "2da unidad al X% OFF"), no un "% off" genérico, y evitan mostrar precio tachado incorrecto para estos tipos.

**Fricción adicional encontrada (fuera de la lista original) — 🟡 revisar antes del lunes:**
`app/ventas/page.tsx` reutiliza la misma clave de `localStorage` (`pos_role`) que `lib/posSession.ts` usa para el rol real del empleado, pero para un propósito distinto: marcar que la terminal fue desbloqueada con PIN de supervisor. `app/catalogo/page.tsx` lee esa misma clave para mostrar botones de alta/edición. Un cajero que destrabó una anulación con PIN de supervisor y no vuelve a bloquear la terminal puede seguir viendo esos botones habilitados en `/catalogo`. **No es una falla de seguridad real** — las rutas API validan el rol contra el JWT server-side, independientemente de esta clave — pero puede generar confusión y tickets de soporte el día del piloto (botón habilitado que después falla con 403).

---

## 3. SEGURIDAD

| Chequeo | Estado |
|---|---|
| Endpoints nuevos con verificación de sesión/rol | ✅ LIMPIO — los 16+ handlers revisados (`offers`, `pos/confirm`, `sales/items`, `home-summary`, `stock/adjust`, `products/*`, `catalog`, `marketing/*`, `ai/*`, `cash-closure`) llaman `getSessionFromRequest` y verifican rol en el handler, no solo confían en el middleware. Bulk price update y alta de catálogo exigen supervisor explícitamente |
| RPCs nuevas/modificadas con REVOKE/GRANT | ✅ LIMPIO — `bulk_update_product_prices_v2/v3`, `confirm_sale_with_stock`, `products_with_stock` tienen `REVOKE ALL FROM PUBLIC` + `REVOKE EXECUTE FROM anon, authenticated` + `GRANT EXECUTE TO service_role` |
| Llamadas anon-key desde cliente | ✅ LIMPIO — ningún componente `'use client'` ni página importa Supabase directamente; todo pasa por `fetch("/api/...")`. Los únicos usos de `createClient` son server-side (`lib/supabaseAdmin.ts`, `api/health`) o un stub mock |
| Precios siempre server-side | ✅ LIMPIO — `pos/confirm` ignora explícitamente `unit_price` del cliente y recalcula desde `products`/`product_offers`. Única excepción: `source: "scale_barcode"`, ya conocida y validada contra `is_weighted`. El fix de doble descuento hace que la RPC recalcule `sales.total` desde sus propias líneas, sin confiar en el total enviado |
| Asistente IA — alcance de datos | ℹ️ INFORMATIVO — cualquier sesión con rol `supervisor` ve datos de **todas** las sucursales (no hay restricción por sucursal asignada; `cajero` no tiene acceso a datos de negocio en absoluto). Parece intencional (rol gerencial único), pero **conviene confirmar como decisión de negocio** si hay supervisores locales que no deberían ver otras sucursales antes del lanzamiento |

Sin hallazgos de severidad alta/crítica en el código de los últimos ~25 commits.

---

## 4. CABOS SUELTOS

**En archivos tocados en las últimas sesiones:**
- `console.log`/`debugger` de debug: ✅ ninguno.
- `TODO`/`FIXME`/`HACK`: ✅ ninguno real (solo falsos positivos de grep en strings/comentarios en español).
- Código muerto sin uso en ningún call-site (limpieza recomendada post-lanzamiento, no bloqueante):
  - `removeFromQueue` y `clearQueue` en `lib/offlineQueue.ts`
  - `clearAllHolds` en `app/ventas/lib/hold.ts`
- Imports rotos / referencias a funciones inexistentes: ✅ ninguno (`tsc --noEmit` limpio).

**Inventario de SQL versionado vs. estado real de la DB** (informativo, no bloqueante — para decidir después del lanzamiento si vale la pena volcar el schema completo):

RPCs que el código llama pero que **no tienen `CREATE FUNCTION` versionado** en `sql/` (se crearon a mano en el editor de Supabase, solo aparecen referenciadas en los scripts de REVOKE/GRANT):
- `create_employee_with_pin`
- `update_employee_pin`
- `verify_employee_pin`
- `margin_suggestions`
- `register_cash_diff`
- `register_risk`
- `fn_top_products_range`
- `fn_top_products_range_all`
- `set_min_stock`

Constraints sin versionar:
- `ck_sm_qty_delta` sobre `stock_movements` (ya identificado en la verificación del 2026-07-03, sigue sin versionar).

---

## 5. VEREDICTO Y CHECKLIST

### Veredicto

**Listo para congelar y lanzar el lunes.** No se encontraron bloqueantes de código en ninguna de las 4 áreas auditadas. Los hallazgos son o bien deuda técnica preexistente (lint), o notas informativas para decisión de negocio, o limpieza cosmética recomendada para después del piloto.

**2 verificaciones recomendadas antes del lunes (no bloqueantes, resuelven en minutos):**
1. Confirmar que `ANTHROPIC_API_KEY` está seteada en el entorno real de Vercel (no solo en archivos locales) si el asistente IA se usa desde el día 1.
2. Confirmar como decisión de negocio si es correcto que cualquier supervisor vea datos de todas las sucursales vía el asistente IA (parece intencional, pero vale la confirmación explícita).

### Checklist final — pruebas en vivo del día 1

Estas no se pueden verificar por lectura de código, requieren hardware o condiciones reales:

- [ ] **Arranque 100% offline**: abrir `/ventas` con el router apagado, confirmar fallback a `localStorage` y venta con cache de IndexedDB.
- [ ] **Reconexión con ventas encoladas**: 2-3 ventas offline, reconectar, confirmar auto-sync sin duplicados (incluyendo recarga de página ya online con cola pendiente).
- [ ] **Sesión de 12+ horas**: turno largo sin recargar, confirmar que la venta se encola al expirar el JWT (no se pierde) y el toast es claro.
- [ ] **Balanza física — pesable real**: escanear un EAN-13 real, confirmar precio impreso = precio cobrado, y **decisión consciente del negocio** sobre el descuento de stock "1 unidad por venta" vs. kg reales en este camino (limitación de diseño preexistente, no bug de esta ronda).
- [ ] **WeightModal en dispositivo real**: teclado numérico y auto-foco funcionando en la tablet/celular de caja real.
- [ ] **Holds con múltiples cajas simultáneas**: dos cajeros, dos cajas, cada uno solo ve sus propios holds.
- [ ] **Cierre de caja con venta pesable anulada en el día**: verificar visualmente en `/cierres` que la anulada aparece tachada sin distorsionar el total a depositar.
- [ ] **Impresión**: confirmar con el equipo que no se va a imprimir tickets todavía (flujo PDF de 4 pasos, botones ocultos a propósito).
- [ ] **Nuevo — botones de supervisor en `/catalogo` tras destrabar con PIN**: verificar que un cajero que usó el PIN de supervisor para autorizar una anulación no se quede viendo botones de alta/edición de catálogo habilitados (fricción de UI encontrada en esta auditoría, sección 2).

---

*Auditoría realizada mediante 4 agentes en paralelo sobre el estado del repo en `main` al 2026-07-10, commit `b4bc1f2`.*
