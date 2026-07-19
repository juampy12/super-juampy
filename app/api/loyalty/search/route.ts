import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comas y paréntesis son sintaxis del mini-lenguaje de .or() en PostgREST:
// se descartan del término de búsqueda para no romper el filtro.
const stripOrSyntax = (s: string) => s.replace(/[,()]/g, "").trim();

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  if (!checkRateLimit(`loyalty_search:${session.employee_id}`, 60)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Esperá un momento." },
      { status: 429 }
    );
  }

  const url = new URL(req.url);
  const q = stripOrSyntax(url.searchParams.get("q") ?? "");
  if (q.length < 3) return NextResponse.json({ customers: [] });

  // El teléfono se guarda solo con dígitos; si el cajero escribe con guiones
  // o espacios, buscamos también por la versión normalizada.
  const qDigits = q.replace(/\D/g, "");

  const orParts = [
    `phone.ilike.%${q}%`,
    `dni.ilike.%${q}%`,
    `first_name.ilike.%${q}%`,
    `last_name.ilike.%${q}%`,
  ];
  if (qDigits.length >= 3 && qDigits !== q) {
    orParts.push(`phone.ilike.%${qDigits}%`, `dni.ilike.%${qDigits}%`);
  }

  const { data, error } = await supabaseAdmin
    .from("loyalty_customers")
    .select("id, first_name, last_name, phone, dni, category, points_available")
    .eq("active", true)
    .or(orParts.join(","))
    .limit(8);

  if (error) {
    console.error("Error en /api/loyalty/search:", error);
    return NextResponse.json({ error: "Error al buscar clientes" }, { status: 500 });
  }

  const customers = (data ?? []).map((c) => ({
    id: c.id,
    full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    phone: c.phone,
    dni: c.dni,
    category: c.category,
    points_available: c.points_available,
  }));

  return NextResponse.json({ customers });
}
