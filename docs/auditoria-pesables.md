# Auditoría — Productos pesables vendidos por balanza (Systel Cuora)

**Fecha:** 2026-08-05
**Alcance:** solo diagnóstico e investigación. No se modificó código.
**Rama:** `main`

---

## Resumen ejecutivo

El parser del código de barras de la balanza (formato Systel, EAN-13 con precio embebido) está **bien implementado y verificado contra una etiqueta real**. El carrito del POS distingue correctamente un ítem de balanza (badge, cantidad bloqueada en 1). Pero hay tres problemas de fondo:

1. **Bug con impacto en plata**: si un ítem de balanza pasa por "Guardar venta" → "Retomar", pierde su identidad y se re-factura al precio de lista por kg en vez del importe real cobrado por la balanza. Sin ningún aviso al cajero.
2. **No se persiste ningún dato de peso ni origen** en la base — una vez grabada la venta, un ítem de balanza es indistinguible de un producto normal vendido "1 unidad". Esto rompe trazabilidad en auditorías futuras e historial.
3. El stock se descuenta como **1 unidad genérica**, no como la fracción real de kg vendida — decisión de negocio ya señalada en `CLAUDE.md`, no un bug nuevo, pero queda agravada por el punto 2 (no queda ni el dato para reconstruir el kg vendido después).

Nada de esto bloquea vender con la balanza el lunes. El punto 1 sí conviene mitigarlo antes (ver Parte 3).

---

## Parte 1 — Cómo funciona hoy nuestro sistema

### 1.1 Al escanear la etiqueta

Formato confirmado con etiqueta real (`2000104500008`, queso roquefort a $4.500):

- Prefijo `"2"` (dígito 0) → marca de código de balanza.
- PLU: dígitos 1-5 → `parseBalanzaBarcode()`, `app/ventas/page.tsx:172-179`.
- Importe: dígitos 6-10, dividido por 10 → `45000 / 10 = $4.500`.
- Dígito 11 y dígito verificador (12) no se usan (no rompen nada; no se valida el check digit, pero tampoco hace falta).

```ts
// app/ventas/page.tsx:172
function parseBalanzaBarcode(code: string): { plu: string; price: number } | null {
  if (code.length !== 13 || code[0] !== "2") return null;
  const plu = code.substring(1, 6);
  const priceRaw = parseInt(code.substring(6, 11), 10);
  if (!Number.isFinite(priceRaw)) return null;
  const price = priceRaw / 10;
  return { plu, price };
}
```

`handleBalanzaBarcode(plu, price)` (`page.tsx:722-755`) busca el producto por PLU vía `/api/products/by-plu`, y si lo encuentra agrega al carrito:

```ts
{ product_id, lineId, name, sku, qty: 1, unit_price: price, base_unit_price: price,
  has_offer: false, is_balanza: true }
```

**Importante**: esta rama no setea `is_weighted`, aunque el producto de fondo sí lo sea. La única marca de "vino de balanza" es `is_balanza: true`.

Si el PLU no matchea ningún producto, se muestra un toast de error ("Producto no encontrado. Configurá el PLU en el catálogo") y no se agrega nada al carrito — no hay riesgo de vender a $0 o con producto incorrecto por ese lado.

### 1.2 Cómo se guarda en la base (`sale_items`)

Recorrido completo:

- `cartItemForConfirm()` (`page.tsx:85-102`) arma el payload: `qty: 1`, `unit_price` = importe leído, `source: "scale_barcode"`.
- `app/api/pos/confirm/route.ts:424-449` — bloque específico para `source === "scale_barcode"`: valida que el producto tenga `is_weighted = true` en la DB (si no, error 400), valida que el precio esté en rango `(0, 10.000.000]`, y arma la línea final con `quantity: 1`, `unit_price: it.client_unit_price` (el importe leído por la balanza, ahora sí confiado porque ya se validó contra el flag `is_weighted` real del producto).
- La RPC `confirm_sale_with_stock` (`sql/fix_confirm_sale_double_discount.sql:81-122`) inserta cada línea de balanza **individualmente**, sin agrupar:

```sql
INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct)
VALUES(v_sale_id, v_scale_item.product_id, v_scale_item.quantity, v_scale_item.unit_price, NULL, NULL, NULL);
```

Esquema real de `sale_items` (confirmado en `sql/constraints.sql` y `app/api/sales/items/route.ts:38-41`): **solo** `sale_id, product_id, quantity, unit_price, qty_buy, qty_pay, promo_pct`.

Para un ítem de balanza queda grabado como: `quantity = 1`, `unit_price` = importe cobrado, `qty_buy/qty_pay/promo_pct = NULL`.

**No existe ninguna columna** `is_balanza`, `source`, `weight_grams` ni similar. El campo `source` viaja en el JSON del request pero nunca se persiste — una vez en la tabla, la fila es indistinguible de un producto normal vendido a "1 unidad".

Descuento de stock (misma RPC, líneas 98-101): `stock = GREATEST(stock - v_scale_item.quantity, 0)` con `quantity = 1` siempre. Es decir, **se descuenta 1 unidad genérica de stock por cada venta de balanza**, sin importar si se vendieron 200g o 2kg. Esto ya está señalado como decisión de negocio pendiente en `CLAUDE.md` ("Pesables por balanza — descuentan stock 1 unidad en vez de la fracción real de kg vendida... decisión de negocio pendiente, no bug a arreglar solo").

### 1.3 Cómo se ve en cada pantalla

| Pantalla | Comportamiento verificado |
|---|---|
| **Carrito del POS** | Bien resuelto: badge violeta "BALANZA" (`page.tsx:2350-2354`) vs badge azul "PESABLE" para pesables tradicionales por peso; cantidad forzada a mostrar `"1"`; botones +/- deshabilitados (`disabled={(it as any).is_balanza}`, líneas 2385/2428). |
| **Ticket/comprobante** | **Actualmente no se imprime ningún ticket.** Existe `app/_utils/receipt.ts` (`exportReceiptPDF`, columnas `Producto/Cant/Precio/Subt.`) pero quedó huérfano: el botón que lo llamaba se removió del POS en un refactor posterior (commit `62336ff`). Verificado con `grep` que no hay ninguna referencia a `receipt`/`ticket`/`PDF` en `app/ventas/page.tsx` hoy. Si se reactivara, mostraría "1 x $precio" sin marca de balanza. |
| **Historial / últimas ventas** | Se ve **igual que un producto normal**. El tipo `SaleItem` (`page.tsx:183-191`) no tiene `is_balanza`; el modal de detalle (`page.tsx:1889`) muestra `"1 u."` a secas. |
| **Cierre de caja** | Correcto y sin distinción: `lib/computeClosureTotals.ts` calcula todo desde `sales.total`/`sales.payment`, no desde `sale_items` — el importe entra bien al cuadre, no hay necesidad de distinguir ahí. |
| **Reportes (Top productos)** | Riesgo detectado: `app/components/TopProducts.tsx:113` decide si mostrar gramos o unidades adivinando por el **nombre del producto** (`.includes("(x kg)")`), no por el flag real `is_weighted`. Si el nombre no tiene ese literal exacto, o si el `SUM` subyacente mezcla gramos (pesable tradicional) con "1"s (balanza) para el mismo producto, el total mostrado puede mezclar unidades sin sentido. |

### 1.4 Puntos confusos o riesgosos — hallazgo principal

**Bug con impacto directo en plata de caja: "Guardar venta" / "Retomar" pierde el flag de balanza.**

Verificado línea por línea:

```ts
// app/ventas/lib/hold.ts:1-8 — el tipo no tiene is_balanza
export type HoldItem = {
  product_id: string; name: string; sku: string | null;
  qty: number; unit_price: number; is_weighted?: boolean;
};
```

```ts
// app/ventas/page.tsx:537-544 — holdCart() no guarda is_balanza
saveHold(items.map(it => ({
  product_id: it.product_id, name: it.name, sku: it.sku,
  qty: it.qty, unit_price: it.unit_price, is_weighted: it.is_weighted,
})), total, selectedRegisterId);
```

```ts
// app/ventas/page.tsx:555-563 — resumeHold() no lo restaura
setItems(hold.items.map(it => ({
  product_id: it.product_id, name: it.name, sku: it.sku,
  qty: it.qty, unit_price: it.unit_price, base_unit_price: it.unit_price,
  is_weighted: it.is_weighted ?? false,
})));
```

**Secuencia del problema:**
1. Cajero escanea un pesable en la balanza → entra al carrito como `is_balanza: true`, precio = importe real.
2. Cajero aprieta "Guardar venta" (por ejemplo, el cliente se olvidó algo). El ítem se guarda **sin** `is_balanza`.
3. Cajero retoma la venta más tarde. El ítem vuelve al carrito como si fuera un producto normal: `is_balanza` ausente, `is_weighted: false`, `qty: 1`, con el precio que había leído la balanza en su momento.
4. Al confirmar, `cartItemForConfirm()` ya no manda `source: "scale_barcode"`.
5. En el backend (`route.ts:451-483`), al no venir marcado como balanza, entra al camino genérico ("resto de ítems"), que **ignora el precio del cliente** y factura `quantity: 1` al **precio de lista de la DB** (el precio por kg del producto, tratado como si fuera 1 unidad) — sin ninguna validación de `is_weighted` en ese camino (esa validación solo existe en el bloque de balanza, línea 429).

**Resultado**: un pesable que se cobró, por ejemplo, $850 de jamón pesado, si pasa por guardar/retomar antes de confirmarse, termina facturado al precio de lista por kg del producto — un monto que puede ser completamente distinto (mayor o menor) al que realmente se pesó y cobró en el mostrador de la balanza. **Sin ningún error ni aviso visible para el cajero.** Es un vector real de descuadre de caja, no hipotético — se dispara con el uso normal de una función existente ("Guardar venta").

---

## Parte 2 — Cómo lo hacen los sistemas POS profesionales

### 2.1 El estándar detrás del código de barras (GS1)

Investigado: el formato que usa la balanza Systel no es propietario — sigue el estándar **GS1 Restricted Circulation Number (RCN)**, prefijos `20`-`29`, diseñado específicamente para productos de peso variable (carne, fiambre, quesos) que pasan por una balanza en el punto de venta.

- La estructura estándar es: prefijo `2X` + número de artículo (PLU) + **precio o peso** + dígito verificador, en un EAN-13 de 13 dígitos.
- El dígito `X` (después del `2`) indica si el código embebe **precio** o **peso** — hay variantes de la RCN para cada caso. La Systel Cuora, en la configuración que tenemos, embebe precio (no peso).
- Son códigos de circulación **nacional/interna**: no son un EAN global de fábrica, se imprimen en el momento en la balanza del propio comercio (o en la fiambrería), y solo tienen sentido dentro del negocio que los generó.

*(Fuentes: [GS1 Sweden — Barcode items of varying weight](https://gs1.se/en/guides/how-to-guides/barcode-label-items-of-varying-weight/), [GS1 UK — How to barcode variable measure items](https://www.gs1uk.org/knowledge-hub/barcodes/how-to-barcode-variable-measure-items), [GS1 — Summary of GS1 MO Prefixes 20-29](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf))*

### 2.2 Qué hacen los sistemas grandes con esa venta

En un POS de supermercado profesional (cadenas grandes, integraciones balanza↔caja tipo CAS, Toledo, Digi, NCR):

- Cuando la balanza **transmite peso** (en vez de precio), el POS mantiene ese peso como un valor vivo en la transacción, calcula `importe = peso × precio_por_kg`, y guarda **los tres valores** en la línea de venta: peso, precio/kg, importe.
- Cuando el flujo es "etiqueta impresa por la balanza con precio ya calculado" (como en nuestro caso), la etiqueta en sí ya trae impreso, además del código de barras: **peso, precio por kg e importe en texto legible** — el cliente puede ver los tres datos en el papel, aunque el código de barras solo transporte el importe. El sistema de caja no necesariamente re-deriva el peso del código, pero la trazabilidad para el cliente y para auditoría queda en la etiqueta física.
- El recibo/ticket final de una venta de pesable muestra clásicamente el formato "**peso × precio/kg = importe**" (ej: `0.350 kg x $12.860/kg = $4.501`), no un simple "1 x $4.500".
- El stock de pesables se lleva en unidades de peso reales (kg), no en "unidades" — el sistema descuenta la fracción exacta vendida, porque de otro modo el stock de pesables queda sistemáticamente desalineado con la realidad (justamente el problema que ya tenemos, señalado en `CLAUDE.md`).

*(Fuente: [ScaleBlog — cómo funciona la integración balanza↔POS](https://scaleblog.com/grocery-pos-scale-produce-weighing/), [guía de integración de balanzas en POS de supermercado](https://retailpos.co.in/pos-system-weighing-scale-integration-india-supermarket-2026/))*

### 2.3 Qué información es importante conservar, y por qué

| Dato | Por qué importa |
|---|---|
| **Peso vendido** | Sin esto no se puede: (a) descontar stock real de pesables, (b) auditar si el precio/kg cobrado fue el correcto, (c) reconstruir una venta en una disputa con el cliente ("¿cuánto pesaba realmente lo que compré?"). |
| **Precio por kg usado** | Puede haber cambiado entre que se imprimió la etiqueta y que se vendió (oferta vencida, reimportación de precios). Sin guardarlo, no se puede saber si se cobró el precio vigente. |
| **Importe final** | Es lo único que hoy se guarda — correcto para el cuadre de caja, pero insuficiente para todo lo demás. |
| **Origen del ítem (balanza vs. carga manual)** | Sin esto, ninguna auditoría futura puede diferenciar "vino de una etiqueta de balanza" de "cajero tipeó el precio a mano" — son dos niveles de confianza muy distintos de cara a control interno. |

Hoy nuestro sistema solo conserva el importe. Los otros tres se pierden en el momento de grabar la venta.

---

## Parte 3 — Recomendaciones

### Urgente (antes del lunes / mientras el piloto sigue en producción)

1. **Arreglar el bug de "Guardar venta" / "Retomar" con ítems de balanza** (Parte 1.4). Es el único hallazgo con riesgo de plata real y concreto. Opciones, de más simple a más completa:
   - Mínimo: agregar `is_balanza` a `HoldItem` y preservarlo en `holdCart()`/`resumeHold()`, para que al retomar el ítem siga viajando con `source: "scale_barcode"`.
   - Alternativa operativa inmediata (sin tocar código, para cubrir el fin de semana): indicarle a los cajeros que **no** usen "Guardar venta" cuando el carrito tiene ítems de balanza — cobrarlos antes de poner en espera el resto.
2. Confirmar (si no se hizo ya) que `sql/add_products_plu_column.sql` esté corrido en Supabase y que los productos pesables que se van a vender el lunes tengan su PLU cargado en `/catalogo` — sin esto, el escaneo de balanza no encuentra el producto (aunque el sistema ya avisa con un toast de error, no se cae).

### Puede esperar (post-piloto)

3. **Persistir origen y datos de peso en `sale_items`**: agregar columnas (ej. `source text`, `weight_grams numeric`) para poder distinguir un ítem de balanza en historial/reportes/auditoría futura. Requiere revisar el SQL con vos antes de correrlo (regla de oro del proyecto) y es un cambio aditivo sobre `confirm_sale_with_stock` — no bloqueante para operar, pero importante para trazabilidad a mediano plazo.
4. **Calcular y mostrar el peso implícito**, aunque la balanza no lo transmita: como ya se conoce `unit_price` (importe) y `product.price` (precio por kg en la DB) en el momento de confirmar la venta, se puede derivar `peso_kg ≈ importe / precio_por_kg` y guardarlo solo a fines de reporte/visualización (no para descuento de stock, que seguiría siendo el importe real cobrado). Esto acercaría el ticket/historial al formato estándar "peso × precio/kg = importe" sin depender de que la balanza mande el peso.
5. **Mostrar la distinción de balanza en el historial de ventas** (badge, igual que ya existe en el carrito) para que un supervisor pueda diferenciar a simple vista un ítem de balanza de un producto normal vendido "1 unidad".
6. **Arreglar la heurística de `TopProducts.tsx:113`** que hoy adivina gramos vs. unidades por el nombre del producto — reemplazarla por el flag real `is_weighted` una vez que el dato de origen esté persistido (punto 3).
7. **Decidir qué hacer con el ticket huérfano** (`app/_utils/receipt.ts`): si se piensa reactivar la impresión de comprobantes, aprovechar para agregar el formato peso/precio-kg/importe en esa misma instancia; si no se va a usar, se puede eliminar para no dejar código muerto confundiendo a futuras sesiones.
8. **Revisar el descuento de stock de pesables en general** (balanza y tradicional): hoy no hay conteo preciso en kg, se repone a ojo — esto ya está señalado como decisión de negocio pendiente en `CLAUDE.md`, no es un bug nuevo de este análisis, pero conviene resolverlo junto con el punto 3 ya que comparten la misma causa raíz (no se guarda el peso real en ningún lado).

---

## Archivos y líneas clave (para referencia rápida)

- `app/ventas/page.tsx:172-179` — `parseBalanzaBarcode`
- `app/ventas/page.tsx:722-755` — `handleBalanzaBarcode`
- `app/ventas/page.tsx:85-102` — `cartItemForConfirm`
- `app/ventas/page.tsx:535-563` — `holdCart` / `resumeHold` (bug de pérdida de `is_balanza`)
- `app/ventas/lib/hold.ts:1-8` — `HoldItem` (sin campo `is_balanza`)
- `app/ventas/page.tsx:2345-2432` — badges y bloqueo de cantidad en el carrito
- `app/ventas/page.tsx:183-191, 1875-1893` — `SaleItem` y modal de historial (sin distinción)
- `app/api/pos/confirm/route.ts:311-327, 424-449, 451-485` — normalización de ítems y camino balanza vs. genérico
- `sql/fix_confirm_sale_double_discount.sql:81-122` — bloque `scale_barcode` en `confirm_sale_with_stock`
- `sql/constraints.sql`, `app/api/sales/items/route.ts:38-41` — esquema real de `sale_items`
- `app/_utils/receipt.ts` — ticket PDF, hoy huérfano (sin caller)
- `lib/computeClosureTotals.ts:35-46` — cierre de caja (sin distinción, correcto así)
- `app/components/TopProducts.tsx:107-129` — heurística de nombre para gramos vs. unidades
- `sql/add_products_plu_column.sql` — columna `products.plu` (confirmar que esté aplicada en Supabase)
