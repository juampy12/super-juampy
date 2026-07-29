# Super Juampy — mapa de referencia

POS + gestión para un supermercado familiar (Charata, Chaco, Argentina). **En producción**, 2 sucursales activas: **Alberdi** y **San Martín** (2 cajas c/u, login por empleado). **Tacuarí está desactivada** (`stores.active=false` / `registers.active=false` en DB, sacada a mano de `lib/stores.ts`) — queda como registro histórico, no como sucursal operativa.

## Stack
Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase (Postgres + RPC + auth propia), Anthropic SDK (`app/inteligencia`), desplegado en Vercel. Auth: cookie `sj_pos_auth` (JWT, `lib/jwt.ts`) verificada en `middleware.ts`; roles `supervisor` / cajero (`lib/session.ts` — `isSupervisor`, `forbidCashierStoreMismatch`).

**CSP:** estático en `middleware.ts` (sin nonce — Next 16 pre-renderiza HTML estático, incompatible con nonce por-request). No confundir con esquemas de nonce vistos en commits viejos.

## Módulos (`app/`)
| Ruta | Qué hace |
|---|---|
| `/ventas` | POS — caja, cobro, hold, offline (archivo grande, ~2700 líneas) |
| `/products` | Alta/edición de precios y costos (carga manual, `vat_rate` explícito) |
| `/importar-precios` | Carga masiva de listas de proveedor (Haldemann, etc.) → `bulk_update_product_prices_v3` |
| `/etiquetas` | Etiquetas de góndola en PDF (`app/_utils/labelsPdf.ts`) |
| `/catalogo` | Listado de productos |
| `/stock`, `/stock-bajo`, `/minimos` | Inventario y alertas |
| `/ofertas` | Promociones (motor de precios con oferta) |
| `/reports`, `/cierres` | Reportes de ventas y cierre de caja |
| `/empleados` | Alta/gestión de empleados y PIN |
| `/inteligencia` | Panel IA (Claude), márgenes, diferencias de caja |
| `/pos-login` | Login de empleados (online + fallback offline) |

## `lib/` clave
- `posSession.ts` — sesión POS en localStorage (empleado, cache de stores/registers para fallback offline)
- `offlineAuth.ts` — login offline: PBKDF2-SHA256 en IndexedDB, independiente del hash del servidor (`verify_employee_pin`); `ensureSession()` es el gate que hay que esperar antes de cualquier fetch autenticado al reconectar
- `offlineQueue.ts` — cola de ventas offline (`pos_offline_queue_v1`) + cola de ventas fallidas por rechazo de negocio (`failed_sales_queue_v1`, nunca se descarta sola)
- `useOnlineSync.ts` — sync automático con backoff + latido de fondo al reconectar
- `session.ts` / `jwt.ts` — verificación de sesión y rol en cada API route
- `stores.ts` — lista de sucursales activas (data-driven a medias: Tacuarí se sacó a mano)
- `supabaseAdmin.ts` — cliente Supabase server-side (service role)

## API (`app/api/`)
`pos/confirm` (venta — server valida precio real vs. `client_unit_price` solo para detectar desfasajes), `pos/products-by-ids`, `products/*` (create, update, bulk-update, bulk-price-import, bulk-create, search, catalog, stats, deactivate), `sales/*`, `stock/*`, `cash-closure(s)`, `registers`, `stores`, `offers`, `reports/*`, `employee(s)/*`, `intelligence/*`, `ai/*`, `marketing/*`, `audit/operations`, `health`.

## Funciones SQL clave — ⚠️ no todas están versionadas
Supabase es la fuente de verdad; el repo tiene copias parciales y a veces desactualizadas en `sql/`, `supabase/` y la raíz (`fix_confirm_sale.sql`, `v_views.sql`). **Antes de asumir el comportamiento de un RPC, mirar la DB real, no solo el repo.**

**Con archivo en el repo (pero verificar si es la versión realmente aplicada):**
- `confirm_sale_with_stock` — `sql/fix_confirm_sale_with_stock.sql`, `sql/fix_confirm_sale_double_discount.sql` (dos parches históricos, no una única fuente canónica)
- `products_with_stock` — `sql/products_with_stock_price_filter.sql`, `sql/product_offers_promo_engine.sql` (varias firmas superpuestas en el tiempo)
- `bulk_update_product_prices_v3` — `sql/bulk_update_product_prices_v3.sql`, con una revisión más nueva en `sql/products_price_updated_at.sql` (**sin confirmar si ya se aplicó en Supabase** — ver `MEMORY.md`/memoria de sesión antes de tocar precios)
- `products_price_stats`, `void_sale_atomic`, `low_stock_products` — un solo archivo cada una, más confiables
- `create_employee_with_pin`, `update_employee_pin` — `supabase/employees_functions.sql`

**Solo viven en Supabase (sin CREATE FUNCTION en el repo, solo mencionadas en scripts de `REVOKE`):**
`verify_employee_pin` (login — la RPC de auth real), `fn_top_products_range`, `fn_top_products_range_all`, `margin_suggestions`, `register_cash_diff`, `register_risk`, `set_min_stock`.

Si algo de precios/etiquetas falla con "function ... does not exist" o "is not unique", lo primero es preguntar si el `.sql` correspondiente ya se corrió en el editor de Supabase — no asumir.

## Reglas de oro
1. **El usuario no programa.** No ejecuta código directo — se le dan prompts/scripts exactos para copiar y pegar. **Todo SQL se revisa con él en el chat antes de que lo corra** en el editor de Supabase; nunca asumir que ya lo corrió sin preguntar.
2. **SQL primero en Supabase, después push.** Cambios de función/columna se aplican a mano en el editor SQL de Supabase; el repo documenta pero no despliega SQL automáticamente.
3. **Verificar la rama antes de commitear.** Se trabaja en `main`. La rama `fidelizacion` tiene una feature de fidelización de clientes en desarrollo aparte (diverge de `main`: 4 commits propios que `main` no tiene, y `main` tiene 16 que ella no tiene) — **nunca se mergea sin pedido explícito**.
4. **Costo con IVA incluido → `vat_rate=0`.** En `/importar-precios` (`bulk-price-import` → `bulk_update_product_prices_v3`) el costo que llega del proveedor ya incluye IVA, así que se manda `vat_rate=0` para no duplicarlo en el precio sugerido. Distinto de `/products` (alta manual), que sí usa `vat_rate` explícito (default 21) sobre costo neto.
5. **El margen (`markup_rate`) es por producto — las reimportaciones lo pisan.** Se ajusta a mano en `/products`. Si una reimportación de `/importar-precios` trae `cost_net` para ese producto, `bulk_update_product_prices_v3` sobreescribe `markup_rate` con el margen de esa fila de la lista (o **0** si la lista no trae margen explícito) — un margen tocado a mano en `/products` se pierde en la próxima reimportación de precios de ese producto si esa fila trae costo.
6. **El precio de venta es server-side.** El POS nunca confía en el precio que manda el cliente como verdad final — `confirm_sale_with_stock` en la DB es quien decide; `client_unit_price` solo se usa para detectar desfasajes (oferta vencida, etc.).
7. **El circuito offline no se toca a la ligera.** Tres niveles en cascada: memoria → respaldo cifrado (`localStorage`+`sessionStorage`, TTL 24h) → modal de PIN. Cualquier fetch autenticado que dispare al reconectar debe pasar por `ensureSession()` primero (no solo reaccionar a un 401).
8. **Auth check en cada handler**, nunca depender solo del middleware (`isSupervisor` + `getSessionFromRequest` en cada route.ts que escribe).

## Sensible — tocar con cuidado
- **`confirm_sale_with_stock`** (RPC) y `app/api/pos/confirm/route.ts` — descuenta stock y registra venta atómicamente; múltiples fixes históricos de doble descuento.
- **`bulk_update_product_prices_v3`** — se usa en caliente desde el importador (`bulk-price-import`, `bulk-create`) y desde `/products` (`bulk-update`), con múltiples call-sites simultáneos en producción. Cualquier cambio de firma debe ser **aditivo** (parámetro nuevo con default/NULL-safe vía `COALESCE`), nunca romper la firma existente.
- **Login (online + offline)** — `app/pos-login/`, `lib/offlineAuth.ts`, `verify_employee_pin`. El login offline tuvo 4 bugs de campo reales (2026-07-21/23) por condiciones de carrera al reconectar.
- **Circuito offline completo** (`offlineQueue.ts`, `useOnlineSync.ts`, `offlineAuth.ts`) — probado recién en piloto real, sigue siendo lo más frágil del POS.
- **Pesables por balanza** — descuentan stock "1 unidad" en vez de la fracción real de kg vendida (`app/ventas/page.tsx`, `cartItemForConfirm`); decisión de negocio pendiente, no bug a "arreglar solo". Además, hoy no se trackea el stock real en kg de los pesables en general — **se reponen a ojo**, sin conteo preciso.

## Convenciones de trabajo con Claude
- Antes de un cambio de precios/etiquetas, chequear si hay SQL pendiente de aplicar (`sql/products_price_updated_at.sql` a la fecha de este archivo, ver memoria de sesión para estado actualizado).
- `npm run typecheck` antes de cualquier commit.
