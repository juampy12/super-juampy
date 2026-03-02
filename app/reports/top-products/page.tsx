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
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", label: "Super Juampy (Alberdi)" },
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", label: "Super Juampy (Av. San Martín)" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", label: "Super Juampy (Tacuari)" },
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Top de productos</h1>
          <p className="text-sm text-neutral-600">
            Filtrá por sucursal y rango de fechas para ver los productos más vendidos.
          </p>
        </div>

        <form className="flex flex-wrap items-center gap-3" method="get">
          {/* Sucursal */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" htmlFor="storeId">
              Sucursal
            </label>
            <select
              id="storeId"
              name="storeId"
              defaultValue={storeId}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
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
            <label className="text-sm font-medium" htmlFor="from">
              Desde
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" htmlFor="to">
              Hasta
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
            />
          </div>

          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 text-sm">
            Aplicar
          </button>
        </form>
      </div>

      <TopProducts storeId={storeId || null} from={from} to={to} />
    </div>
  );
}
