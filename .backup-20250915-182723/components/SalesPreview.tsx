"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Item = {
  id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
};

export default function SalesPreview() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,sale_id,product_id,qty,unit_price,subtotal,created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data) setItems(data as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="border rounded p-3">
      {loading ? (
        <div>Cargando…</div>
      ) : items.length === 0 ? (
        <div>Sin registros recientes.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="border rounded p-2">
              <div className="text-sm text-gray-600">{new Date(it.created_at).toLocaleString()}</div>
              <div><b>Sale:</b> {it.sale_id}</div>
              <div><b>Product:</b> {it.product_id}</div>
              <div><b>Qty:</b> {it.qty} — <b>Unit:</b> {it.unit_price} — <b>Subtotal:</b> {it.subtotal}</div>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={load}
        className="mt-3 px-3 py-1 rounded bg-black text-white"
      >
        Refrescar
      </button>
    </div>
  );
}
