export const dynamic = "force-dynamic";

const REST_URL = "https://lvaqdqipbaoambdvxudx.supabase.co/rest/v1";
const APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = {
  apikey: APIKEY,
  Authorization: `Bearer ${APIKEY}`,
};

type Daily = {
  date: string;
  sales_count?: number;
  units?: number;
  tickets?: number;
  total: number;
  store_id?: string | null;
};

type Sale = {
  id: string;
  created_at: string;
  total: number;
  store_id?: string | null;
};

type Store = {
  id: string;
  name: string;
};

async function getDaily(storeId?: string): Promise<Daily[]> {
  const storeFilter = storeId ? `&store_id=eq.${storeId}` : "";
  const url = `${REST_URL}/v_sales_daily?select=*&order=date.desc&limit=30${storeFilter}`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`v_sales_daily ${r.status}`);
  return r.json();
}

async function getSales(storeId?: string): Promise<Sale[]> {
  const storeFilter = storeId ? `&store_id=eq.${storeId}` : "";
  const url = `${REST_URL}/sales?select=id,created_at,total,store_id&status=eq.confirmed&order=created_at.desc&limit=100${storeFilter}`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });

  if (!r.ok) {
    console.error("sales error", r.status);
    return [];
  }

  return r.json();
}

async function getStores(): Promise<Store[]> {
  const url = `${REST_URL}/stores?select=id,name&order=name`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) {
    console.error("stores error", r.status);
    return [];
  }
  return r.json();
}

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; store_id?: string }>;
}) {
  const sp = await searchParams;
  const storeId = sp.storeId || sp.store_id;

  const [daily, sales, stores] = await Promise.all([
    getDaily(storeId),
    getSales(storeId),
    getStores(),
  ]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Reportes</h1>

      {/* Selector de sucursal */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a
          href="/reportes"
          className={`px-3 py-1 rounded border text-sm ${
            !storeId ? "bg-blue-600 text-white" : "bg-white"
          }`}
        >
          Todas las sucursales
        </a>
        {stores.map((s) => {
          const active = storeId === s.id;
          return (
            <a
              key={s.id}
              href={`/reportes?storeId=${s.id}`}
              className={`px-3 py-1 rounded border text-sm ${
                active ? "bg-blue-600 text-white" : "bg-white"
              }`}
            >
              {s.name}
            </a>
          );
        })}
      </div>

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
                <td className="text-right">{d.sales_count ?? d.tickets ?? 0}</td>
                <td className="text-right">
                  {Number(d.units ?? 0).toFixed(0)}
                </td>
                <td className="text-right">
                  {money.format(Number(d.total || 0))}
                </td>
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
              <tr key={s.id} className="border-b">
                <td className="py-2">
                  {new Date(s.created_at).toLocaleString("es-AR")}
                </td>
                <td className="text-left">{s.id}</td>
                <td className="text-right">–</td>
                <td className="text-right">
                  {money.format(Number(s.total || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
