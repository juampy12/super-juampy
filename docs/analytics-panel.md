# Panel de analítica de clientes (`/analytics`)

Muestra las visitas por hora, la ocupación actual, el estado del motor de visión y el
mapa de calor de circulación por sucursal. **Solo supervisores.** Se actualiza por
polling cada 15 s (se pausa con la pestaña oculta o sin conexión).

## Cómo llegan los datos

```
motor de visión ──(service_role)──▶ analytics_* (Supabase)
                                         │
navegador ──polling 15s──▶ /api/analytics/{counts,heatmap,health}?store=<id>
                                (supabaseAdmin + sesión supervisor)
```

El navegador **no** habla con Supabase: el POS usa su propia cookie/JWT (no Supabase
Auth) y las tablas `analytics_*` tienen RLS solo para `authenticated`, así que un
cliente anon vería 0 filas. Por eso las lecturas pasan por rutas del servidor, que
exigen sesión + rol supervisor (401 sin sesión, 403 si no es supervisor).

## Estructura

```
app/analytics/page.tsx                 # ruta /analytics; exige sesión + supervisor
app/api/analytics/{counts,heatmap,health}/route.ts
components/analytics/
  AnalyticsDashboard.tsx, KpiCards.tsx, HourlyTrafficChart.tsx,
  HeatmapCanvas.tsx, StorePicker.tsx
lib/analytics/
  types.ts, queries.ts                 # tipos, fetchers (vía API) y toHourly
  countsMemo.ts                        # acumulación incremental de conteos (función pura)
  api.ts                               # GET autenticado (pasa por ensureSession)
  usePolling.ts                        # polling genérico
  useRealtimeCounts.ts, useLatestHeatmap.ts, useDeviceStatus.ts
  server.ts                            # helpers de las rutas (store param, "hoy" en UTC-3)
```

### Conteos incrementales

`counts` responde `{ rows, day }`. La primera carga trae todo el día; después el hook
pide `?after_id=<último id recibido>` y agrega solo las filas nuevas a las que tiene en
memoria (`lib/analytics/countsMemo.ts`), sobre las que corre `toHourly`. Si `day` cambia
(medianoche de Argentina), descarta lo acumulado y vuelve a pedir el día completo.

Tablas que lee: `analytics_counts` (conteos del día, hora de Argentina),
`analytics_heatmap` (última fila), `analytics_health` (último latido).

## store_id

`analytics_*.store_id` es `text`. El panel usa los UUID de `lib/stores.ts`, así que el
motor de visión tiene que arrancar con `--store-id <UUID de la sucursal>`:

- Alberdi: `914dee4d-a78c-4f3f-8998-402c56fc88e9`
- Av. San Martín: `06ca13ff-d96d-4670-84d7-41057b3f6bc7`

## Fondo del heatmap (opcional)

```tsx
<AnalyticsDashboard stores={stores} backgroundByStore={{ [storeId]: "/planos/alberdi.jpg" }} />
```

El `img-src` del CSP permite `'self'`, así que el plano tiene que estar en `public/`.

## Privacidad

El panel nunca ve video ni personas: solo números y una grilla agregada.
