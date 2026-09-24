# Panel de analítica de clientes (`/analytics`)

Muestra las visitas por hora, la ocupación actual, el estado del motor de visión (por
cámara) y el mapa de calor de circulación por sucursal. **Solo supervisores.** Se
actualiza por polling cada 15 s (se pausa con la pestaña oculta o sin conexión).

## Contrato del motor de visión

- `entries` (en `analytics_counts`) es un acumulado **del día**, y persiste entre
  reinicios del motor — pero un reinicio real (o cambio de hardware) puede seguir
  haciendo que el contador vuelva para atrás; el cliente lo trata defensivamente
  (`toHourly`, ver más abajo).
- El motor escribe cada 30s.
- **Multi-cámara:** solo la cámara de entrada escribe `analytics_counts` (ingresos y
  ocupación). Varias cámaras pueden escribir `analytics_health`, cada una con su
  `camera_id`. El heatmap viene de una sola cámara.
- `occupancy = entries − exits` (personas dentro), ya resuelto por el motor de la
  cámara de entrada — el cliente no recibe `exits` ni lo recalcula.
  Es un valor **directo** (no acumulado): el panel lo usa tal cual para el tile
  "Personas dentro ahora" (fila más reciente por ts) y para el gráfico "Ocupación
  durante el día" (última fila de cada minuto), siempre acotado a `max(0, occupancy)`
  (`lib/analytics/occupancy.ts`). No se calculan deltas como en `toHourly`.

## Cómo llegan los datos

```
motor de visión ──(service_role)──▶ analytics_* (Supabase)
                                         │
navegador ──polling 15s──▶ /api/analytics/{counts,heatmap,health,zones}?store=<id>
                                (supabaseAdmin + sesión supervisor)
```

El navegador **no** habla con Supabase: el POS usa su propia cookie/JWT (no Supabase
Auth) y las tablas `analytics_*` tienen RLS solo para `authenticated`, así que un
cliente anon vería 0 filas. Por eso las lecturas pasan por rutas del servidor, que
exigen sesión + rol supervisor (401 sin sesión, 403 si no es supervisor —
`requireSupervisor()` en `lib/analytics/server.ts`), y validan `?store` contra las
sucursales activas de `lib/stores.ts` (400 si no matchea).

En el cliente, cada fetch pasa por `ensureSession()` (regla del circuito offline) y
tiene un timeout de 10s (`AbortSignal.timeout`); si vence, se trata como error para no
dejar el polling mudo con un fetch colgado. Si el servidor devuelve 401 real (sesión
vencida, no solo "sin cookie offline"), el panel manda a `/pos-login`.

## Antigüedad de los datos ("actualizado hace X")

`counts` y `heatmap` devuelven también la antigüedad del dato más nuevo, calculada por
el servidor (`ageSeconds()` en `lib/analytics/server.ts`) — nunca comparando el `ts`
contra el reloj del navegador. El cliente arranca de ese valor y lo va sumando
localmente con un timer (`lib/analytics/useTickingAge.ts`) para que seguir "en vivo"
sin volver a pedirle la hora al servidor en cada segundo. Mientras no hay datos (o
está cargando), el panel muestra "—" o un esqueleto, nunca 0 como si fuera un dato
real.

## Multi-cámara: estado del motor

`GET /api/analytics/health?store=<id>` devuelve el último latido **por camera_id**
(ventana de 5 min), con `online` y `ageSeconds` ya resueltos en el servidor
(`STALE_SECONDS = 60`). El panel muestra "N de M cámaras en línea" en vez de un único
estado binario.

## Estructura

```
app/analytics/page.tsx, error.tsx       # ruta /analytics; exige sesión + supervisor
app/api/analytics/{counts,heatmap,health,zones}/route.ts
components/analytics/
  AnalyticsDashboard.tsx, KpiCards.tsx, HourlyTrafficChart.tsx,
  HeatmapCanvas.tsx, StorePicker.tsx, TopZones.tsx, ErrorRetry.tsx
lib/analytics/
  types.ts, queries.ts                  # tipos, fetchers (vía API) y toHourly
  countsMemo.ts                         # acumulación incremental de conteos (función pura)
  api.ts                                # GET autenticado (ensureSession + timeout 10s + 401→login)
  usePolling.ts                         # polling genérico (+ refetch manual, full-refetch cada ~20 polls)
  useTodayCounts.ts, useLatestHeatmap.ts, useDeviceStatus.ts, useZones.ts
  useTickingAge.ts                      # antigüedad en vivo a partir de un baseline del servidor
  formatAge.ts, time.ts, validateHeatmap.ts
  server.ts                             # helpers de las rutas (auth, store param, "hoy" AR, ageSeconds)
  __tests__/                            # Vitest: toHourly, applyCounts, "hoy" AR
```

### Conteos incrementales

`counts` responde `{ rows, day, latestAgeSeconds }`. La primera carga trae todo el
día; después el hook pide `?after_id=<último id recibido>` y agrega solo las filas
nuevas a las que tiene en memoria (`lib/analytics/countsMemo.ts`), sobre las que corre
`toHourly`. Si `day` cambia (medianoche de Argentina), descarta lo acumulado y vuelve
a pedir el día completo. Cada ~20 polls se ignora el incremental como red de
seguridad, por si alguno se perdió silenciosamente (`usePolling.ts`).

`toHourly` suma deltas entre filas **consecutivas** ordenadas por `ts`
(`cur.entries − prev.entries`), tratando `cur.entries < prev.entries` como reinicio
del motor (se suma `cur.entries`, contando desde cero otra vez). La primera fila del
día no es un caso especial: usa un `prev` virtual de 0. Las horas sin filas se
rellenan con 0 ingresos.

Tablas que lee: `analytics_counts` (conteos del día, hora de Argentina),
`analytics_heatmap` (última fila), `analytics_health` (último latido por cámara),
`analytics_zone_dwell` (permanencia del día por zona).

## Heatmap: validación de forma

Antes de dibujar, se valida que `cols`/`rows` sean enteros 1..256 y que `grid` tenga
exactamente `rows` filas de `cols` valores numéricos (`lib/analytics/validateHeatmap.ts`).
Si no, no se dibuja: se muestra un aviso en vez de un canvas roto o datos engañosos.

## store_id

`analytics_*.store_id` es `text`. El panel usa los UUID de `lib/stores.ts`, así que el
motor de visión tiene que arrancar con `--store-id <UUID de la sucursal>`:

- Alberdi: `914dee4d-a78c-4f3f-8998-402c56fc88e9`
- Av. San Martín: `06ca13ff-d96d-4670-84d7-41057b3f6bc7`

## Privacidad

El panel nunca ve video ni personas: solo números y una grilla agregada.
