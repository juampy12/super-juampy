'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import TopProducts from './components/TopProducts';
import { posConfirmarVenta } from '@/lib/posConfirm';
import toast from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PageClient() {
  useEffect(() => {
    // (async () => {
    //   const { data, error } = await supabase.from('stores').select('id,name');
    // })();
  }, []);

  const handleConfirmar = async () => {
    try {
      await posConfirmarVenta();
      toast.success('Venta confirmada');
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Error al confirmar';
      toast.error(msg);
    }
  };

  return (
    <main className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inicio</h1>
        <button
          onClick={handleConfirmar}
          className="rounded-lg px-4 py-2 bg-black text-white"
        >
          Confirmar venta
        </button>
      </div>
      <TopProducts />
    </main>
  );
}

