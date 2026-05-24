import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const todayAR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
  }).format(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoAR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
  }).format(weekAgo);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [salesToday, salesWeek, salesMonth, topProducts, lowStock, stores] =
    await Promise.all([
      // Ventas de hoy
      supabase
        .from("sales")
        .select("total, store_id, created_at")
        .eq("status", "confirmed")
        .gte("created_at", `${todayAR}T00:00:00-03:00`)
        .lte("created_at", `${todayAR}T23:59:59-03:00`),

      // Ventas de la semana
      supabase
        .from("sales")
        .select("total, store_id, created_at")
        .eq("status", "confirmed")
        .gte("created_at", weekAgo.toISOString()),

      // Ventas del mes
      supabase
        .from("sales")
        .select("total, store_id")
        .eq("status", "confirmed")
        .gte("created_at", monthAgo.toISOString()),

      // Top productos de la semana
      supabase.rpc("fn_top_products_range_all", {
        p_from: weekAgoAR,
        p_to: todayAR,
        p_limit: 10,
      }),

      // Stock bajo
      supabase
        .from("product_min_stock")
        .select(`
          product_id,
          min_stock,
          store_id,
          products(name, sku),
          product_stocks(stock)
        `)
        .limit(20),

      // Sucursales
      supabase.from("stores").select("id, name"),
    ]);

  const storeMap: Record<string, string> = {};
  (stores.data ?? []).forEach((s: any) => {
    storeMap[s.id] = s.name;
  });

  const todaySales = salesToday.data ?? [];
  const weekSales = salesWeek.data ?? [];
  const monthSales = salesMonth.data ?? [];

  const totalHoy = todaySales.reduce((a, s) => a + Number(s.total), 0);
  const totalSemana = weekSales.reduce((a, s) => a + Number(s.total), 0);
  const totalMes = monthSales.reduce((a, s) => a + Number(s.total), 0);
  const ticketsHoy = todaySales.length;
  const ticketPromHoy = ticketsHoy > 0 ? totalHoy / ticketsHoy : 0;

  // Ventas por sucursal hoy
  const porSucursalHoy: Record<string, number> = {};
  todaySales.forEach((s: any) => {
    const nombre = storeMap[s.store_id] ?? s.store_id;
    porSucursalHoy[nombre] = (porSucursalHoy[nombre] ?? 0) + Number(s.total);
  });

  // Ventas por sucursal semana
  const porSucursalSemana: Record<string, number> = {};
  weekSales.forEach((s: any) => {
    const nombre = storeMap[s.store_id] ?? s.store_id;
    porSucursalSemana[nombre] =
      (porSucursalSemana[nombre] ?? 0) + Number(s.total);
  });

  return {
    fecha_hoy: todayAR,
    ventas: {
      hoy: {
        total: totalHoy,
        tickets: ticketsHoy,
        ticket_promedio: ticketPromHoy,
        por_sucursal: porSucursalHoy,
      },
      semana: {
        total: totalSemana,
        tickets: weekSales.length,
        por_sucursal: porSucursalSemana,
      },
      mes: {
        total: totalMes,
        tickets: monthSales.length,
      },
    },
    top_productos_semana: (topProducts.data ?? []).map((p: any) => ({
      nombre: p.name,
      sku: p.sku,
      unidades: Number(p.qty_sold),
      facturacion: Number(p.total_amount),
      stock: Number(p.stock),
    })),
    stock_bajo: (lowStock.data ?? []).map((p: any) => ({
      producto: (p.products as any)?.name ?? p.product_id,
      stock_actual: (p.product_stocks as any)?.stock ?? 0,
      stock_minimo: p.min_stock,
      sucursal: storeMap[p.store_id] ?? p.store_id,
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

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
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
