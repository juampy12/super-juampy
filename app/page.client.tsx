'use client';

import React from 'react';
import { posConfirmarVenta } from '@/lib/posConfirm';
import toast from 'react-hot-toast';

export default function PageClient() {
  const handleConfirmar = async () => {
    try {
      await posConfirmarVenta();
      toast.success('Venta confirmada');
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al confirmar');
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

      <p className="text-muted-foreground">
        Super Juampy es tu supermercado en Charata, Chaco: panificados frescos, fiambrería y productos de almacén.
        Consultá stock por sucursal y registrá ventas con nuestro POS.
      </p>
    </main>
  );
}
