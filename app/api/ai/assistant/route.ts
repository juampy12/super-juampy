import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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

  const [
    salesToday, salesYesterday, salesWeek, salesMonth,
    salesPrevMonth, topWeek, topMonth, lowStock,
    stores, allProducts, closures
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
    supabase.from("products").select("id, name, price, cost_net, markup_rate, active").eq("active", true).limit(200),
    supabase.from("cash_closures").select("store_id, date, total_sales, total_cash, total_tickets").order("date", { ascending: false }).limit(10),
  ]);

  const storeMap: Record<string, string> = {};
  (stores.data ?? []).forEach((s: any) => { storeMap[s.id] = s.name; });

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
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? "").trim();
    const role = String(body.role ?? "cashier").trim();
    if (!question) {
      return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });
    }

    const isSupervisor = role === "supervisor";
    const data = isSupervisor ? await getBusinessData() : null;

    const systemPrompt = isSupervisor
      ? `Sos el asistente de inteligencia artificial del sistema POS de Super Juampy, una cadena de supermercados en Charata, Chaco, Argentina.

Tenés acceso a los datos actualizados del negocio. Respondé siempre en español argentino, de forma clara, concisa y útil para el gerente del supermercado.

Datos actuales del negocio:
${JSON.stringify(data, null, 2)}

Reglas:
- Usá pesos argentinos (ARS) con formato $X.XXX,XX
- Respondé de forma directa y útil
- Si no tenés datos para responder algo, decilo claramente
- Podés hacer análisis, comparaciones y sugerencias basadas en los datos
- Fecha actual: ${data!.fecha_hoy}
- Las sucursales son: ${data!.sucursales.join(", ")}`
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

    const encoder = new TextEncoder();
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    stream.on("text", (text) => {
      writer.write(encoder.encode(text)).catch(() => {});
    });
    stream.once("finalMessage", () => {
      writer.close().catch(() => {});
    });
    stream.once("error", (err: any) => {
      console.error("AI stream error:", err);
      writer.write(encoder.encode(`\n\n⚠️ Error: ${err?.message ?? "Error del asistente"}`))
        .catch(() => {})
        .finally(() => writer.close().catch(() => {}));
    });
    stream.once("abort", () => {
      writer.close().catch(() => {});
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: any) {
    console.error("AI error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error del asistente" },
      { status: 500 }
    );
  }
}
