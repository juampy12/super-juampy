import { supabase } from "../utils/supabaseClient";

type CartItem = { id: string; qty: number; price: number }; // id = products.id (UUID)

export async function confirmarVenta(storeId: string, cart: CartItem[]) {
  const items = cart.map(i => ({
    product_id: i.id,
    quantity: Number(i.qty) || 1,   // la RPC acepta quantity o qty
    unit_price: Number(i.price) || 0
  }));

  const { data: saleId, error } = await supabase.rpc("create_sale", {
    p_store: storeId,   // stores.id (UUID válido)
    p_items: items
  });

  if (error) throw error;
  return saleId as string;
}
