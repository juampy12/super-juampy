# Auditoría — "No aparecen todos los productos en el catálogo"

**Fecha:** 2026-07-29
**Alcance:** solo diagnóstico, sin cambios de código ni de SQL.
**Método:** conteo directo contra la DB real de Supabase (REST API con service role key, solo lecturas) + lectura de código (`app/products/page.tsx`, `app/catalogo/page.tsx`, `app/api/products/search/route.ts`, `app/api/products/catalog/route.ts`, `app/etiquetas/page.tsx`) + SQL desplegado (`sql/products_with_stock_price_filter.sql`, `sql/products_price_updated_at.sql`).

## Resumen ejecutivo

La pantalla que efectivamente funciona como "catálogo navegable" es **`/products` (pestaña "Precios")**, no `/catalogo` (que es un formulario de alta/edición, sin listado — ver punto 5). En `/products`, la vista **"Todos"** pierde productos por un techo de **1000 filas que impone PostgREST** sobre el RPC `products_with_stock`, combinado con que ese RPC **no soporta paginación real vía `Range`/offset** (confirmado empíricamente, no es una sospecha). Resultado medido: de **3260 productos activos**, la vista "Todos" solo puede mostrar como máximo **984**, sin aviso al usuario. El resto (**~2276 productos, ~70% del catálogo activo**) es inalcanzable clickeando "siguiente", sin importar cuántas veces se haga.

Además, el mismo defecto deja **latente un cuelgue/loop infinito** en cualquier llamada que dependa de `all:true` para traer más de 1000 filas — hoy eso incluye potencialmente "Etiquetas → Todo el catálogo" (~3038 productos activos con precio > 0, muy por encima de 1000).

## 1. Conteo real (DB) vs mostrado

Consulta directa a Supabase (REST, `Prefer: count=exact`):

| Métrica | Valor |
|---|---|
| `products` — total de filas | **3311** |
| `products` — `active = true` | **3260** |
| `products` — `active = false` | 51 |
| `products` — `active IS NULL` | 0 |
| Activos con `price = 0` (sin costo cargado) | 222 (≈ el "221" que menciona CLAUDE.md — consistente, la diferencia de 1 es normal por altas/ediciones desde entonces) |
| Activos con `price > 0` | 3038 |

Sobre el "~2.532 del import Haldemann": no es comparable 1:1 contra el total de 3311. Ese número es la cantidad de líneas de **una lista de un proveedor puntual** (Haldemann) cargada en `/importar-precios`; el catálogo total incluye además productos propios y de otros proveedores. No hay una discrepancia que explicar ahí — son universos distintos.

**Mostrado efectivamente en `/products` → pestaña "Todos"** (sin filtro de estado, sin búsqueda): **como máximo 984** productos visibles, sin importar cuántas páginas se recorran (ver punto 2 para el porqué). **Faltante: ~2276 productos activos.**

## 2. Límites / paginación — CAUSA RAÍZ (crítico)

### El hallazgo, confirmado con pruebas directas contra la DB

Se llamó al RPC `products_with_stock` por REST exactamente como lo hace el backend (`supabaseAdmin.rpc(...)`), variando `p_limit` y el header `Range`:

```
POST /rpc/products_with_stock  { p_store, p_query: null, p_limit: 5000, p_price_filter: null, p_recent_hours: null }
→ HTTP 200, content-range: 0-999/*  →  1000 filas devueltas (no 5000, no 3260)
```

Osea: **por más que la función SQL pida `LIMIT 5000` (o cualquier valor), PostgREST corta la respuesta HTTP a 1000 filas.** Esto es exactamente el mismo patrón de bug que ya afectó a `/etiquetas` (mencionado en el pedido de auditoría, "980/1000").

Luego se probó si `.range()` (el mecanismo que el código usa para "traer todo por bloques") realmente pagina más allá de esas 1000 filas:

```
Range: 0-999      → primeras 1000 filas (A.M.VILLA... → DON SATUR...)
Range: 1000-1999  → LAS MISMAS 1000 filas, idénticas
Range: 2000-2999  → LAS MISMAS 1000 filas, idénticas
Range: 3000-3999  → LAS MISMAS 1000 filas, idénticas
```

**El header `Range` no tiene ningún efecto sobre este RPC.** Siempre devuelve la misma "primera página" de 1000 filas (ordenadas por nombre), sin importar el offset pedido. La causa más probable: `products_with_stock` está declarada `LANGUAGE sql` **sin `STABLE`** (por default en Postgres es `VOLATILE`), y PostgREST no aplica paginación real (Range/offset) sobre funciones volátiles — solo aplica el techo de `db-max-rows` (1000) desde el principio, siempre.

### Impacto concreto en el código

**a) `/products`, vista "Todos" (el bug reportado):**
`app/products/page.tsx` — `reload()` (línea 189-229) pide `p_limit = dataLimit` (arranca en `pageSize = 200`, línea 106) **sin `all:true` y sin `.range()`** (confirmado en `app/api/products/search/route.ts`, rama `if (all) {...}` vs la rama default de la línea 70-76 — esta última no usa `.range()` en ningún caso). Al avanzar de página, `goNextPage()` (línea 280-295) sube `dataLimit` a `(nextPage+1)*pageSize`. Mientras `dataLimit ≤ 1000` (páginas 1 a 5), todo funciona. **Desde la página 6 en adelante (`dataLimit > 1000`), la respuesta queda pegada en las mismas 1000 filas** (las primeras alfabéticamente), por lo que `rows` deja de crecer. El botón "▶" no se deshabilita (`disabled={loading || !storeId}`, línea 523, no depende de `maxPage`), así que el usuario puede seguir clickeando sin que pase nada ni haya ningún error — la UI simplemente no avanza más allá de la página 5.
De esas 1000 filas "techo", 16 son inactivas y se filtran client-side (`app/products/page.tsx:211`), quedando **984 productos realmente visibles**, de un total de 3260 activos.

**b) Riesgo latente de cuelgue (no confirmado en producción, sí en el código):**
El modo `all:true` de `app/api/products/search/route.ts` (línea 41-67) pagina así:
```js
while (true) {
  const { data } = await supabaseAdmin.rpc(...).range(offset, offset + PAGE_SIZE - 1); // PAGE_SIZE=1000
  allRows.push(...(data ?? []));
  if (!data || data.length < PAGE_SIZE) break;   // ← nunca se cumple si el total real es >1000
  offset += PAGE_SIZE;
}
```
Como `Range` no pagina de verdad sobre esta función, cuando el resultado real supera 1000 filas, `data.length` es **siempre exactamente 1000** — la condición de corte nunca se cumple y el loop no termina solo (seguiría agregando la misma página una y otra vez hasta que el timeout/memoria de la función serverless lo mate).
- **`loadStatusRows`** (`app/products/page.tsx:235-261`, pestañas "Sin costo/Sin margen/Bajo costo/Manuales/Revisar") usa este mismo modo `all:true`, pero hoy está a salvo **por casualidad**: todos esos filtros dan menos de 1000 resultados (no_cost=222, no_margin=140, below_cost=0, manual=5 — verificado contra `products_price_stats`). Si alguno cruzara las 1000 filas, quedaría expuesto al mismo cuelgue.
- **`/etiquetas` → "Todo el catálogo"** (`app/etiquetas/page.tsx:107-150`, función `loadAllProducts`) llama `all:true` **sin `price_filter`**, pidiendo potencialmente **los 3038 productos activos con precio > 0** — muy por encima de 1000. Este flujo **no está a salvo**: con los datos reales de la DB, el loop descripto arriba no tiene forma de terminar solo. Vale la pena probarlo manualmente antes del lunes si "Todo el catálogo" en etiquetas se va a usar para una tirada grande de precios.

## 3. Filtros que esconden productos

- **`p_price_filter` / "sin costo" (los 221-222 sin costo):** el SQL en `sql/products_with_stock_price_filter.sql` documenta explícitamente un bug histórico ya resuelto: antes los filtros de estado (Sin costo, Sin margen, etc.) filtraban client-side solo sobre la página ya cargada, mostrando ~30 en vez de 221. Se corrigió agregando `p_price_filter` server-side. **Verificado en la DB real que la versión desplegada ya lo tiene** (la llamada RPC con `p_recent_hours` — parámetro de una revisión posterior — respondió sin error, así que ambas revisiones ya están aplicadas en Supabase). `products_price_stats()` devuelve `{total:3260, manual:5, no_cost:222, no_margin:140, below_cost:0}`, coherente con el conteo directo. **OK, sin hallazgo** — este bug puntual ya está resuelto.
- **`viewFilter` / `STATUS_FILTERS` por defecto:** al abrir `/products`, `viewFilter` arranca en `"all"` → no aplica ningún filtro de estado. **OK.**
- **`p_recent_hours`:** solo se activa cuando `/etiquetas` pide explícitamente el modo "recientes"; en `/products` y en el modo normal de `/etiquetas` viaja como `null`. **OK, no oculta nada por defecto.**
- **Columna `active`:** el RPC solo exige `active = true` cuando `p_price_filter` viene seteado (línea 100 del SQL); en la carga normal (`p_price_filter = null`) el RPC devuelve activos **e inactivos**, y es `app/products/page.tsx:211` quien filtra `active !== false` en el cliente. Funciona, pero es responsabilidad exclusiva del frontend — no hay riesgo hoy porque el filtro está presente, solo se deja constancia de que es un punto único de falla.

**Veredicto punto 3: OK**, sin hallazgos nuevos — el problema real está en el punto 2, no acá.

## 4. Scoping por sucursal / stock

- `products_with_stock` hace **`LEFT JOIN public.product_stocks`** (confirmado leyendo el SQL desplegado, ambas revisiones), no `INNER JOIN`. Un producto sin fila de stock en la sucursal seleccionada **no desaparece**: aparece con `stock = 0` vía `COALESCE(ps.stock, 0)`. **Descartada esta hipótesis como causa del faltante.**
- Dato adicional (no es la causa del bug, pero es información nueva relevante para otras pantallas — stock bajo, reportes): de los 3260 productos activos, solo **2352 tienen alguna fila en `product_stocks`** — el mismo conjunto exacto de 2352 IDs se repite en Alberdi, San Martín **y Tacuarí** (verificado byte a byte, mismo set en las tres sucursales). Eso deja **908 productos activos sin ninguna fila de stock en ninguna sucursal** (aparecen con stock 0 en el catálogo, lo cual es correcto, pero no van a salir nunca en `/stock`, `/stock-bajo` ni en alertas de mínimos si esas pantallas hacen `INNER JOIN` — no se auditaron esas pantallas, quedó fuera de alcance de este pedido).

**Veredicto punto 4: OK** respecto al catálogo — no es la causa. Hallazgo secundario informativo sobre `product_stocks`, sugerido como línea de auditoría aparte si hay tiempo antes del lunes.

## 5. `/catalogo` vs `/products`

Son pantallas completamente distintas, con orígenes de datos distintos:

- **`/catalogo`** (`app/catalogo/page.tsx`): es un formulario de **alta y edición** ("Crear producto" / "Editar y Desactivar"), **no tiene ningún listado por defecto** — al entrar, la pestaña "Editar" arranca vacía y exige que el usuario escriba un término de búsqueda. Pega contra `app/api/products/catalog/route.ts` (consulta directa a la tabla `products`, sin RPC). Tiene dos topes duros sin aviso de truncamiento:
  - Búsqueda por texto: `limit: 50` fijo (línea 293), sin "cargar más".
  - "Ver desactivados": `limit: 300` fijo (línea 251).
  Con 51 productos inactivos hoy, el tope de 300 no se nota — pero el de 50 en búsquedas por texto sí podría, si alguien busca un término genérico con más de 50 coincidencias.
- **`/products`** (pestaña "Precios"): es el catálogo navegable real, vía RPC `products_with_stock`, con paginación incremental y filtros de estado. Es donde vive el bug del punto 2.

**Hallazgo (severidad media, documentación):** `CLAUDE.md` describe `/catalogo` como *"Listado de productos"* — la descripción no coincide con el código real (es un CRUD sin listado). Esto puede confundir a futuras auditorías o al propio dueño del negocio si busca "el catálogo completo" ahí.

## Veredicto por punto

| # | Punto | Veredicto |
|---|---|---|
| 1 | Conteo real vs mostrado | **Hallazgo crítico** — 3260 activos en DB, 984 alcanzables en "Todos", ~2276 inalcanzables |
| 2 | Límites / paginación | **Hallazgo crítico (causa raíz)** — techo de 1000 filas de PostgREST + `Range` sin efecto sobre `products_with_stock` (probable falta de `STABLE` en la función) |
| 3 | Filtros que esconden productos | OK — el bug histórico de "sin costo" ya está resuelto y verificado en la DB real |
| 4 | Scoping por sucursal / stock | OK — `LEFT JOIN` confirmado, no oculta productos. Hallazgo secundario informativo sobre `product_stocks` (908 productos activos sin fila de stock en ninguna sucursal) |
| 5 | `/catalogo` vs `/products` | Hallazgo medio — son pantallas distintas con propósitos distintos; `/catalogo` no lista nada por defecto y tiene topes de 50/300 sin aviso; la documentación de `CLAUDE.md` está desactualizada al respecto |

## Pendientes / fixes propuestos (NO aplicados)

1. **Prioridad alta:** marcar `products_with_stock` como `STABLE` en el `CREATE FUNCTION` (es una función de solo lectura, no debería haber objeción semántica), para que PostgREST pueda paginar de verdad vía `Range`/offset. Alternativa más explícita y menos dependiente de comportamiento interno de PostgREST: agregar un parámetro `p_offset` a la función SQL y que el backend lo use directamente en vez de confiar en `.range()`.
2. **Prioridad alta:** agregar un corte de seguridad (máximo de iteraciones, o límite total de filas) al loop `while (true)` de la rama `all:true` en `app/api/products/search/route.ts`, para que un descuadre futuro similar produzca un error controlado en vez de un cuelgue silencioso.
3. **Antes del lunes, probar manualmente** "Etiquetas → Todo el catálogo" con la sucursal real — con 3038 productos activos con precio candidatos, es la ruta con más probabilidad de estar rota ahora mismo (cuelgue/timeout) según el análisis del punto 2.
4. **Prioridad media:** en `/products`, mientras no se resuelva 1, evaluar deshabilitar o advertir visualmente el botón "▶" cuando `dataLimit` supera 1000 (o cambiar la vista "Todos" para usar el mismo camino `all:true` que ya usan las pestañas de estado, una vez arreglado el punto 1).
5. **Prioridad baja:** en `/catalogo`, subir o eliminar el tope de 50 en búsqueda por texto (o al menos avisar "mostrando los primeros 50, refiná la búsqueda" cuando `results.length === 50`).
6. **Documentación:** corregir la fila de `/catalogo` en `CLAUDE.md` — no es un "listado de productos", es alta/edición/desactivación sin listado por defecto.
