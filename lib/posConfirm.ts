import { confirmarVenta } from "./sales";

export type PosRow = {
  id?: string;           // puede venir como id
  product_id?: string;   // o como product_id
  qty: number;
  price: number;
};

export async function posConfirmarVenta(storeId: string, rows: PosRow[]) {
  const cart = rows.map(r => ({
    id: (r.product_id ?? r.id)!,
    qty: Number(r.qty) || 1,
    price: Number(r.price) || 0
  }));
  return await confirmarVenta(storeId, cart);
}
