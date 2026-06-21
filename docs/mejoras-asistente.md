# Mejoras del Asistente IA — Super Juampy

> Diagnóstico realizado: 2026-06-11  
> Basado en código real y datos de producción.

---

## Contexto: qué tiene el sistema que el asistente NO usa hoy

| Recurso disponible | Qué contiene | ¿Usado? |
|---|---|---|
| `v_sales_products` | Ventas por producto por día (unidades + facturación) | ❌ |
| `v_pos_sales_kpis` | KPIs diarios por sucursal desde sept-2025 (9 meses) | ❌ |
| `stock_movements` | Historial de ajustes, ventas y anulaciones | ❌ |
| `product_offers` | 3 ofertas activas, tabla completa | ❌ |
| `cash_closures` | 10 últimos cierres incluyendo diferencias caja/ventas | ✅ enviados, pero sin instrucción de interpretarlos |
| `sale_items.created_at` | Timestamp por ítem → análisis horario posible | ❌ |
| `supervisor_authorizations` | Log de autorizaciones del supervisor | ❌ |
| `employees` | Nombre, caja asignada, sucursal | ❌ |

---

## 1. Nuevas capacidades

### A. Conciliación de caja en las respuestas
**Complejidad: Baja | Impacto: Alto**

Los datos ya llegan al asistente: los últimos 10 cierres incluyen `total_sales` y `total_cash`. No hay instrucción para interpretarlos. En el cierre del 2026-03-03 hay una diferencia de $19.000 entre lo declarado en efectivo ($16.000) y las ventas ($35.000) que el modelo nunca menciona.

**Cambio necesario**: agregar al system prompt en `app/api/ai/assistant/route.ts`:
```
Revisá las diferencias entre total_sales y total_cash en los cierres y alertá si hay discrepancias mayores al 10%.
```
No requiere cambios de código, solo de prompt. **Capacidad habilitada de inmediato.**

---

### B. Comparativas históricas mes a mes
**Complejidad: Media | Impacto: Alto**

La vista `v_pos_sales_kpis` tiene 9 meses de datos (sept-2025 a jun-2026) con tickets y facturación por día por sucursal. Hoy `getBusinessData()` consulta solo 30 y 60 días hacia atrás. Preguntas como "¿cómo fue diciembre vs enero?" o "¿cuánto creció febrero respecto a noviembre?" son imposibles.

**Cambio necesario**: agregar en `getBusinessData()` una query de resumen mensual histórico:
```typescript
supabase.from("v_pos_sales_kpis")
  .select("date, store_id, total_amount, total_tickets")
  .gte("date", twelveMonthsAgo)
  .order("date", { ascending: true })
// Agrupar por mes y store_id antes de enviar al modelo (~36 filas)
```

---

### C. Análisis de tendencias por producto
**Complejidad: Media | Impacto: Alto**

La vista `v_sales_products` tiene unidades y facturación por producto por día desde sept-2025. Hoy solo se mandan los "top 10 de la semana" y "top 10 del mes" como listas estáticas. Preguntas como "¿cuánto bajaron las ventas del Villa del Sur?" son completamente imposibles.

**Cambio necesario**: query a `v_sales_products` filtrada por top 30-50 productos más vendidos históricamente, agrupada por semana o mes.

---

### D. Análisis horario
**Complejidad: Baja | Impacto: Medio**

`sale_items.created_at` existe. Una query agrupando ventas de la semana por franja horaria respondería "¿cuándo es la hora pico?" y "¿qué horario necesito más cajeros?".

**Cambio necesario**: agregar en `getBusinessData()`:
```typescript
supabase.rpc("fn_sales_by_hour", { p_from: weekAgoAR, p_to: todayAR })
// O query directa agrupando por EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Argentina/Cordoba')
```
Resultado: ~16 filas (16 franjas horarias), costo de tokens despreciable.

---

### E. Historial de ajustes de stock
**Complejidad: Baja | Impacto: Medio**

`stock_movements` tiene razones (`adjust`, `adjust_in`, `adjust_out`, `sale_stock_deficit`, `void_sale`). Una query de los últimos 30 días agrupada por tipo respondería "¿cuántos ajustes manuales hicimos este mes?" o "¿qué productos tuvieron más faltantes en venta?".

**Cambio necesario**: agregar en `getBusinessData()`:
```typescript
supabase.from("stock_movements")
  .select("reason, product_id, qty, created_at, products(name)")
  .gte("created_at", monthAgo.toISOString())
  .order("created_at", { ascending: false })
  .limit(100)
```

---

### F. Rendimiento por cajero/caja
**Complejidad: Media | Impacto: Medio**

`sales` tiene `register_id` y las `registers` tienen nombre y store. Una query agrupando facturación y tickets por caja por día respondería "¿qué caja vendió más hoy?" o "¿hay alguna caja que está muy por debajo?".

**Cambio necesario**: query JOIN entre `sales`, `registers` y `employees` agrupada por `register_id` para el período del día/semana.

---

### G. Estado actual de ofertas
**Complejidad: Baja | Impacto: Bajo**

Hay 3 ofertas activas en `product_offers`. El asistente no las conoce. "¿Qué ofertas tenemos activas?" es imposible hoy.

**Cambio necesario**: agregar en `getBusinessData()`:
```typescript
supabase.from("product_offers")
  .select("product_id, type, value, starts_at, ends_at, products(name)")
  .gte("ends_at", new Date().toISOString())
  .eq("active", true)
```

---

## 2. Proactividad

El sistema actual dispara un único alert al abrir la página (una vez por día). Posibles expansiones:

### A. Alerta de discrepancia en cierre de caja
**Complejidad: Baja | Impacto: Alto**

Cuando se ejecuta un cierre en `app/api/cash-closure/route.ts`, comparar `total_cash` declarado vs `total_sales` esperado. Si la diferencia supera el 5%, inyectar una alerta en el próximo acceso al asistente.

**Implementación**: hook post-cierre que escribe en `ai_business_cache` o en una tabla `ai_pending_alerts`. El asistente la incluye como mensaje proactivo al abrir.

---

### B. Alerta de producto agotado durante ventas
**Complejidad: Baja | Impacto: Alto**

`stock_movements` ya registra `sale_stock_deficit` cuando se vende más de lo disponible. Una query al inicio del día detecta qué productos se vendieron con stock insuficiente ayer.

**Implementación**: en `lib/useProactiveAlert.ts`, agregar una query a `stock_movements` filtrando `reason = 'sale_stock_deficit'` del día anterior.

---

### C. Alerta de caída de ventas intradiaria
**Complejidad: Media | Impacto: Medio**

Comparar ventas de las últimas 2 horas vs el mismo intervalo de días anteriores. Si son las 15:00 y se vendió 60% menos que lo usual a esa hora, alertar.

**Implementación**: un cron Vercel (o polling desde el cliente cada 30 min) que ejecuta una comparativa horaria y escribe en `ai_pending_alerts`.

---

### D. Alerta de ofertas por vencer
**Complejidad: Baja | Impacto: Bajo**

Cada mañana, verificar si hay ofertas en `product_offers` con `ends_at` dentro de las próximas 24 horas.

**Implementación**: agregar al check de alertas en `useProactiveAlert.ts`.

---

### E. Alerta de inactividad de caja
**Complejidad: Media | Impacto: Medio**

Si una caja no registra ventas en más de 90 minutos durante el horario comercial (9:00-21:00), alertar. Puede indicar problema técnico o cajero ausente.

**Implementación**: query a `sales` agrupada por `register_id` comparando el timestamp de la última venta por caja.

---

## 3. Acciones (el asistente ejecuta, no solo responde)

El sistema ya tiene los endpoints necesarios. El patrón es: **IA propone → usuario confirma → IA ejecuta** usando Anthropic tool use (function calling).

### A. Crear/modificar ofertas vía chat
**Complejidad: Media | Impacto: Alto**

`POST /api/offers` está completamente implementado. El supervisor podría decir "creá una oferta del 20% para el aceite Buyatti este fin de semana" y el asistente llama al endpoint.

**Implementación**:
1. Agregar `tools` param a `anthropic.messages.create()` en `app/api/ai/assistant/route.ts`
2. Manejar el bloque `tool_use` en la respuesta
3. Agregar componente de confirmación en el chat antes de ejecutar
4. Llamar `POST /api/offers` con los parámetros extraídos

```typescript
// Definición de la herramienta para Anthropic
{
  name: "create_offer",
  description: "Crea una oferta de descuento para un producto",
  input_schema: {
    type: "object",
    properties: {
      product_id: { type: "string" },
      type: { type: "string", enum: ["percentage", "fixed"] },
      value: { type: "number" },
      starts_at: { type: "string" },
      ends_at: { type: "string" }
    },
    required: ["product_id", "type", "value"]
  }
}
```

---

### B. Ajuste de stock desde chat
**Complejidad: Media | Impacto: Medio**

`POST /api/stock/adjust` existe. "Corregí el stock del Villa del Sur en Alberdi a 50 unidades" sería ejecutable.

**Implementación**: igual que A, con herramienta `adjust_stock`. Requiere confirmación obligatoria antes de ejecutar (acción irreversible sin supervisor).

---

### C. Generación de texto de marketing desde chat
**Complejidad: Baja | Impacto: Medio**

`POST /api/marketing/generate-text` ya existe. "Generá un aviso para Instagram anunciando la oferta del aceite" puede ejecutarse conectando el chat al endpoint existente, o simplemente delegando al modelo directamente (es solo texto).

**Implementación**: el modelo genera el texto, se muestra con botón "Copiar". Sin cambios de backend necesarios.

---

### D. Informe exportable
**Complejidad: Baja | Impacto: Medio**

"Generá el resumen del día para mandarle al dueño" → respuesta formateada → botón "Copiar" o "Descargar TXT".

**Implementación**: detectar cuando la respuesta es un resumen y mostrar botón de copia. Solo cambios en el frontend (`app/inteligencia/asistente/page.tsx`).

---

## 4. UX

### A. Streaming de respuestas
**Complejidad: Media | Impacto: Alto**

Hoy el usuario ve 0 tokens hasta que la respuesta completa llega del servidor (1-3s para respuestas cortas, 4-8s para análisis largos). Streaming muestra texto token a token — la diferencia percibida en mobile es dramática.

**Implementación**:

En `app/api/ai/assistant/route.ts`:
```typescript
// Cambiar anthropic.messages.create() por stream:
const stream = await anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationMessages,
});

return new Response(stream.toReadableStream(), {
  headers: { "Content-Type": "text/event-stream" }
});
```

En `app/inteligencia/asistente/page.tsx`:
```typescript
const reader = res.body!.getReader();
// Leer chunks y actualizar el último mensaje progresivamente
```

---

### B. Sugerencias dinámicas y contextuales
**Complejidad: Baja | Impacto: Medio**

Las 6 sugerencias actuales en `SUGERENCIAS` son estáticas. Podrían ser dinámicas por hora del día y basadas en el último alert activo.

**Implementación**: reemplazar el array estático por una función que evalúa la hora y el `proactiveMsg`:
```typescript
function getSugerencias(hour: number, hasAlert: boolean): string[] {
  if (hasAlert) return ["¿Qué productos tengo que pedir hoy?", ...];
  if (hour < 10) return ["¿Cómo fue ayer?", "¿Cómo arrancó la mañana?", ...];
  if (hour >= 18) return ["¿Cómo vamos hoy?", "¿Qué vendimos esta tarde?", ...];
  // ...
}
```

---

### C. Historial persistente de conversaciones
**Complejidad: Media | Impacto: Medio**

Hoy toda la conversación se pierde al navegar a otra página o refrescar. Una tabla `ai_conversations` permitiría continuar análisis anteriores.

**Implementación**:
```sql
CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id),
  store_id uuid REFERENCES stores(id),
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

El array `messages` actual (`[{role, content}]`) se mapea directamente a una fila. Cargar al abrir la página, guardar en cada intercambio.

---

### D. Indicador de frescura de datos
**Complejidad: Baja | Impacto: Bajo**

La caché dura 20 minutos. Mostrar "datos actualizados hace X min" basado en `ai_business_cache.expires_at`.

**Implementación**: el endpoint devuelve `cache_age_seconds` en la respuesta. El frontend lo muestra como `"📊 Datos de hace 4 min · actualizar"` con un botón que invalida la caché.

---

### E. Toggle brevedad/análisis
**Complejidad: Baja | Impacto: Bajo**

Un toggle "Respuesta rápida / Análisis completo" que pase un flag al system prompt. Para un cajero consultando desde el POS en medio de la caja, la brevedad es esencial.

**Implementación**: agregar `mode: "brief" | "detailed"` al body del fetch. El system prompt incluye "Respondé en máximo 2 oraciones" o "Respondé con análisis completo" según el valor.

---

## Resumen por retorno de esfuerzo

| # | Mejora | Complejidad | Impacto |
|---|---|---|---|
| 1A | Instrucción para analizar discrepancias de caja (solo prompt) | **Baja** | **Alto** |
| 3A | Crear ofertas vía chat (tool use) | Media | **Alto** |
| 1B | Comparativas históricas mes a mes | Media | **Alto** |
| 2A | Alert post-cierre con discrepancia | Baja | **Alto** |
| 4A | Streaming | Media | **Alto** |
| 1C | Tendencias por producto (`v_sales_products`) | Media | Alto |
| 2B | Alert de producto agotado en venta (`sale_stock_deficit`) | Baja | Alto |
| 1D | Análisis horario (hora pico) | Baja | Medio |
| 3B | Ajuste de stock vía chat | Media | Medio |
| 4B | Sugerencias dinámicas | Baja | Medio |
| 1E | Historial de ajustes de stock | Baja | Medio |
| 1F | Rendimiento por cajero/caja | Media | Medio |
| 4C | Historial persistente | Media | Medio |
| 3C | Marketing desde chat | Baja | Medio |
| 3D | Informe exportable/copiable | Baja | Medio |
| 1G | Estado de ofertas activas | Baja | Bajo |
| 4D | Indicador de frescura de datos | Baja | Bajo |
| 4E | Toggle brevedad/análisis | Baja | Bajo |

**Mayor retorno inmediato**: el ítem 1A es un cambio de 2 líneas en el system prompt que activa una capacidad con datos que ya llegan al modelo. Los ítems 1B y 1C usan vistas que ya existen en la DB y habilitan análisis histórico — donde el modelo agrega más valor para decisiones de negocio.
