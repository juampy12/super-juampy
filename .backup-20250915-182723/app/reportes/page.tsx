export const dynamic = "force-dynamic";

const REST_URL = "https://lvaqdqipbaoambdvxudx.supabase.co/rest/v1";
const APIKEY   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS  = {
  apikey: APIKEY,
  Authorization: `Bearer ${APIKEY}`,
};

type Daily = { date: string; sales_count: number; units: number; total: number };
type Sale  = { created_at_local: string; sale_id: string; items: number; total: number };

async function getDaily(): Promise<Daily[]> {
  const url = `${REST_URL}/v_sales_daily?select=*&order=date.desc&limit=30`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`v_sales_daily ${r.status}`);
  return r.json();
}

async function getSales(): Promise<Sale[]> {
  const url = `${REST_URL}/v_sales?select=*&order=created_at_local.desc&limit=100`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`v_sales ${r.status}`);
  return r.json();
}

const money = new Intl.NumberFormat("es-AR", { style:"currency", currency:"ARS", maximumFractionDigits: 2 });

export default async function ReportesPage() {
  const [daily, sales] = await Promise.all([getDaily(), getSales()]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Reportes</h1>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-3">Totales diarios</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Fecha</th>
              <th className="text-right">Ventas</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-b">
                <td className="py-2">{d.date}</td>
                <td className="text-right">{d.sales_count}</td>
                <td className="text-right">{d.units.toFixed(0)}</td>
                <td className="text-right">{money.format(Number(d.total||0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-semibold mb-3">Totales por venta</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Fecha (Córdoba)</th>
              <th className="text-left">Venta</th>
              <th className="text-right">Items</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.sale_id} className="border-b">
                <td className="py-2">{new Date(s.created_at_local).toLocaleString("es-AR")}</td>
                <td className="text-left">{s.sale_id}</td>
                <td className="text-right">{Number(s.items||0).toFixed(0)}</td>
                <td className="text-right">{money.format(Number(s.total||0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

