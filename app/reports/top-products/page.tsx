import TopProducts from "@/app/components/TopProducts";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    storeId?: string;
  };
};

const STORE_OPTIONS = [
  { id: "", label: "Todas las sucursales" },
  { id: "914dee4d-a78c-4f3f-8998-402c56fc88e9", label: "Super Juampy (Alberdi)" },
  { id: "06ca13ff-d96d-4670-84d7-41057b3f6bc7", label: "Super Juampy (Av. San Martín)" },
  { id: "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f", label: "Super Juampy (Tacuari)" },
];

export default function TopProductsPage({ searchParams }: PageProps) {
  const storeId = searchParams?.storeId ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Top de productos</h1>
          <p className="text-sm text-neutral-600">
            Filtrá por sucursal para ver los productos más vendidos.
          </p>
        </div>

        <form className="flex items-center gap-2" method="get">
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
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm"
          >
            Aplicar
          </button>
        </form>
      </div>

      <TopProducts storeId={storeId || null} />
    </div>
  );
}
