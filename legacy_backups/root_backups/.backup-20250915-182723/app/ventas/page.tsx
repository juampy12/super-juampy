import ConfirmSaleButton from "../../components/ConfirmSaleButton";
import SalesPreview from "../../components/SalesPreview";

export default function Page() {
  const saleId = "0f6f82dc-765b-40f4-b7af-31e0ea07a588";
  const productId = "2602b049-f549-41a1-8222-aa87b7a09c7b";

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Super Juampy — Confirmar Venta</h1>

      <ConfirmSaleButton
        saleId={saleId}
        productId={productId}
        defaultQty={2}
      />

      <h2 className="text-xl font-semibold mt-8">Últimos ítems insertados</h2>
      <SalesPreview />
    </div>
  );
}

