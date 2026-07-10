# Verificación Final Pre-Lanzamiento — Super Juampy POS
**Fecha:** 2026-07-03
**Alcance:** integridad de los cambios de las últimas 5 sesiones (Tanda 1, Tanda 2, fix impresión saleFeedback, fix stock/adjust qty numeric) sobre la auditoría funcional del 2026-06-30.
**Método:** solo diagnóstico — lectura de código, typecheck, build, trazado manual de flujos. No se ejecutó contra una base de datos real ni se hicieron pruebas en vivo.

---

## VEREDICTO

**Listo para el piloto, con 1 acción recomendada (no bloqueante) antes del día 1.**

No encontré regresiones funcionales introducidas por los cambios recientes. El flujo de pesables (qty numeric) es coherente de punta a punta en el camino que fue tocado (carga manual con `WeightModal`). El fix de `stock/adjust` es correcto y no rompe el caso de enteros. Los 5 fixes de Tanda 1 y los 4 de Tanda 2 están completos, sin código muerto peligroso ni console.log de debug.

Encontré una pieza de **código muerto inofensivo** (no un bug activo, ver hallazgo #1) y **dos limitaciones preexistentes no relacionadas con esta ronda de fixes** que vale la pena tener documentadas para el día del lanzamiento (hallazgos #2 y #3).

---

## 1. INTEGRIDAD DE LOS CAMBIOS RECIENTES

### Typecheck y build
```
npx tsc --noEmit   → sin errores
npm run build      → Compiled successfully, 54/54 páginas generadas, sin warnings de TS
```
Limpios.

### Flujo de pesables (qty numeric) de punta a punta

Hay **dos caminos distintos** para vender un producto pesable, y hay que evaluarlos por separado:

**a) Carga manual (buscar por nombre/SKU → `WeightModal`)** — el camino que tocó el fix de Tanda 2:
- El modal captura gramos (`WeightModal`, `app/ventas/page.tsx:306-370`), valida `grams > 0`, muestra preview de precio en vivo.
- El carrito guarda `qty` en **gramos** (`app/ventas/page.tsx:1112`).
- Antes de armar el payload para `/api/pos/confirm`, `cartItemForConfirm()` (línea 61) convierte a **kilos**: `qty: isWeighted && !isScaleBarcode ? it.qty / 1000 : it.qty`.
- El backend (`app/api/pos/confirm/route.ts`) recibe la cantidad en kilos como `numeric`, no la redondea, y la pasa tal cual a `confirm_sale_with_stock`.
- El RPC (`sql/fix_confirm_sale_with_stock.sql`) usa `numeric` en todas las variables (`v_qty`, `v_cur_stock`, `v_deficit`) y hace `GREATEST(stock - v_qty, 0)` — sin truncar ni castear a entero.
- `void_sale_atomic` (`sql/void_sale_atomic.sql`) devuelve `sale_items.quantity` (numeric) tal cual al stock — coherente con lo que se descontó.
- **Conclusión: coherente de punta a punta.** Restar/sumar gramos en el modal (líneas 2020, 2054) también pasa por `updateQty`, que filtra el ítem si `qty <= 0` — no genera cantidades negativas.

**b) Escaneo de balanza (EAN-13)** — este camino **no fue tocado** por ninguno de los fixes de esta ronda:
- `parseBalanzaBarcode()` extrae PLU y precio ya calculado por la balanza. El ítem se marca `is_balanza: true`.
- `cartItemForConfirm()` para este caso **no convierte** — envía `qty: 1` siempre (ver comentario explícito en el tipo, línea 45: `"precio viene de la etiqueta de balanza, qty siempre 1"`).
- El backend, para `source: "scale_barcode"`, fuerza `quantity: 1` y usa el precio total tal cual vino del cliente (`app/api/pos/confirm/route.ts:359-364`).
- **Esto significa que el stock de un producto pesable vendido por balanza se descuenta en "1 unidad" por venta, no en la fracción de kg real vendida.** No es un bug de esta ronda — es una decisión de diseño de commits anteriores (`cb4e445 fix scale barcode and weighted item totals`), pero es una **inconsistencia real entre los dos caminos de venta de un mismo producto pesable**: si un local vende el mismo producto a veces por balanza y a veces cargándolo a mano, el stock de kilos se corrompe con el tiempo (subestima el consumo real cuando se usa balanza). No bloqueante para el piloto si la sucursal piloto no usa balanza física todavía, pero **si la balanza se usa en producción y el stock de pesables importa, esto va a generar diferencias de stock que no tienen que ver con ningún fix reciente.**

### Fix de `stock/adjust` (Math.abs sin redondeo)
```diff
- qty: Math.max(1, Math.round(Math.abs(item.delta))),
+ qty: Math.abs(item.delta),
```
Verificado con casos concretos:
- Delta entero (ej. `-3`): antes `Math.max(1, Math.round(3))=3`, ahora `Math.abs(-3)=3` → **idéntico, sin regresión**.
- Delta fraccionario (ej. `-0.1` al bajar de 5.5kg a 5.4kg): antes `Math.max(1, Math.round(0.1))=Math.max(1,0)=1` → violaba `qty=1` cuando el delta real era `0.1`, rompiendo el constraint `ck_sm_qty_delta` (abs(delta)=qty) → 500. Ahora `Math.abs(-0.1)=0.1` → coincide con `qty_delta`/`delta` → constraint satisfecho.

El fix es correcto y no tiene casos límite rotos para stock entero.

**Nota aparte (no bloqueante):** no encontré el DDL del constraint `ck_sm_qty_delta` en ningún archivo de `sql/` ni `supabase/` del repo — se aplicó directamente en el editor SQL de Supabase sin dejar rastro versionado. Es un riesgo de deriva de esquema (si se pierde el acceso a Supabase o se necesita reconstruir la DB desde el repo, este constraint no está documentado en el código). Sugerido para después del lanzamiento: volcar el esquema real (`pg_dump --schema-only` o el editor de Supabase) a un archivo versionado.

---

## 2. CONSISTENCIA GENERAL DEL FLUJO DE VENTA

| Escenario | Estado |
|---|---|
| Venta normal | OK — precio siempre desde DB, total recalculado server-side, rechaza `total <= 0` |
| Venta pesable manual | OK — ver sección 1a |
| Venta pesable balanza | OK en sí misma, pero ver limitación de stock en 1b |
| Venta con oferta | OK — `effectivePrice()` aplica `fixed_price`/`percent` antes de calcular total; ofertas store-specific priorizadas sobre globales |
| Venta offline | OK — se encola con el mismo `idempotency_key`, `cartItemForConfirm()` ya convirtió gramos→kg antes de encolar, así que el payload en `offlineQueue` ya está en las unidades correctas cuando se sincroniza |
| Anulación venta normal | OK — `void_sale_atomic` con `FOR UPDATE` (lock de fila, evita doble reversión de stock por voids concurrentes) |
| Anulación venta pesable | OK — devuelve `sale_items.quantity` (numeric, incluye decimales) sin redondear |
| Cierre de caja — totales | OK — `computeClosureTotals()` sólo suma `status = 'confirmed'`; usado tanto en el pre-cierre (`/api/cash-closure`) como en el guardado final (`/api/cash-closures`), sin discrepancia entre ambos |
| Cierre de caja — anuladas visibles sin sumar | OK — confirmado en `c0616df`: `/api/cash-closure` trae `status IN ('confirmed','anulada')` para mostrar en el detalle, pero sólo acumula cuando `isConfirmed` |

---

## 3. REGRESIONES POSIBLES

**No encontré regresiones activas.** Cosas puntuales que valen mención:

### Hallazgo #1 — Código muerto en `ConfirmSaleButton.tsx` (no es un bug visible, es limpieza pendiente)
`ConfirmSaleButton` tiene su propio modal de ticket (`showTicket`, líneas 227-250) con `imprimirTicket()` y el import de `exportReceiptPDF`. Tracé el flujo de confirmación: cuando `confirmar()` llama a `onConfirmed?.(saleId)`, el padre (`ventas/page.tsx`) ejecuta `setItems([])` de forma síncrona dentro del mismo handler. Como `ConfirmSaleButton` sólo se renderiza dentro de `{items.length > 0 && (...)}`, al vaciarse el carrito el componente entero **se desmonta en el mismo ciclo de render**, junto con su estado `showTicket`. En la práctica esto significa que el modal de `ConfirmSaleButton` nunca llega a pintarse — coincide exactamente con lo que dice el commit `59cfd76`: *"el modal que se ve en producción"* es el `saleFeedback` de `ventas/page.tsx`, no este.
No es necesario arreglar nada para el lanzamiento (no genera un modal duplicado ni bloquea nada), pero como limpieza futura convendría eliminar `showTicket`/`imprimirTicket`/el import de `exportReceiptPDF` de `ConfirmSaleButton.tsx` para que no confunda a quien lo lea después.

### Holds por caja, auto-sync, offline fallback — sin regresiones
- **Holds**: `saveHold`/`getHolds` ahora filtran por `register_id` de forma consistente en los 4 call-sites de `ventas/page.tsx` (holdCart, resume, refresh tras confirmar, refresh en polling). No quedó ningún call-site viejo sin el parámetro.
- **Auto-sync**: el `useEffect` de montaje en `useOnlineSync.ts` usa el ref one-shot `initialSyncDone` correctamente — sólo dispara `sync()` una vez al montar si hay cola pendiente y hay conexión. (Nota menor de eficiencia, no de correctitud: `sync` cambia de identidad cada vez que `syncing` cambia de valor, lo que hace que el `useEffect` que registra los listeners `online`/`offline` se vuelva a ejecutar — remueve y vuelve a agregar los listeners en cada sync. Es simétrico y no genera fugas ni duplicados, así que no es un bug, sólo churn innecesario.)
- **Offline fallback de stores/registers** (Tanda 1): revisado, usa `posEmployeeRef.current?.store_id`/`register_id` como fallback cuando el fetch falla, tal como se documentó.

### Console.log / TODO / código a medias
Grep sobre los 8 archivos tocados en las 4 sesiones (`app/ventas/page.tsx`, `app/ventas/lib/hold.ts`, `components/ConfirmSaleButton.tsx`, `lib/useOnlineSync.ts`, `app/api/stock/adjust/route.ts`, `app/api/pos/confirm/route.ts`, `app/api/cash-closure/route.ts`, `lib/offlineQueue.ts`) — **cero** `console.log`/`console.debug`/`TODO`/`FIXME`/`debugger` sueltos. Los `console.error` presentes son manejo de errores intencional.

---

## 4. LO QUE FALTA PROBAR EN VIVO (checklist día del lanzamiento)

Estas cosas no se pueden verificar por lectura de código — necesitan hardware o condiciones reales:

- [ ] **Arranque 100% offline**: abrir `/ventas` con el router apagado y confirmar que `selectedStoreId`/`selectedRegisterId` caen al fallback de `localStorage` y se puede buscar/vender con el cache de IndexedDB.
- [ ] **Reconexión con ventas encoladas**: hacer 2-3 ventas offline, reconectar, confirmar que el auto-sync dispara sin que el cajero tenga que tocar el badge, y que no se duplican ventas (probar también recargar la página ya online con cola pendiente).
- [ ] **Sesión de 12+ horas**: turno largo sin recargar — confirmar que al expirar el JWT, la venta se encola (fix de Tanda 1) en vez de perderse, y que el toast de "sesión expirada" es claro para el cajero.
- [ ] **Balanza física — pesable real**: escanear un EAN-13 de balanza real y confirmar que el precio impreso coincide con lo cobrado, y decidir conscientemente si el descuento de stock "por unidad" (no por kg) en este camino es aceptable para el negocio (ver hallazgo de la sección 1b) o si hay que ajustar antes de habilitar balanza en el piloto.
- [ ] **WeightModal en el dispositivo real**: confirmar que el teclado numérico se abre bien en la tablet/celular de caja (`inputMode="decimal"`) y que el auto-foco/auto-select funciona con el hardware real (esto reemplazó `window.prompt()`, que sí funcionaba en todos los navegadores aunque fuera feo).
- [ ] **Holds con múltiples cajas simultáneas**: dos cajeros en dos cajas distintas de la misma sucursal, cada uno pone una venta en espera — confirmar visualmente que cada uno sólo ve las suyas.
- [ ] **Cierre de caja con venta pesable anulada en el día**: confirmar visualmente en `/cierres` que la anulada aparece tachada en el detalle pero no distorsiona el total a depositar.
- [ ] **Impresión**: confirmar con el equipo que, efectivamente, no van a imprimir tickets todavía (el botón está oculto a propósito) — si llega la impresora térmica antes del día 1, hay que reactivar los dos botones comentados (`ConfirmSaleButton.tsx` y `ventas/page.tsx`, buscar el comentario "re-habilitar cuando llegue la impresora térmica").

---

## RESUMEN

**¿Está listo?** Sí, para el piloto en la sucursal.

**¿Algo a arreglar SÍ o SÍ antes del día 1?** Nada bloqueante encontrado en el código. La única decisión de negocio pendiente (no un bug) es si la balanza física va a usarse desde el día 1 — si es así, alguien del negocio debería decidir conscientemente si el descuento de stock "1 unidad por venta" en vez de "kg reales" es aceptable, o si conviene postergar el uso de balanza hasta ajustarlo.

**Recomendación de bajo esfuerzo, no bloqueante:** limpiar el código muerto de `ConfirmSaleButton.tsx` (`showTicket`/`imprimirTicket`) en algún momento post-lanzamiento, para que no confunda a futuras sesiones de debugging.
