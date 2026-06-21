# Diagnóstico responsive mobile — Super Juampy

> Auditoría realizada: 2026-06-12
> Foco: páginas de supervisor en pantallas 375px–430px

---

## 0. Navegación — `app/_components/HeaderNav.tsx`

**Crítico: la nav no tiene versión mobile en absoluto.**

| Problema | Línea | Detalle |
|---|---|---|
| Sin hamburger ni menú colapsable | 104–248 | El supervisor tiene 6 grupos en la barra horizontal. En 375px se desbordan sin scroll ni wrap. |
| `whiteSpace: 'nowrap'` en todos los items | 128, 149, 200 | Impide cualquier wrap. La barra queda cortada o fuera de pantalla. |
| Right side empuja al nav | 214–244 | El bloque con sucursal + nombre + "Salir" tiene `whiteSpace: 'nowrap'` y empuja los nav items fuera del viewport desde la derecha. |
| Dropdowns no colapsables en touch | 157–185 | Abren al tap, bien. Pero si la barra horizontalmente overflowea, el dropdown no aparece en el lugar correcto. |
| Sin `overflow-x` en la nav | 104 | No hay `overflow-x: auto` ni `hidden`. El comportamiento en mobile es indefinido: puede cortar o hacer scroll. |

---

## 1. `/inteligencia/asistente` — `app/inteligencia/asistente/page.tsx`

Estado general: **aceptable, con dos problemas puntuales**.

| Problema | Línea | Detalle |
|---|---|---|
| `h-[calc(100vh-120px)]` frágil en mobile | 131 | En iOS Safari el `100vh` incluye la barra del browser (desaparece al scrollear). El chat puede quedar cortado o con espacio en blanco excesivo. |
| Botón "Copiar" sin área mínima de toque | 55–61 | Solo `text-xs` sin `min-h` ni `py`. El target táctil es menor a 24px, casi impalpable en mobile. |
| Tablas markdown en respuestas | 161 | Si el modelo devuelve una tabla markdown, ReactMarkdown la renderiza como `<table>` sin wrapper `overflow-x-auto`. En una burbuja de `max-w-[85%]` la tabla desbordará el contenedor. |
| Sugerencias: botones con `py-1` | 190 | 4px top + 4px bottom + texto = ~22px. Menor al mínimo táctil de 44px recomendado para mobile. |

---

## 2. `/reports` — `app/reports/page.tsx` + `app/reports/ReportsCharts.tsx`

| Problema | Archivo | Línea | Detalle |
|---|---|---|---|
| KPI cards: grid 3 columnas fijas en mobile | `page.tsx` | 204 | `grid-cols-3` sin breakpoint. En 375px cada tarjeta tiene ~105px de ancho. Valores como `$12.345.678` en `text-2xl` no caben y se salen del borde. |
| Tabla: `min-w-[600px]` corta padding en iOS | `page.tsx` | 241 | `overflow-x-auto` + `padding-right` se comporta diferente en Safari Mobile. El último scroll point puede quedar tapado por el borde del contenedor. |
| XAxis labels superpuestos en vistas largas | `ReportsCharts.tsx` | 47, 97 | Sin `angle`, `interval` ni `tickCount`. En un mes de 30 días, los 30 ticks a `fontSize: 11` se superpondrán en 375px. |
| YAxis `width={60}` reduce el área del gráfico | `ReportsCharts.tsx` | 48, 98 | En 375px − 32px padding − 60px YAxis = 283px para el gráfico. Viable pero ajustado, y el `width` fijo no escala. |
| DayPicker no tiene max-width en mobile | `page.tsx` | 171 | En móvil angosto el calendario ocupa el ancho completo menos padding, lo cual está bien, pero `captionLayout="dropdown"` puede tener dos selects (`mes` y `año`) que en pantallas pequeñas quedan muy juntos. |
| Layout `lg:grid-cols-[380px_480px]` | `page.tsx` | 168 | Correcto que sea 1 columna en mobile. El calendario queda arriba y los KPIs abajo. Pero si el usuario no scrollea, puede no ver los gráficos. |

---

## 3. `/ventas/historial` — `app/ventas/historial/page.tsx`

**El más problemático de todos.** Dos tablas sin min-width definido.

| Problema | Línea | Detalle |
|---|---|---|
| Tabla de 8 columnas sin min-width | 411–519 | `min-w-full text-xs` sin `min-w-[Xpx]`. En 375px: 8 columnas a ~47px c/u. "Fecha y hora" necesita ~120px para `"12/06/2026 14:30"`. Se aplasta todo. |
| Sin `overflow-x-auto` efectivo en la tabla | 410 | Hay `overflow-x-auto` en el wrapper, pero sin `min-w` en la tabla, el scroll nunca se activa — la tabla simplemente aplasta sus columnas. |
| Botón "Anular" intocable en mobile | 466–471 | `px-2 py-0.5 text-[10px]` — target táctil estimado: ~18px alto. Imposible de tocar en touch. |
| Tabla de items expandidos también sin min-width | 490–508 | El sub-table `min-w-full text-xs` hereda el ancho aplastado de la fila padre. |
| Filtros: 4 controles apilados + botón "Buscar" separado | 319–333, 336–382 | El botón "Buscar" queda en el header row mientras los filtros están en una sección separada abajo. En mobile no es obvio que hay que bajar a ver los filtros y luego volver al botón de arriba. |
| Fecha y hora en `text-xs` con `line-through` | 438–439 | Texto tachado en 12px sobre fondo blanco: prácticamente ilegible en mobile. |

---

## 4. `/cierres` — `app/cierres/page.tsx`

| Problema | Línea | Detalle |
|---|---|---|
| `input[type=date]` y `select` con `py-1` | 503–543 | Todos los controles del header tienen `px-2 py-1 text-sm` → ~26-28px de alto. El mínimo táctil es 44px. En mobile son muy difíciles de usar. |
| Botón "Reemplazar cierre con datos actuales" | 562–568 | `px-3 py-1 text-[11px]` — target táctil ~22px. Está además dentro del texto de alerta de cierre existente, completamente ilegible en mobile. |
| Tabla de tickets: 10 columnas sin min-width | 661–737 | `min-w-full text-xs` con 10 columnas. En 375px = ~37px por columna. Columnas "Efectivo", "Débito", "Crédito", "MP", "Cuenta", "Vuelto" colapsan. Sin `min-w` definido, el scroll horizontal no se activa. |
| Sub-tabla de productos expandidos | 707–726 | Mismo problema: sin min-width, se aplasta dentro de la fila colapsada. |
| Tabla "Ventas por hora" | 626–653 | Solo 3 columnas, tiene `overflow-x-auto` — sobrevive en mobile. |
| Header con filtros muy largo en mobile | 492–571 | El bloque apilado en mobile incluye: fecha, sucursal, caja, botón confirmar, y potencialmente el aviso de cierre existente con su botón. Puede ocupar más de la mitad de la pantalla antes de ver cualquier dato. |
| KPI `text-4xl` puede desbordar en montos largos | 577 | `text-4xl font-bold` con `{formatMoney(kpis.totalAmount)}` — si el monto supera 8 dígitos + separadores, puede tocar el borde en 375px. |

---

## Resumen de prioridades

| Prioridad | Problema | Archivo |
|---|---|---|
| 🔴 Crítico | Nav sin versión mobile — inutilizable | `HeaderNav.tsx` |
| 🔴 Crítico | Tabla historial aplasta 8 columnas sin scroll | `ventas/historial/page.tsx:410` |
| 🔴 Crítico | Tabla tickets cierre aplasta 10 columnas sin scroll | `cierres/page.tsx:661` |
| 🟠 Alto | Botón "Anular" de 10px — intocable en mobile | `ventas/historial/page.tsx:466` |
| 🟠 Alto | Inputs fecha/select demasiado pequeños en cierres | `cierres/page.tsx:503–543` |
| 🟠 Alto | KPI cards 3-col fijas rompen en mobile | `reports/page.tsx:204` |
| 🟡 Medio | `100vh` frágil en iOS Safari para el chat | `asistente/page.tsx:131` |
| 🟡 Medio | XAxis ticks superpuestos en gráficos | `ReportsCharts.tsx:47,97` |
| 🟡 Medio | Tablas markdown en respuestas sin overflow | `asistente/page.tsx:161` |
| 🟢 Bajo | Botón "Copiar" sin área táctil mínima | `asistente/page.tsx:55` |
| 🟢 Bajo | Sugerencias `py-1` bajo el mínimo táctil | `asistente/page.tsx:190` |
