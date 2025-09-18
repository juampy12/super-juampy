import SalesDaily from "../../components/SalesDaily";
import SalesBySale from "../../components/SalesBySale";

export default function Page() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <SalesDaily />
      <SalesBySale />
    </div>
  );
}
