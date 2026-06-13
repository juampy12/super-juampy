import TopProducts from "@/app/components/TopProducts";

export const dynamic = "force-dynamic";

type SearchParams = {
  storeId?: string;
  from?: string;
  to?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const STORE_OPTIONS = [
  { id: "", label: "Todas las sucursales" },
  ...require("@/lib/stores").STORES.map((s: any) => ({ id: s.id, label: s.name })),
];

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdAR(d: Date) {
  // en-CA => YYYY-MM-DD, forzando timezone Argentina
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

export default async function TopProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const storeId = params.storeId ?? "";

  // Normalizar fechas (si vienen inválidas, las ignoramos)
  let from = isYmd(params.from ?? "") ? (params.from as string) : "";
  let to = isYmd(params.to ?? "") ? (params.to as string) : "";

  // Defaults: últimos 7 días (AR) si faltan fechas
  if (!from || !to) {
    const today = new Date();
    const toDef = ymdAR(today);
    const fromDef = ymdAR(addDays(today, -6)); // últimos 7 días contando hoy
    from = from || fromDef;
    to = to || toDef;
  }

  // Asegurar orden
  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold">Top de productos</h1>
          <p className="text-sm text-neutral-600">
            Filtrá por sucursal y rango de fechas para ver los productos más vendidos.
          </p>
        </div>

        <form className="flex flex-col sm:flex-row flex-wrap gap-2" method="get">
          {/* Sucursal */}
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm font-medium shrink-0" htmlFor="storeId">
              Sucursal
            </label>
            <select
              id="storeId"
              name="storeId"
              defaultValue={storeId}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm flex-1 min-w-0"
            >
              {STORE_OPTIONS.map((s) => (
                <option key={s.id || "all"} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Rango de fechas */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium shrink-0" htmlFor="from">
              Desde
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium shrink-0" htmlFor="to">
              Hasta
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
            />
          </div>

          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-2 text-sm self-start sm:self-auto">
            Aplicar
          </button>
        </form>
      </div>

      <TopProducts storeId={storeId || null} from={from} to={to} />
    </div>
  );
}
