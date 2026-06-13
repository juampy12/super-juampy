# Revisión Final Mobile — Super Juampy POS
_Fecha: 2026-06-13 | Rama: main | Commit: a00f45f + fix carrusel_

---

## Resumen ejecutivo

El sistema está en muy buen estado mobile. Las ocho rondas de mejoras se integraron sin romperse entre sí. Se detectó un bug menor en el carrusel del asistente (ya corregido en esta revisión), un problema cosmético real con el nav sticky dentro de un contenedor con padding, y dos observaciones sobre el AIChat flotante. No hay nada crítico bloqueante.

---

## ✅ Qué quedó bien

### Navegación y HeaderNav
- Hamburger con SVG inline: visible en blanco sobre rojo en todos los tamaños.
- Menú cerrado por defecto al cargar; se cierra al navegar a cualquier ruta.
- Menú mobile con `maxHeight: calc(100dvh - 55px)` + `overflowY: auto`: no desborda en pantallas chicas con muchos items.
- Ícono ☰ / ✕ alternan correctamente. Touch targets 44×44px en hamburguesa y "Salir".
- Banner offline (`#DC2626`) aparece debajo del menú desplegable (nunca lo tapa). Su posición dentro del `<nav>` sticky es correcta: sube con el header al hacer scroll.
- Badge de sucursal y nombre truncado con `maxWidth: 120px` + `textOverflow: ellipsis`: nombres largos no rompen el header.

### PWA y offline
- `manifest.json`: `"orientation": "any"` — la app puede usarse en portrait y landscape.
- `sw.js` v2: precachea `/ventas`, `/pos-login`, `/cierres`, `/reports`, `/ventas/historial`, `/inteligencia/asistente`. El bump a `pos-pages-v2` limpia correctamente la caché vieja en el activate handler.
- Banner offline conectado a `navigator.onLine` con listeners `online`/`offline`: el estado se actualiza en tiempo real sin depender de fetch.

### Skeletons de carga
- `/reports`: tres KPI cards muestran `animate-pulse` con anchos distintos (w-3/4, w-1/2, w-3/4) mientras `loadingKpis`. Dejan de pulsar cuando llegan los datos. No quedan pegados.
- `/cierres/historial`: tarjetas de resumen + 6 filas skeleton en la tabla. Se muestran solo cuando `loading && rows.length === 0` — correctamente no reaparecen si hay datos anteriores visibles durante un re-filtro.
- `/ventas/historial`: tarjetas de resumen + 7 filas skeleton. La condición `loading ? skeleton : datos` en el resumen es simple y funcional.

### Asistente IA
- Carrusel de sugerencias siempre visible (eliminada la condición `!messages.some(m => m.role === "user")`).
- Botones deshabilitados con `opacity-50` durante loading.
- `overflow-x-auto` en el wrapper + `min-w-max` en el flex container (fix aplicado en esta revisión) garantiza scroll horizontal confiable en todos los browsers.
- Slow message después de 5s: pasa de "..." a texto descriptivo. Timer cancelado correctamente al recibir respuesta.
- Tablas Markdown dentro de `<div className="overflow-x-auto">`: no desbordan el bubble de chat.
- `h-[calc(100dvh-120px)]`: el margen de 120px cubre el peor caso (header 55px + banner offline 28px + outer padding 16px = 99px < 120px). Hay ~21px de holgura.

### Cierre de caja
- `/cierres`: `useEffect` en mount lee `getPosEmployee()` y setea la sucursal del supervisor. La cadena de efectos existente (store → registers → data) se dispara automáticamente.
- Fecha defaultea a hoy con `todayStr()` — sin cambios necesarios.

### Páginas con tablas
- `/ventas/historial`: `min-w-[700px]` + `overflow-x-auto`. Tabla de items expandida: también `min-w-[700px]`. Botón "Anular": `px-3 py-2 text-sm` (44px táctil).
- `/cierres/historial`: `overflow-x-auto` en wrapper. Tabla `min-w-full` con 7 columnas: desplazable horizontalmente en mobile.
- `/cierres` detalle de tickets: `min-w-[800px]` + `overflow-x-auto`.

### Otros quick wins ya aplicados
- Toaster: `position="bottom-center"` + `bottom: 80` — claro del home bar de iOS en PWA.
- Modal de feedback de venta: `w-full max-w-sm` + auto-close 2.5s + timer cancelable.
- Botones +/− del carrito: mínimo 44×44px.
- `min-h-dvh` en body.
- `py-4` en layout (reducido de `py-6`).

---

## ⚠️ Problemas detectados

### MEDIO — Nav sticky dentro de contenedor con padding (cosmético en PWA)

**Síntoma:** El `<HeaderNav>` tiene `position: sticky; top: 0` pero está dentro de `<div className="mx-auto max-w-6xl px-4 py-4">` en `layout.tsx`. Esto produce dos efectos:

1. El nav tiene 16px de margen en cada costado en mobile — no llega a los bordes de pantalla. En modo standalone PWA se ve la franja roja flotante en vez de full-bleed.
2. El `py-4` del contenedor agrega 16px SOBRE el nav en la carga inicial. Al hacer el primer scroll, el nav "salta" 16px para pegarse al top:0 del viewport.

**Impacto:** Cosmético, visible en PWA standalone. No afecta la funcionalidad.

**Fix recomendado:** Mover `<HeaderNav />` fuera del div con padding en `layout.tsx`:

```jsx
<body>
  <HeaderNav />                              {/* fuera del contenedor paddeado */}
  <div className="mx-auto max-w-6xl px-4 pb-4">
    <BrandTheme />
    <div className="max-w-7xl mx-auto">{children}</div>
    <Toaster position="bottom-center" containerStyle={{ bottom: 80 }} />
    <JsonLd />
  </div>
  <AIChat />
  <ServiceWorker />
</body>
```

Esto requiere quitar `pt-4` del wrapper (el nav ya ocupa su propia altura sticky). Impacto: `HeaderNav.tsx` no cambia. `layout.tsx`: 2 líneas.

---

### MEDIO — AIChat flotante puede solaparse con los toasts

**Síntoma:** El botón flotante del AIChat (`fixed`, `bottom: 24`) y el Toaster (`bottom: 80`) están en el mismo eje vertical. Cuando el panel de chat está abierto (`bottom: 88px`) y aparece un toast (`bottom: 80px`), ambos se superponen en un rango de 8px. El toast puede quedar parcialmente tapado por el header del panel.

**Impacto:** Bajo en la práctica (el AIChat en mobile casi no se usa — hay `/inteligencia/asistente` dedicado). El botón es arrastrable y el usuario puede moverlo.

**Fix recomendado:** Subir el Toaster a `bottom: 120` o mover el AIChat a otra posición default en mobile. Alternativa simple: ocultar el AIChat flotante en móvil (`className="hidden sm:block"`), ya que hay una página dedicada del asistente.

---

### BAJO — DayPicker en /reports sin wrapper overflow-x-auto

**Síntoma:** El `<DayPicker>` en `/reports` no tiene `overflow-x-auto`. A 375px, el calendario puede ser más ancho que el contenedor, causando scroll horizontal de toda la página. La sección padre tiene `rounded-3xl border bg-white p-4 shadow-sm` sin overflow control.

**Fix recomendado:**
```jsx
<div className="overflow-x-auto">
  <DayPicker ... />
</div>
```

---

### BAJO — Cierres/page: doble fetch en mount cuando emp.store ≠ STORES[0]

**Síntoma:** Al montar `/cierres`, el estado inicial es `selectedStore = STORES[0]` (Alberdi), lo que dispara inmediatamente la carga de registros y datos para esa sucursal. Luego el `useEffect([], getPosEmployee)` actualiza a la sucursal correcta del supervisor, disparando una segunda carga. Si el supervisor es de Tacuarí, hay un flash de datos de Alberdi antes de cargar Tacuarí.

**Impacto:** Bajo — dura menos de 1s y el resultado final es correcto.

**Fix posible:** Inicializar `selectedStore` a `""` e hidratarlo en `useEffect`, o usar `useMemo` con `getPosEmployee()` para inicialización (cuidado con SSR). No es urgente.

---

### BAJO — Íconos del menú mobile dependen de CDN Tabler

**Síntoma:** Los íconos dentro del menú desplegable (`<i className="ti ti-chart-bar">`) usan la fuente CDN. Si el usuario está offline y la fuente no fue cacheada previamente, los íconos aparecen como cuadrados vacíos. Los textos de navegación siguen visibles.

**Impacto:** Bajo — la navegación funciona igual. El SW no cachea recursos de CDN externos.

**Fix posible:** Reemplazar íconos del menú mobile con SVGs inline (como se hizo con el hamburguesa). No es urgente para supervisor en campo.

---

### INFO — Teclado virtual oculta carrusel de sugerencias en asistente

En iOS/Android, al tocar el input del asistente, el teclado virtual reduce el viewport. Las sugerencias (`mb-3` antes del input) pueden salir del área visible. Es un tradeoff del layout con `h-[calc(100dvh-120px)]`. El usuario puede cerrar el teclado para verlas.

---

## Casos borde verificados

| Escenario | Estado |
|-----------|--------|
| Orientación portrait 375px | ✅ Todos los elementos visibles, sin overflow |
| Orientación landscape (aprox 667×375) | ✅ `orientation: any` en manifest — permitido |
| PWA standalone sin chrome del browser | ⚠️ Nav no full-bleed (ver MEDIO arriba) |
| Transición online → offline | ✅ Banner aparece, toast no interfiere con nav |
| Transición offline → online | ✅ Banner desaparece, SW sincroniza pendientes |
| Menú mobile abierto + offline | ✅ Banner aparece debajo del menú, no lo tapa |
| Skeletons durante re-filtro | ✅ En historial, skeleton solo si no hay datos previos |
| Carrusel asistente con conversación larga | ✅ Siempre visible sobre el input, no colapsa |
| Store default al entrar a /cierres | ✅ Auto-selecciona sucursal del supervisor |
| Página del supervisor en cache offline | ✅ /cierres, /reports, /ventas/historial, /inteligencia/asistente precacheadas |

---

## Prioridad de fixes pendientes

| Prioridad | Issue | Esfuerzo |
|-----------|-------|----------|
| 1 | Nav full-bleed: mover HeaderNav fuera del div paddeado | ~5 min |
| 2 | DayPicker overflow-x-auto wrapper | ~2 min |
| 3 | AIChat flotante: ocultar en mobile o subir Toaster | ~3 min |
| 4 | Doble fetch en /cierres | 10-15 min |
| 5 | Íconos menú mobile → SVG inline | 20-30 min |

---

## Fix ya aplicado en esta revisión

**Carrusel sugerencias — `min-w-max` en inner flex div** (`app/inteligencia/asistente/page.tsx`):

Sin `min-w-max`, el contenedor flex intentaba encogerse al ancho del padre. En Safari/WebKit esto podía causar que los botones se apilaran en lugar de habilitar scroll horizontal. Con `min-w-max`, el inner div fuerza su ancho a `max-content` y el scroll horizontal del wrapper funciona en todos los browsers.
