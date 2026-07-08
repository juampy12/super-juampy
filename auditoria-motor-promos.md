# Auditoría post-implementación — motor de promos (nxm + second_unit_pct)

Fecha: 2026-07-07 (fecha de sesión). Solo diagnóstico, no se modificó código.

Alcance revisado: `app/api/pos/confirm/route.ts`, `sql/product_offers_promo_engine.sql`
(RPC `confirm_sale_with_stock`, `products_with_stock`), `app/ventas/page.tsx`,
`app/ventas/historial/page.tsx`, `app/api/sales/items/route.ts`,
`sql/void_sale_atomic.sql`, `lib/offlineQueue.ts`, `lib/computeClosureTotals.ts`,
`app/api/reports/top-products/route.ts`, `app/api/intelligence/margin-suggestions/route.ts`,
`app/api/ai/assistant/route.ts`, `app/api/ai/alerts/route.ts`,
`app/api/marketing/products/route.ts`, `app/api/marketing/suggestions/route.ts`,
`app/marketing/page.tsx`, `app/etiquetas/page.tsx`, `v_views.sql`.

---

## 🔴 Hallazgo crítico — descuento aplicado DOS VECES en `sale_items`

**Severidad: CRÍTICA.** Afecta a toda venta con oferta `nxm` o `second_unit_pct`.

### Qué pasa

`/api/pos/confirm/route.ts` calcula el precio blended (agrupación + `billed_units` +
`ROUND`) y lo guarda como `unit_price` dentro de `finalItems`, que es exactamente lo
que se envía como `p_items` a la RPC:

```ts
// app/api/pos/confirm/route.ts (líneas ~394-410)
let unit_price = product.price;
if (offer.type === "nxm" ...) {
  ...
  unit_price = roundMoney((billedUnits * product.price) / quantity); // ← YA BLENDED
}
finalItems.push({ product_id, quantity, unit_price }); // esto se manda a la RPC
```

La RPC `confirm_sale_with_stock` recibe ese `unit_price` (ya blended) como
`v_group.unit_price`, vuelve a buscar la MISMA oferta ganadora, y **repite la
fórmula de grupos usando ese precio ya descontado como si fuera el precio de
lista**:

```sql
-- sql/product_offers_promo_engine.sql (líneas ~253-254)
v_billed_units := (v_full_groups * v_offer_qty_pay) + v_remainder;
v_final_price  := ROUND((v_billed_units * v_group.unit_price) / v_group.quantity, 2);
```

Resultado: `sale_items.unit_price` queda con el descuento aplicado dos veces,
mientras que `sales.total` (calculado una sola vez por el TS, correctamente) y
`payment.total_paid` (validado contra ese mismo total) **quedan bien**. Se genera
una divergencia entre lo que el cliente pagó (correcto) y lo que queda registrado
línea por línea (incorrecto, mucho más bajo).

### Ejemplo numérico (2x1, precio $100, qty=2)

| Paso | Cálculo | Resultado |
|---|---|---|
| TS (`/api/pos/confirm`) | `billedUnits=1`, `blended=ROUND(100×1/2,2)` | **$50** → se manda a la RPC |
| TS `sales.total` | `roundMoney(2×50)` | **$100** ✅ (correcto: 2x1 = pagás 1) |
| RPC (recibe `v_group.unit_price=50`) | `billedUnits=1`, `ROUND(50×1/2,2)` | **$25** ❌ |
| `sale_items` grabado | `quantity=2, unit_price=25` | "revenue" registrado = **$50** (la mitad de lo cobrado) |

El cliente pagó $100 (correcto), pero `sale_items` — la fuente de todo lo que se
lee después (ticket, historial, reportes, IA) — dice que la venta de esa línea
fue de $50.

### Por qué pasó

Es un problema de diseño entre capas: el TS *tenía* que calcular el precio blended
para poder validar el pago contra el total real (así se pidió explícitamente:
"la misma fórmula que la RPC"). Pero luego ese mismo número blended se reenvía
como `unit_price` a una RPC que *también* sabe recalcular el blended — y lo hace,
sin saber que el valor que recibió ya venía descontado.

### Qué NO se ve afectado

- `sales.total` y `payment.total_paid` — correctos (el TS es la única fuente).
- `stock_movements` / `product_stocks` — dependen de `quantity`, no de precio.
- Cierre de caja (`computeClosureTotals`) — lee `sales.total`/`payment`, nunca
  `sale_items`. **No está afectado por este bug.**
- `void_sale_atomic` — restaura stock por `sale_items.quantity` (unidades reales),
  no por precio. **No está afectado.**

### Qué SÍ se ve afectado (todo lo que lee `sale_items.unit_price`)

- Detalle expandible de "Últimas ventas" en el POS y de `/ventas/historial`: la
  suma de líneas (`quantity × unit_price`) **no va a coincidir** con el total del
  encabezado de la venta. Esto debería ser visible apenas se pruebe un ticket real.
- Reportes de ingresos / top products si `fn_top_products_range(_all)` agrega desde
  `sale_items` (ver más abajo — no se pudo confirmar el cuerpo de esas funciones).
- Los bloques `top_productos_semana` / `top_productos_mes` que arma
  `/api/ai/assistant` para el asistente de IA, por la misma vía.

### Fix sugerido (no aplicado — solo diagnóstico)

La RPC no debería recalcular NADA de precio para `nxm`/`second_unit_pct`: el TS ya
es la autoridad de precios (igual que para `percent`/`fixed_price`, donde la RPC
ya confía ciegamente en `v_group.unit_price`). La RPC solo necesita usar
`v_offer.type`/`qty_buy`/`qty_pay`/`value` para poblar las columnas informativas
de `sale_items` (auditoría/badge), **no para recalcular el precio**. Es decir: en
las ramas `nxm` y `second_unit_pct`, remover el cálculo de `v_billed_units`/
`v_final_price` y dejar siempre `v_final_price := v_group.unit_price` (igual que
la rama `ELSE` ya hace).

---

## 1. Correctitud del cálculo (verificación matemática)

### Fórmula, símbolo a símbolo

TS (`/api/pos/confirm`) y RPC (`confirm_sale_with_stock`) usan estructuralmente
la MISMA fórmula (agrupación → `fullGroups`/`remainder` → `billedUnits` →
`ROUND(billedUnits × precio / qty, 2)`). El problema no es que difieran — es que
la RPC la aplica una segunda vez sobre un valor que el TS ya transformó (ver
hallazgo crítico arriba). Descontando ese bug, el diseño matemático en sí es
correcto y ambos lados coinciden.

### Tabla de verificación (precio base $100, aplicación ÚNICA — la intención de diseño)

**2x1** (`qty_buy=2, qty_pay=1`):

| qty | billedUnits | blended | total (qty×blended) | nota |
|---|---|---|---|---|
| 1 | 1 | $100.00 | $100.00 | sin descuento (correcto, no completa el par) |
| 2 | 1 | $50.00 | $100.00 | exacto |
| 3 | 2 | $66.67 | $200.01 | +1¢ (redondeo aceptado, ver más abajo) |
| 4 | 2 | $50.00 | $200.00 | exacto |
| 5 | 3 | $60.00 | $300.00 | exacto |

**3x2** (`qty_buy=3, qty_pay=2`):

| qty | billedUnits | blended | total | nota |
|---|---|---|---|---|
| 3 | 2 | $66.67 | $200.01 | +1¢ |
| 5 | 4 | $80.00 | $400.00 | exacto |
| 7 | 5 | $71.43 | $500.01 | +1¢ |

**2da unidad al 50%** (`qty_buy=2`, `pct=50`):

| qty | billedUnits | blended | total | nota |
|---|---|---|---|---|
| 1 | 1 | $100.00 | $100.00 | sin descuento |
| 2 | 1.5 | $75.00 | $150.00 | exacto (100 + 50) |
| 3 | 2.5 | $83.33 | $249.99 | −1¢ |
| 4 | 3 | $75.00 | $300.00 | exacto |

**2da unidad al 70%** (`qty_buy=2`, `pct=70`):

| qty | billedUnits | blended | total | nota |
|---|---|---|---|---|
| 2 | 1.3 | $65.00 | $130.00 | exacto (100 + 30) |

**Conclusión:** la fórmula agrupada, aplicada una sola vez, es correcta en todos
los casos pedidos. El único "ruido" es un redondeo de ±1 centavo cuando la
cantidad no es múltiplo exacto del grupo (esperado y ya aceptado como diseño en
una conversación anterior — no es un bug). **Con el bug de doble aplicación
activo**, todos estos valores de `sale_items.unit_price` van a salir más bajos
todavía (ver ejemplo del hallazgo crítico).

### Tolerancia de `total_paid` vs `total`

`validateAndNormalizePayment` usa tolerancia de `+0.009` (efectivo/mixto, para
cubrir errores de punto flotante) y `> 0.01` para métodos únicos. Como todo
blended pasa por `roundMoney` antes de compararse, la promo en sí **no debería
generar rechazos falsos** por redondeo — el ±1¢ de la tabla de arriba queda
dentro de esa tolerancia implícita al comparar `total` (ya redondeado) contra
`total_paid`. **OK**, siempre que se corrija el hallazgo crítico (que es de
persistencia, no de validación de pago).

---

## 2. Aislamiento entre ventas y productos — OK

- **¿Promo de un producto afecta a otro en el mismo carrito?** No. `groupedQty`
  y `offerMap` están indexados por `product_id`; cada grupo busca su propia
  oferta ganadora de forma independiente. Verificado en el código, sin
  contaminación cruzada.
- **¿Ventas simultáneas en cajas distintas interfieren?** No. Cada request a
  `/api/pos/confirm` arma su propio `offerMap` local (sin caché compartido entre
  requests); el descuento de stock usa `UPDATE ... SET stock = GREATEST(stock -
  qty, 0)`, atómico por fila a nivel de Postgres. No hay condición de carrera
  nueva introducida por el motor de promos.
- **Carrito mixto (promo + normal + pesable):** los ítems de balanza (`source:
  "scale_barcode"`) se procesan en un loop totalmente separado, nunca se agrupan
  ni tocan `offerMap`. Los ítems normales se agrupan por `product_id` y cada uno
  resuelve su propia oferta. Confirmado sin contaminación entre líneas.

---

## 3. Flujo de datos hacia el resto del sistema

- **Historial de ventas / detalle de última venta — 🔴 afectado por el hallazgo
  crítico.** El total del encabezado (`sales.total`) va a ser correcto, pero la
  suma de las líneas del detalle (`sale_items.quantity × unit_price`) va a dar
  un número menor. Esto es lo primero que debería notarse al probar un ticket
  real con 2x1 o "2da al 50%".
- **Cierre de caja (`computeClosureTotals`) — OK.** Lee `sales.total` y
  `payment.breakdown`/`total_paid` directamente, nunca `sale_items`. El efectivo
  cobrado y sumado en el cierre es el real, con el descuento correcto (una sola
  vez). No está afectado por el bug de la RPC.
- **Reportes de ingresos / top products — ⚠️ no verificable desde el repo.**
  `fn_top_products_range` y `fn_top_products_range_all` (usadas en
  `/api/reports/top-products` y en `/api/ai/assistant` para
  `top_productos_semana`/`top_productos_mes`) **no están versionadas** — no hay
  ningún `CREATE FUNCTION` en el repo. Si agregan `SUM(quantity × unit_price)`
  desde `sale_items` (el diseño más probable dado que devuelven `qty_sold` y
  `total_amount`), heredan el understatement de ingresos del hallazgo crítico
  para cualquier producto vendido con nxm/second_unit_pct. Recomiendo exportar
  el cuerpo real con `pg_get_functiondef` para confirmarlo (mismo problema de
  deuda técnica que ya existía con `products_with_stock` antes de esta feature).
- **`historico_mensual` / `tendencias_productos` (asistente IA) — ⚠️ mismo
  problema.** Se alimentan de las vistas `v_sales_daily` / `v_sales_products`.
  El archivo versionado `v_views.sql` está **obsoleto**: define esas vistas
  usando columnas `si.qty` / `si.subtotal`, que pertenecían al esquema viejo de
  `sale_items` (el de `supabase/confirm_sale.sql`, ya reemplazado). La tabla real
  hoy usa `quantity`/`unit_price` sin `subtotal`, así que esas vistas ya deben
  haber sido actualizadas a mano en producción sin quedar versionadas. No puedo
  confirmar si la versión viva sigue leyendo `unit_price` (heredaría el bug) u
  otra cosa. Mismo pedido: exportar `pg_get_viewdef` de ambas para versionarlas.
- **Intelligencia / margen (`/api/intelligence/margin-suggestions`,
  `productos_mejor_margen`/`productos_peor_margen` en el asistente IA) — ⚠️
  preexistente, no introducido por esta feature.** El margen se calcula siempre
  desde `products.price` y `products.cost_net` (margen de catálogo, "de lista"),
  nunca desde el precio realmente cobrado en `sale_items`. Esto significa que el
  margen mostrado **ya ignoraba** cualquier descuento manual desde antes de nxm
  (incluso `percent`/`fixed_price` no se reflejaban). Con promos por cantidad
  activas, el margen real cobrado baja más todavía y el sistema sigue sin
  reflejarlo. No es una regresión de esta feature, pero responde directamente a
  la pregunta del pedido: **no, el margen no refleja el descuento real, ni antes
  ni ahora.**
- **Asistente IA (`ofertas_activas`) — hallazgo menor, preexistente.** La query
  en `app/api/ai/assistant/route.ts` (línea ~108) filtra
  `.eq("active", true)` sobre `product_offers`, pero la columna real es
  `is_active`. Esto es anterior a esta feature (no lo tocamos) y probablemente
  hace que `ofertas_activas` esté siempre vacío para el asistente, sin importar
  el tipo de oferta. Además, aunque se corrija el nombre de columna, el mapeo
  actual no incluye `qty_buy`/`qty_pay`, así que el asistente no podría describir
  el detalle de una promo nxm ("llevá 3 pagá 2"), solo que existe.
- **Marketing / sugerencias — 🟠 hallazgo real, dos lugares con el mismo patrón:**
  - `app/marketing/page.tsx`, función `getOfferLabel` (línea ~743): solo
    distingue `type === "percent"`; cualquier otro tipo lo etiqueta como
    `Precio especial $${value}`. Para una oferta `nxm` (`value=0`) esto imprime
    **"Precio especial $0"**; para `second_unit_pct` (`value=50`, un porcentaje)
    imprime **"Precio especial $50"**, interpretando un 50% de descuento como un
    precio en pesos. Este texto se usa tanto en el badge visual del selector de
    producto como en el prompt que se manda a la IA para generar el posteo de
    Instagram/Facebook (`generateTexts`) — un supervisor podría publicar
    literalmente "Precio especial $0" en redes.
  - `/api/marketing/suggestions/route.ts` (línea ~93-96): mismo patrón exacto
    (`discountLabel`), mismo resultado incorrecto para nxm/second_unit_pct en el
    motivo de la sugerencia ("Oferta activa — Precio especial $0").
  - Nota aparte (preexistente, no de esta feature): la función `calcPromoPrice`
    de `app/marketing/page.tsx` (línea ~133) compara contra `offer.type ===
    "fixed"` / `"price"`, strings que **no existen** en la base (el tipo real es
    `"fixed_price"`). Esto significa que las ofertas `fixed_price` tampoco
    mostraban nunca el precio promocional en la imagen generada, desde antes de
    nxm. Para nxm/second_unit_pct, `calcPromoPrice` devuelve `null` → no se
    dibuja precio promocional en la imagen (se ignora sin romper, pero se pierde
    la oportunidad de destacar visualmente el 2x1/2da unidad).
  - Fix sugerido: en ambos lugares, armar la etiqueta según `type` real
    (`nxm` → `"Llevá X, pagá Y"`, `second_unit_pct` → `"2da unidad -Z%"`), y
    propagar `qty_buy`/`qty_pay` desde `/api/marketing/products` y
    `/api/marketing/suggestions` (hoy solo seleccionan `type, value`).
- **Etiquetas de precio (`app/etiquetas/page.tsx`) — OK, ignora sin romper.**
  `hasOffer = product.has_offer && product.effective_price < product.price`.
  Como `products_with_stock` devuelve `effective_price === price` para
  `nxm`/`second_unit_pct` (por diseño — el descuento depende de la cantidad, no
  hay un "precio unitario" fijo), esta condición da `false` y la etiqueta
  imprime el precio normal sin mencionar la promo. No hay dato incorrecto
  impreso, solo se pierde la oportunidad de anunciar el 2x1 en el cartel físico.

---

## 4. Casos borde operativos

- **Anulación de venta con promo — OK.** `void_sale_atomic` restaura stock a
  partir de `sale_items.quantity` (unidades reales vendidas), columna que nunca
  se ve afectada por el bug de precio. La devolución de stock es correcta
  independientemente del hallazgo crítico.
- **Venta offline con promo — 🟠 hallazgo de riesgo (agravado por promos, no
  exclusivo de ellas).** `addToQueue` guarda el payload tal cual lo armó el
  cliente (`items`, `total`, `payment`) y `syncQueue` lo reenvía sin cambios al
  reconectar. El servidor **siempre** ignora el precio del cliente y recalcula
  contra el estado de `product_offers` vigente **en el momento del sync**, no en
  el momento de la venta. Si la oferta venció (o cambió) en esa ventana —que
  offline puede ser de horas—, el total recalculado puede ser mayor al
  `payment.total_paid` que el cajero cerró en el momento (con el total viejo,
  más bajo), y el servidor rechaza con 400 ("no cubre el total"). Ese rechazo
  4xx cuenta como intento fallido en `syncQueue`; a los 3 intentos
  (`MAX_ATTEMPTS`) la venta se **abandona y se borra de la cola** —
  se pierde el registro de una venta que el cliente ya pagó y se llevó la
  mercadería. Este riesgo ya existía para cualquier cambio de precio/producto
  desactivado, pero las promos con `ends_at` fijo lo hacen más probable (son
  ventanas de vigencia deliberadas, a menudo pensadas para vencer en un momento
  puntual).
  - Fix sugerido: no descartar automáticamente ventas offline rechazadas por
    "no cubre el total" — moverlas a una cola de revisión manual en vez de
    abandonarlas silenciosamente, o notificar explícitamente al cajero/supervisor.
- **Oferta que vence entre agregar al carrito y confirmar (ONLINE) — OK,
  comportamiento esperado.** El servidor nunca usa el `total`/precio que manda
  el cliente para tarifar — siempre re-consulta `product_offers` con `now()` al
  momento de confirmar. Si la oferta ya venció, cobra correctamente el precio de
  lista; si el cajero tenía cargado el monto de pago según el total viejo
  (más bajo), la validación de pago rechaza con un mensaje genérico ("El pago no
  cubre el total de la venta"). Es seguro (nunca cobra de menos), aunque el
  mensaje no aclara que la causa fue el vencimiento de una promo — mejora de UX
  posible, no bug.
- **Editar cantidad en el carrito — OK en pantalla, pero grabado con el mismo bug
  crítico.** `updateQty` y `addToCart` recalculan el blended vía `promoUnitPrice`
  en cada cambio, así que el cajero siempre ve el número correcto en el POS. El
  problema es exclusivamente lo que la RPC graba después (hallazgo crítico) —
  no hay un problema adicional de recálculo en el cliente.

---

## Resumen ejecutivo

| Área | Estado |
|---|---|
| Fórmula nxm/second_unit_pct (diseño matemático) | ✅ OK — correcta si se aplica una sola vez |
| **Persistencia en `sale_items` (aplicación real)** | 🔴 **CRÍTICO — descuento aplicado 2 veces** |
| Validación de pago / tolerancia de redondeo | ✅ OK |
| Aislamiento entre productos / ventas concurrentes | ✅ OK |
| Carrito mixto (promo + normal + pesable) | ✅ OK |
| Historial de ventas (detalle) | 🔴 Afectado por el crítico |
| Cierre de caja | ✅ OK — no depende de `sale_items` |
| Reportes / top products / IA (ingresos) | ⚠️ No verificable — RPC/vistas no versionadas, probablemente heredan el crítico |
| Margen / intelligencia | ⚠️ Preexistente — nunca reflejó descuentos reales, ni antes ni ahora |
| Asistente IA — ofertas activas | 🟡 Bug preexistente de nombre de columna (`active` vs `is_active`), no de esta feature |
| Marketing / sugerencias | 🟠 Etiqueta incorrecta ("Precio especial $0") para nxm/second_unit_pct |
| Etiquetas de precio impresas | ✅ OK — ignora sin romper |
| Anulación de venta | ✅ OK |
| Venta offline + resync | 🟠 Riesgo de pérdida silenciosa de venta si la oferta vence en la ventana offline |
| Oferta vencida entre carrito y confirmación (online) | ✅ OK, comportamiento esperado |
| Recalculo al editar cantidad | ✅ OK en pantalla |

**Prioridad de acción:** corregir primero el hallazgo crítico (RPC no debe
recalcular precio para nxm/second_unit_pct, solo taggear columnas informativas)
antes de seguir vendiendo con estas promos en producción — cualquier venta ya
confirmada con nxm/second_unit_pct tiene su `sale_items.unit_price` mal grabado
y eso ya está impactando reportes/historial retroactivamente.
