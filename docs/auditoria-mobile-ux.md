# Auditoría de UX Mobile — Super Juampy POS
**Fecha:** 2026-06-13  
**Contexto:** PWA instalada en Android/iOS, uso diario por cajeros y supervisores. Pantallas 375–430px portrait.

---

## 1. ERGONOMÍA TÁCTIL

### 1.1 Botones +/− del carrito son intocables con el pulgar
**Archivo:** `app/ventas/page.tsx`  
**Código actual:**
```jsx
<button className="px-2 py-1 rounded border text-xs">−</button>
<button className="px-2 py-1 rounded border text-xs">+</button>
```
`px-2 py-1` genera un área de toque de ~36×28px. El mínimo recomendado es 44×44px (Apple HIG / Material).  
En el contexto del carrito, donde el cajero modifica cantidades frecuentemente bajo presión de tiempo, un error de toque significa atrasos visibles para el cliente.

**Mejora:** `px-4 py-2 min-w-[44px] min-h-[44px]` con `text-sm`.  
**Complejidad:** Baja | **Impacto:** Alto

---

### 1.2 Modal de gramos usa `window.prompt()` — bloqueante y sin control
**Archivo:** `app/ventas/page.tsx`  
**Código actual:**
```js
const gramsStr = window.prompt(`Ingresar gramos para: ${p.name}`, "100");
```
`window.prompt()` bloquea el hilo, no permite personalizar el teclado numérico, no muestra validación en tiempo real y en iOS Safari es especialmente torpe.

**Mejora:** Reemplazar por un bottom sheet o modal propio con `<input type="number" inputMode="numeric" pattern="[0-9]*">`, validación inline y botón "Confirmar" de 44px.  
**Complejidad:** Media | **Impacto:** Alto

---

### 1.3 Modal de feedback de venta con ancho fijo
**Archivo:** `app/ventas/page.tsx`  
**Código actual:**
```jsx
<div className="w-[380px] rounded-2xl bg-white p-5 shadow-2xl">
```
En un iPhone SE (375px) este modal se sale del viewport. Además no se cierra automáticamente: el cajero tiene que tocar "Cerrar" para iniciar la siguiente venta.

**Mejora:**
- Ancho: `w-full max-w-sm mx-4`
- Auto-close a los 2.5s o al primer toque en cualquier lugar
  
**Complejidad:** Baja | **Impacto:** Medio

---

### 1.4 Toasts en `top-right` tapan botones de acción
**Archivo:** `app/layout.tsx`  
**Código actual:**
```jsx
<Toaster position="top-right" />
```
En mobile portrait, la esquina superior derecha es donde el pulgar tiene menos alcance y donde en muchas páginas hay botones ("Buscar", filtros). Los toasts que aparecen ahí durante operaciones críticas quedan ocultos.

**Mejora:** `position="bottom-center"` con `containerStyle={{ bottom: 80 }}` para quedar sobre una eventual bottom bar.  
**Complejidad:** Baja | **Impacto:** Medio

---

### 1.5 Botón "Anular" en el modal de anulación demasiado angosto
**Archivo:** `app/ventas/page.tsx` (PosVoidModal)  
Modal con ancho fijo `w-[360px]` y el PIN input `maxLength={10}` (un PIN suele ser 4–6 dígitos; el cajero puede dudar si está ingresando bien).  

**Mejora:** Ancho `w-full max-w-sm`, `maxLength={6}`, auto-submit cuando llega al máximo.  
**Complejidad:** Baja | **Impacto:** Bajo

---

## 2. FLUJOS EN MOBILE

### 2.1 POS: agregar un producto requiere 4–5 pasos mínimos
**Flujo actual:**
1. Tocar input de búsqueda
2. Escribir nombre o SKU
3. Esperar resultado
4. Tocar "Agregar" (o navegar con flechas + Enter)
5. (Opcional) repetir si el SKU no coincidió

**Problema adicional en código:**
```js
// Solo activa agregar con Enter si son exactamente 4 dígitos
if (/^\d{4}$/.test(term)) { addByCode(term); }
```
Si el cajero escribe un SKU de 3 ó 5 dígitos y presiona Enter, no pasa nada. El comportamiento esperado (Enter = buscar/agregar el primero) no se cumple, generando confusión.

**Mejora:**
- Enter sobre el input debería agregar el primer resultado de la lista si hay uno solo, o hacer foco en la lista si hay varios.
- Agregar escaneo de código QR/barras vía cámara como opción secundaria (API nativa `BarcodeDetector`).
  
**Complejidad:** Media | **Impacto:** Alto

---

### 2.2 Tabla del carrito: 5 columnas en 375px son ilegibles
**Archivo:** `app/ventas/page.tsx`  
```
| Producto | Cant. | Precio | Subtotal | Acción |
```
En mobile, una tabla con 5 columnas a `text-sm` con `px-2` produce columnas de ~60px cada una. Los nombres de producto (a menudo 20-30 caracteres) se truncan de forma imprevisible.

**Mejora:** En mobile, reemplazar la tabla por una lista de cards tipo:
```
[Nombre del producto                  ]
[Precio unit.] [−][2][+] [$Subtotal  ]
```
Cada card muestra todo lo necesario sin scroll horizontal y los botones +/− quedan en la zona del pulgar.  
**Complejidad:** Media | **Impacto:** Alto

---

### 2.3 Cierre de caja: 4 filtros antes de ver datos
**Archivo:** `app/cierres/page.tsx`  
Fecha + Sucursal + Caja = 3 selects/inputs antes de poder ver cualquier dato. Encima, la caja se auto-selecciona pero si el cajero cambia de sucursal tiene que esperar a que cargue la lista de cajas.

**Mejora:** Precargar sucursal y caja del empleado logueado como defaults (los cajeros solo tienen una caja asignada; el supervisor puede necesitar cambiar). Mostrar datos del día actual y sucursal propia sin tocar nada.  
**Complejidad:** Media | **Impacto:** Medio

---

### 2.4 Historial de ventas: scroll interminable en mobile
**Archivo:** `app/ventas/historial/page.tsx`  
El flujo completo en mobile requiere:
1. Filtrar (4 controles)
2. Buscar
3. Hacer scroll hasta el ticket de interés
4. Expandir (toca el row)
5. Ver ítems

Los rows de la tabla son de `py-1` = muy juntos, difíciles de tocar con precisión.

**Mejora:** Aumentar `py-1` a `py-2.5` en las filas del tbody. Agregar paginación visible ("Mostrando 1-20 de 45").  
**Complejidad:** Baja | **Impacto:** Medio

---

### 2.5 Asistente IA: sugerencias desaparecen al primer mensaje
**Archivo:** `app/inteligencia/asistente/page.tsx`  
```jsx
{!messages.some(m => m.role === "user") && (
  <div className="flex flex-wrap gap-2 mb-3">
    {sugerencias.map(...)}
  </div>
)}
```
Las sugerencias se ocultan en cuanto el usuario escribe el primer mensaje. En mobile, si el usuario quiere hacer una segunda consulta rápida, no las ve más y tiene que tipear de cero.

**Mejora:** Mostrar las sugerencias como un carrusel horizontal deslizable siempre visible sobre el input (ocupan menos espacio vertical que el flex-wrap actual).  
**Complejidad:** Baja | **Impacto:** Medio

---

## 3. APROVECHAR QUE ES PWA

### 3.1 `orientation: "landscape"` en el manifest bloquea el uso portrait
**Archivo:** `public/manifest.json`  
```json
"orientation": "landscape"
```
Fuerza al usuario a girar el teléfono para usar la app. En la práctica, los cajeros usan el teléfono en portrait (como siempre) y Android les muestra un mensaje de "rotá el dispositivo". Es el problema de PWA más fácil de resolver y de mayor impacto.

**Mejora:** Cambiar a `"orientation": "any"` o simplemente omitir el campo.  
**Complejidad:** Baja | **Impacto:** Alto

---

### 3.2 Sin indicador visible del modo standalone
Cuando la PWA está instalada, el usuario ve la barra de estado del OS pero no tiene forma de saber desde la app si está en modo standalone (sin acceso a URL bar). Si algo falla con la caché, no puede escribir una URL para navegar.

**Mejora:** En modo standalone (`window.matchMedia('(display-mode: standalone)').matches`), mostrar un pequeño chip "📱 Instalado" en el header o un onboarding de 1 pantalla que explica cómo funciona offline.  
**Complejidad:** Baja | **Impacto:** Bajo

---

### 3.3 Splash screen sin texto informativo
El `background_color: "#CC2020"` da una pantalla roja uniforme durante la carga. No hay indicación de que algo está pasando.

**Mejora:** Agregar el logo centrado en el splash (se logra con `icons` bien configurados en el manifest, tamaño 512px maskable). El sistema operativo lo hace automáticamente si el ícono maskable existe.  
**Complejidad:** Baja | **Impacto:** Bajo

---

### 3.4 Estado offline no es inmediatamente visible en todas las páginas
**Archivo:** `app/ventas/page.tsx`  
El banner offline existe y es bueno, pero solo aparece en el POS. En `/cierres`, `/reports`, `/inteligencia` etc., si se pierde la conexión, el usuario solo se entera cuando una operación falla (toast de error).

**Mejora:** Mover el indicador de estado de conexión al `HeaderNav` (siempre visible) o al layout global, no solo en el POS.  
**Complejidad:** Baja | **Impacto:** Medio

---

### 3.5 Service Worker no cachea páginas del supervisor
**Archivo:** `public/sw.js`  
El SW precachea `/ventas` y `/pos-login` en el install, pero no `/cierres`, `/reports` ni las páginas de inteligencia. Si el supervisor abre la PWA offline, solo el cajero tiene experiencia funcional.

**Mejora:** Agregar a la lista de precache: `/cierres`, `/reports`, `/ventas/historial`.  
**Complejidad:** Baja | **Impacto:** Medio

---

## 4. PERFORMANCE PERCIBIDA

### 4.1 Búsqueda de productos: spinner inexistente
**Archivo:** `app/ventas/page.tsx`  
```jsx
{searching ? "..." : "Buscar"}
```
El botón cambia de texto a "..." pero no hay indicación visual clara de actividad. En mobile con conexión 4G lenta, el usuario puede tocar el botón múltiples veces creyendo que no respondió.

**Mejora:** Reemplazar "..." por un spinner SVG de 16px dentro del botón + `disabled` durante la búsqueda (ya existe el `disabled` pero sin spinner).  
**Complejidad:** Baja | **Impacto:** Medio

---

### 4.2 Sin skeletons en páginas de datos pesados
Las páginas `/reports`, `/cierres/historial`, `/ventas/historial` muestran una pantalla en blanco o texto "Cargando..." mientras cargan los datos. En mobile con red variable esto puede parecer que la app se colgó.

**Mejora:** Skeletons simples con `animate-pulse` para las tablas y KPI cards mientras carga la data inicial.  
**Complejidad:** Media | **Impacto:** Medio

---

### 4.3 Transición de página: ninguna
Al navegar entre secciones (hamburger → ítem de menú), hay un corte abrupto. En una PWA instalada esto se siente más brusco que en un browser (sin barra de progreso del browser).

**Mejora:** `<ViewTransition>` de React 19 (ya disponible en Next.js 15+) o simplemente un `NProgress` bar en el layout para dar sensación de carga progresiva.  
**Complejidad:** Media | **Impacto:** Bajo

---

### 4.4 El asistente IA no muestra cuánto tarda
**Archivo:** `app/inteligencia/asistente/page.tsx`  
Los 3 puntitos animados son excelentes para feedback inmediato, pero una consulta puede tardar 10–30 segundos. Sin indicación de progreso el usuario no sabe si se trabó o está procesando.

**Mejora:** Pasados 5s de espera, mostrar un mensaje de contexto: "Consultando datos de ventas…". Se puede hacer con un `setTimeout` que cambia el texto del indicador.  
**Complejidad:** Baja | **Impacto:** Medio

---

## 5. NAVEGACIÓN

### 5.1 Hamburger es correcto para supervisores; cajeros necesitan bottom tabs
**Análisis del contexto:**
- **Cajeros:** Solo usan 2 secciones: POS (`/ventas`) y Cierre de caja (`/cierres`). El menú hamburger para acceder a estas 2 opciones es una capa innecesaria de fricción.
- **Supervisores:** Tienen 5 grupos con múltiples subitems. El hamburger con acordeón implementado es la solución correcta para esa cantidad de ítems.

**Mejora para cajeros:** Una bottom tab bar fija con 2 ítems:

```
[🛒 POS]  [🧮 Cierre]
```

Siempre visible, sin necesidad de abrir el menú. El toque en el ícono es más rápido y está en la zona del pulgar (parte inferior de la pantalla).

**Implementación:** Detectar el rol en el layout y renderizar la bottom bar solo cuando `emp.role === 'cashier'`. Ajustar el `padding-bottom` del contenido para que la bar no tape nada.  
**Complejidad:** Media | **Impacto:** Alto

---

### 5.2 El cajero no puede acceder al Asistente IA desde mobile
**Archivo:** `app/_components/HeaderNav.tsx`  
Los `cashierLinks` del cajero solo incluyen POS y Cierre:
```js
const cashierLinks = [
  { href: '/ventas', label: 'POS', icon: 'ti-shopping-cart' },
  { href: '/cierres', label: 'Cierre de caja', icon: 'ti-calculator' },
];
```
Si el cajero tiene dudas sobre stock o ventas, no puede consultar al asistente IA desde su sesión (incluso aunque la ruta `/inteligencia/asistente` no esté protegida para cajeros).

**Mejora:** Evaluar si agregar el asistente al menú del cajero. Si es intencional que no accedan, documentarlo. Si es un olvido, añadir `{ href: '/inteligencia/asistente', label: 'Asistente', icon: 'ti-message-circle' }`.  
**Complejidad:** Baja | **Impacto:** Medio

---

### 5.3 El header de 52px + py-6 del layout consumen demasiado espacio vertical
**Archivo:** `app/layout.tsx`  
```jsx
<div className="mx-auto max-w-6xl px-4 py-6">
```
El `py-6` (24px arriba y abajo) más el header de 52px consumen 100px antes de que aparezca el primer pixel de contenido. En un iPhone SE con 667px de alto, eso es el 15% de la pantalla usado solo en chrome.

**Mejora:** Reducir a `py-4` o `pt-4 pb-6` en el layout. En modo standalone PWA podría ser aún menos.  
**Complejidad:** Baja | **Impacto:** Bajo

---

## RESUMEN DE PRIORIDADES

| # | Mejora | Complejidad | Impacto |
|---|--------|-------------|---------|
| 1 | `orientation: "any"` en manifest | Baja | **Alto** |
| 2 | Botones +/− del carrito a 44px | Baja | **Alto** |
| 3 | Bottom tabs para cajeros | Media | **Alto** |
| 4 | Reemplazar `window.prompt()` para pesables | Media | **Alto** |
| 5 | Enter busca/agrega primer resultado | Media | **Alto** |
| 6 | Cards responsive para carrito (reemplaza tabla) | Media | **Alto** |
| 7 | Toast `bottom-center` | Baja | Medio |
| 8 | Modal de venta: `w-full max-w-sm` + auto-close | Baja | Medio |
| 9 | Banner offline en HeaderNav | Baja | Medio |
| 10 | Spinner en búsqueda de productos | Baja | Medio |
| 11 | Sugerencias IA siempre visibles (carrusel) | Baja | Medio |
| 12 | Precachear páginas del supervisor en SW | Baja | Medio |
| 13 | Cierre de caja: defaults por empleado | Media | Medio |
| 14 | Skeletons en páginas de datos | Media | Medio |
| 15 | Mensaje de progreso en asistente > 5s | Baja | Medio |
| 16 | Cajero accede al Asistente IA | Baja | Medio |
| 17 | `py-6` → `py-4` en layout | Baja | Bajo |
| 18 | Ícono maskable en manifest | Baja | Bajo |
| 19 | Chip "Instalado" en modo standalone | Baja | Bajo |
| 20 | ViewTransition entre páginas | Media | Bajo |

---

## QUICK WINS (hacer en una sesión)

Los ítems 1, 2, 7, 8, 9, 10, 15, 17 son todos de **complejidad baja** y se pueden implementar juntos en una sola sesión. Colectivamente transforman la experiencia sin tocar lógica de negocio.

El ítem 1 (orientation) es literalmente un cambio de una palabra en un JSON y es el que más impacto positivo tiene de toda la lista.
