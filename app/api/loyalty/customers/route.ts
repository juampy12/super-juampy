import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripOrSyntax = (s: string) => s.replace(/[,()]/g, "").trim();

function toPublicCustomer(c: {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  dni: string | null;
  category: string;
  points_available: number;
}) {
  return {
    id: c.id,
    full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    phone: c.phone,
    dni: c.dni,
    category: c.category,
    points_available: c.points_available,
  };
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));

  const first_name = String(body.first_name ?? "").trim();
  const last_name = body.last_name ? String(body.last_name).trim() : null;
  const dni = body.dni ? stripOrSyntax(String(body.dni)) : null;
  const birth_date = body.birth_date ? String(body.birth_date).trim() : null;
  const phone = String(body.phone ?? "").replace(/\D/g, "");

  if (!first_name) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  if (phone.length < 10) {
    return NextResponse.json(
      { error: "El teléfono debe tener al menos 10 dígitos" },
      { status: 400 }
    );
  }

  const dupOrParts = [`phone.eq.${phone}`];
  if (dni) dupOrParts.push(`dni.eq.${dni}`);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("loyalty_customers")
    .select("id, first_name, last_name, phone, dni, category, points_available")
    .or(dupOrParts.join(","))
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    console.error("Error chequeando cliente existente:", existingErr);
    return NextResponse.json({ error: "Error al crear el cliente" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      {
        error: "Ya existe un cliente con ese teléfono o DNI",
        customer: toPublicCustomer(existing),
      },
      { status: 409 }
    );
  }

  const { data: created, error: createErr } = await supabaseAdmin
    .from("loyalty_customers")
    .insert({ first_name, last_name, dni, birth_date, phone })
    .select("id, first_name, last_name, phone, dni, category, points_available")
    .single();

  if (createErr) {
    console.error("Error creando cliente de fidelización:", createErr);
    return NextResponse.json({ error: "Error al crear el cliente" }, { status: 500 });
  }

  return NextResponse.json({ customer: toPublicCustomer(created) }, { status: 201 });
}
