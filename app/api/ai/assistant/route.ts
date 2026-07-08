import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Cache de datos del negocio en Supabase — persiste entre cold starts de Vercel.
// Requiere la tabla ai_business_cache: key TEXT PK, data JSONB, expires_at TIMESTAMPTZ.
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos

// supabase-js no lanza excepción en un error de query — devuelve {data: null,
// error}. Sin este log, un error (columna inexistente, RPC rota, etc.) queda
// enmascarado por el fallback `data ?? []` y el asistente responde como si
// simplemente no hubiera datos, en vez de avisar que la query falló.
function logIfError(label: string, error: { message?: string } | null | undefined) {
  if (error) console.error(`getBusinessData: error en ${label}:`, error.message ?? error);
}

async function getBusinessDataCached(cacheKey: string) {
  // 1. Buscar hit vigente en la DB (sobrevive cold starts)
  const { data: cached } = await supabase
    .from("ai_business_cache")
    .select("data, expires_at")
    .eq("key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached?.data) {
    return cached.data as Awaited<ReturnType<typeof getBusinessData>>;
  }

  // 2. Cache miss: obtener datos frescos
  const data = await getBusinessData();

  // 3. Persistir (upsert por si dos requests llegan simultáneamente)
  await supabase
    .from("ai_business_cache")
    .upsert(
      {
        key: cacheKey,
        data: data as any,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "key" }
    );

  // 4. Limpieza de expirados (fire-and-forget, no bloquea la respuesta)
  void supabase
    .from("ai_business_cache")
    .delete()
    .lt("expires_at", new Date().toISOString());

  return data;
}

async function getBusinessData() {
  const now = new Date();
  const tz = "America/Argentina/Cordoba";
  const todayAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(weekAgo);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthAgoAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(monthAgo);
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const yesterdayAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz })
    .format(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const sixMonthsAgoAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(sixMonthsAgo);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgoAR = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(twelveMonthsAgo);

  const [
    salesToday, salesYesterday, salesWeek, salesMonth,
    salesPrevMonth, topWeek, topMonth, lowStock,
    stores, allProducts, closures, stockMovements, activeOffers
  ] = await Promise.all([
    supabase.from("sales").select("total, store_id, created_at, payment")
      .eq("status", "confirmed")
      .gte("created_at", `${todayAR}T00:00:00-03:00`)
      .lte("created_at", `${todayAR}T23:59:59-03:00`),
    supabase.from("sales").select("total, store_id")
      .eq("status", "confirmed")
      .gte("created_at", `${yesterdayAR}T00:00:00-03:00`)
      .lte("created_at", `${yesterdayAR}T23:59:59-03:00`),
    supabase.from("sales").select("total, store_id, created_at")
      .eq("status", "confirmed")
      .gte("created_at", weekAgo.toISOString()),
    supabase.from("sales").select("total, store_id, created_at")
      .eq("status", "confirmed")
      .gte("created_at", monthAgo.toISOString()),
    supabase.from("sales").select("total, store_id")
      .eq("status", "confirmed")
      .gte("created_at", twoMonthsAgo.toISOString())
      .lte("created_at", monthAgo.toISOString()),
    supabase.rpc("fn_top_products_range_all", { p_from: weekAgoAR, p_to: todayAR, p_limit: 10 }),
    supabase.rpc("fn_top_products_range_all", { p_from: monthAgoAR, p_to: todayAR, p_limit: 10 }),
    supabase.from("product_min_stock").select("product_id, min_stock, store_id, products(name, sku), product_stocks(stock)").limit(20),
    supabase.from("stores").select("id, name"),
    supabase.from("products").select("id, name, price, cost_net, markup_rate, active")
      .eq("active", true).gt("cost_net", 0).gt("price", 0),
    supabase.from("cash_closures").select("store_id, date, total_sales, total_cash, total_tickets").order("date", { ascending: false }).limit(10),
    supabase.from("stock_movements")
      .select("reason, product_id, qty, created_at, products(name)")
      .gte("created_at", monthAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("product_offers")
      .select("product_id, type, value, qty_buy, qty_pay, starts_at, ends_at, products(name)")
      .gte("ends_at", new Date().toISOString())
      .eq("is_active", true),
  ]);

  logIfError("sales (hoy)", salesToday.error);
  logIfError("sales (ayer)", salesYesterday.error);
  logIfError("sales (semana)", salesWeek.error);
  logIfError("sales (mes)", salesMonth.error);
  logIfError("sales (mes anterior)", salesPrevMonth.error);
  logIfError("fn_top_products_range_all (semana)", topWeek.error);
  logIfError("fn_top_products_range_all (mes)", topMonth.error);
  logIfError("product_min_stock", lowStock.error);
  logIfError("stores", stores.error);
  logIfError("products (margen)", allProducts.error);
  logIfError("cash_closures", closures.error);
  logIfError("stock_movements", stockMovements.error);
  logIfError("product_offers", activeOffers.error);

  const storeMap: Record<string, string> = {};
  (stores.data ?? []).forEach((s: any) => { storeMap[s.id] = s.name; });

  // 1B + 1C: bloque histórico secuencial (cacheado, latencia aceptable)
  // Columnas reales: v_sales_daily tiene "total" (no "total_amount"),
  // v_sales_products tiene "date"/"product_name" (no "day"/"name"). Un typo
  // acá hacía que ambas queries fallaran en silencio y el asistente nunca
  // tuviera datos de meses anteriores (ver auditoria-motor-promos.md / fix
  // posterior de este mismo bug).
  const [salesHistoryRes, topSixMonthsRes] = await Promise.all([
    supabase.from("v_sales_daily")
      .select("date, store_id, total, tickets")
      .gte("date", twelveMonthsAgoAR)
      .order("date", { ascending: true }),
    supabase.rpc("fn_top_products_range_all", { p_from: sixMonthsAgoAR, p_to: todayAR, p_limit: 50 }),
  ]);

  logIfError("v_sales_daily (historico_mensual)", salesHistoryRes.error);
  logIfError("fn_top_products_range_all (6 meses, top50)", topSixMonthsRes.error);

  const top50Ids = (topSixMonthsRes.data ?? [])
    .map((p: any) => p.product_id as string)
    .filter(Boolean)
    .slice(0, 50);

  let productTrendsData: any[] = [];
  if (top50Ids.length > 0) {
    const { data: trendsData, error: trendsError } = await supabase.from("v_sales_products")
      .select("date, product_id, product_name, units, revenue")
      .in("product_id", top50Ids)
      .gte("date", sixMonthsAgoAR)
      .order("date", { ascending: true });
    logIfError("v_sales_products (tendencias_productos)", trendsError);
    productTrendsData = trendsData ?? [];
  }

  const todaySales = salesToday.data ?? [];
  const yesterdaySales = salesYesterday.data ?? [];
  const weekSales = salesWeek.data ?? [];
  const monthSales = salesMonth.data ?? [];
  const prevMonthSales = salesPrevMonth.data ?? [];

  const totalHoy = todaySales.reduce((a: number, s: any) => a + Number(s.total), 0);
  const totalAyer = yesterdaySales.reduce((a: number, s: any) => a + Number(s.total), 0);
  const totalSemana = weekSales.reduce((a: number, s: any) => a + Number(s.total), 0);
  const totalMes = monthSales.reduce((a: number, s: any) => a + Number(s.total), 0);
  const totalMesAnterior = prevMonthSales.reduce((a: number, s: any) => a + Number(s.total), 0);

  // Ventas por sucursal
  const porSucursalHoy: Record<string, number> = {};
  todaySales.forEach((s: any) => {
    const n = storeMap[s.store_id] ?? s.store_id;
    porSucursalHoy[n] = (porSucursalHoy[n] ?? 0) + Number(s.total);
  });
  const porSucursalSemana: Record<string, number> = {};
  weekSales.forEach((s: any) => {
    const n = storeMap[s.store_id] ?? s.store_id;
    porSucursalSemana[n] = (porSucursalSemana[n] ?? 0) + Number(s.total);
  });

  // Ventas por día de la semana
  const porDia: Record<string, { total: number; tickets: number }> = {};
  weekSales.forEach((s: any) => {
    const dia = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: tz }).format(new Date(s.created_at));
    if (!porDia[dia]) porDia[dia] = { total: 0, tickets: 0 };
    porDia[dia].total += Number(s.total);
    porDia[dia].tickets += 1;
  });

  // Ventas por hora del día (acumulado de la semana)
  const porHora: Record<string, { total: number; tickets: number }> = {};
  weekSales.forEach((s: any) => {
    const hora = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", hour12: false, timeZone: tz }).format(new Date(s.created_at));
    if (!porHora[hora]) porHora[hora] = { total: 0, tickets: 0 };
    porHora[hora].total += Number(s.total);
    porHora[hora].tickets += 1;
  });

  // Métodos de pago hoy
  const metodosPago: Record<string, number> = {};
  todaySales.forEach((s: any) => {
    const method = (s.payment as any)?.method ?? "efectivo";
    metodosPago[method] = (metodosPago[method] ?? 0) + Number(s.total);
  });

  // Variación mes a mes
  const variacionMes = totalMesAnterior > 0
    ? ((totalMes - totalMesAnterior) / totalMesAnterior * 100).toFixed(1)
    : null;

  // Productos con margen calculado
  const productosConMargen = (allProducts.data ?? [])
    .filter((p: any) => p.price > 0 && p.cost_net > 0)
    .map((p: any) => ({
      nombre: p.name,
      precio: Number(p.price),
      costo: Number(p.cost_net),
      margen_pct: Number((((p.price - p.cost_net) / p.price) * 100).toFixed(1)),
    }))
    .sort((a: any, b: any) => b.margen_pct - a.margen_pct);

  // 1B: histórico mensual por sucursal (últimos 12 meses)
  const mensualMap: Record<string, { mes: string; sucursal: string; total: number; tickets: number }> = {};
  (salesHistoryRes.data ?? []).forEach((r: any) => {
    const mes = String(r.date ?? "").slice(0, 7);
    if (!mes) return;
    const sucursal = storeMap[r.store_id] ?? (r.store_id ?? "general");
    const key = `${mes}|${sucursal}`;
    if (!mensualMap[key]) mensualMap[key] = { mes, sucursal, total: 0, tickets: 0 };
    mensualMap[key].total += Number(r.total ?? 0);
    mensualMap[key].tickets += Number(r.tickets ?? 0);
  });
  const historico_mensual = Object.values(mensualMap)
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.sucursal.localeCompare(b.sucursal))
    .map(m => ({ mes: m.mes, sucursal: m.sucursal, total: Math.round(m.total), tickets: m.tickets }));

  // 1C: tendencias mensuales de los top 50 productos (últimos 6 meses)
  const trendMap: Record<string, { nombre: string; por_mes: Record<string, { unidades: number; facturacion: number }> }> = {};
  productTrendsData.forEach((r: any) => {
    const mes = String(r.date ?? "").slice(0, 7);
    if (!mes || !r.product_id) return;
    if (!trendMap[r.product_id]) trendMap[r.product_id] = { nombre: r.product_name, por_mes: {} };
    const m = trendMap[r.product_id].por_mes;
    if (!m[mes]) m[mes] = { unidades: 0, facturacion: 0 };
    m[mes].unidades += Number(r.units ?? 0);
    m[mes].facturacion += Number(r.revenue ?? 0);
  });
  const tendencias_productos = Object.values(trendMap).map(p => ({
    nombre: p.nombre,
    por_mes: Object.fromEntries(
      Object.entries(p.por_mes).map(([mes, v]) => [mes, { unidades: Math.round(v.unidades), facturacion: Math.round(v.facturacion) }])
    ),
  }));

  return {
    fecha_hoy: todayAR,
    ventas: {
      hoy: {
        total: totalHoy,
        tickets: todaySales.length,
        ticket_promedio: todaySales.length > 0 ? totalHoy / todaySales.length : 0,
        por_sucursal: porSucursalHoy,
        metodos_pago: metodosPago,
        vs_ayer: totalAyer > 0 ? ((totalHoy - totalAyer) / totalAyer * 100).toFixed(1) + "%" : "sin datos de ayer",
      },
      ayer: { total: totalAyer, tickets: yesterdaySales.length },
      semana: {
        total: totalSemana,
        tickets: weekSales.length,
        ticket_promedio: weekSales.length > 0 ? totalSemana / weekSales.length : 0,
        por_sucursal: porSucursalSemana,
        por_dia: porDia,
      },
      mes: {
        total: totalMes,
        tickets: monthSales.length,
        ticket_promedio: monthSales.length > 0 ? totalMes / monthSales.length : 0,
        variacion_vs_mes_anterior: variacionMes ? variacionMes + "%" : "sin datos",
      },
    },
    top_productos_semana: (topWeek.data ?? []).map((p: any) => ({
      nombre: p.name, sku: p.sku,
      unidades: Number(p.qty_sold), facturacion: Number(p.total_amount), stock: Number(p.stock),
    })),
    top_productos_mes: (topMonth.data ?? []).map((p: any) => ({
      nombre: p.name, unidades: Number(p.qty_sold), facturacion: Number(p.total_amount),
    })),
    stock_bajo: (lowStock.data ?? []).map((p: any) => ({
      producto: (p.products as any)?.name ?? p.product_id,
      stock_actual: (p.product_stocks as any)?.stock ?? 0,
      stock_minimo: p.min_stock,
      sucursal: storeMap[p.store_id] ?? p.store_id,
    })),
    productos_mejor_margen: productosConMargen.slice(0, 10),
    productos_peor_margen: productosConMargen.slice(-10).reverse(),
    ultimos_cierres: (closures.data ?? []).map((c: any) => ({
      fecha: c.date, sucursal: storeMap[c.store_id] ?? c.store_id,
      ventas: Number(c.total_sales), efectivo: Number(c.total_cash), tickets: c.total_tickets,
    })),
    sucursales: Object.values(storeMap),
    ventas_por_hora_semana: Object.entries(porHora)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, v]) => ({ hora, total: Math.round(v.total), tickets: v.tickets })),
    ajustes_stock_30d: (stockMovements.data ?? []).map((m: any) => ({
      razon: m.reason,
      producto: (m.products as any)?.name ?? m.product_id,
      cantidad: Number(m.qty),
      fecha: m.created_at,
    })),
    ofertas_activas: (activeOffers.data ?? []).map((o: any) => ({
      producto: (o.products as any)?.name ?? o.product_id,
      tipo: o.type,
      valor: o.value,
      // Para nxm: qty_buy/qty_pay describen "llevá X, pagá Y" (ej. 3x2).
      // Para second_unit_pct: qty_buy=2 fijo, "valor" es el % de descuento
      // de la 2da unidad. Para percent/fixed_price quedan en null.
      qty_buy: o.qty_buy ?? null,
      qty_pay: o.qty_pay ?? null,
      desde: o.starts_at,
      hasta: o.ends_at,
    })),
    historico_mensual,
    tendencias_productos,
  };
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });
    }

    const supervisorRole = isSupervisor(session);
    // Supervisores pueden consultar una sucursal específica o "all"; cajeros usan la suya
    const storeId = supervisorRole
      ? (String(body.store_id ?? "").trim() || "all")
      : (session.store_id ?? "all");
    const data = supervisorRole ? await getBusinessDataCached(storeId) : null;

    const systemPrompt = supervisorRole
      ? `Sos el asistente de inteligencia artificial del sistema POS de Super Juampy, una cadena de supermercados en Charata, Chaco, Argentina.

Tenés acceso a los datos actualizados del negocio. Respondé siempre en español argentino, de forma clara, concisa y útil para el gerente del supermercado.

Datos actuales del negocio:
${JSON.stringify(data)}

Reglas:
- Usá pesos argentinos (ARS) con formato $X.XXX,XX
- Respondé de forma directa y útil
- Si no tenés datos para responder algo, decilo claramente
- Podés hacer análisis, comparaciones y sugerencias basadas en los datos
- Fecha actual: ${data!.fecha_hoy}
- Las sucursales son: ${data!.sucursales.join(", ")}
- Revisá siempre las diferencias entre ventas y efectivo en los cierres (ultimos_cierres). Si la discrepancia supera el 10%, alertá mencionando el porcentaje exacto y los montos.
- Tenés en "historico_mensual" el detalle mes a mes por sucursal de los últimos 12 meses: usalo para responder comparativas como "¿cómo fue diciembre vs enero?" o "¿cuánto crecimos este mes?".
- Tenés en "tendencias_productos" la evolución mensual de los top 50 productos de los últimos 6 meses: usalo para detectar caídas o crecimientos por producto, como "¿cuánto bajaron las ventas del Villa del Sur?".`
      : `Sos el asistente de soporte del sistema POS de Super Juampy para cajeros.

Tu función es ÚNICAMENTE ayudar con problemas técnicos y errores del sistema POS.

Podés ayudar con:
- Errores al confirmar ventas
- Problemas al buscar productos
- Cómo usar el escáner
- Cómo aplicar descuentos
- Problemas con el cierre de caja
- Cómo usar el hold/venta en espera
- Cualquier error o duda de operación del POS

NO podés responder preguntas sobre:
- Ventas totales, ingresos o facturación
- Stock o inventario
- Comparativas entre sucursales
- Reportes o métricas del negocio

Si te preguntan algo fuera de tu alcance, respondé: "Esa información es solo para supervisores. ¿Puedo ayudarte con algún problema del POS?"

Respondé siempre en español argentino, de forma simple y clara para un cajero.`;

    const history = Array.isArray(body.history) ? body.history : [];
    const conversationMessages = [
      ...history.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content),
      })),
      { role: "user" as const, content: question },
    ];

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    });

    const response =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ response });
  } catch (e: any) {
    console.error("AI error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error del asistente" },
      { status: 500 }
    );
  }
}
