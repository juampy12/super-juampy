import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PAGE_SIZE = 1000;

// PostgREST limita cada respuesta a 1000 filas por defecto — una query
// sin filtro acotado (ej: traer todo el catálogo) se trunca en
// silencio si la tabla supera ese tamaño. Esta función pagina con
// .range() hasta agotar los resultados. `filter` es opcional para
// poder aplicar .eq()/.gte()/etc. antes de paginar.
export async function fetchAllRows<T>(
  table: string,
  select: string,
  filter?: (qb: any) => any
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    let qb = supabaseAdmin.from(table).select(select);
    if (filter) qb = filter(qb);
    const { data, error } = await qb.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
