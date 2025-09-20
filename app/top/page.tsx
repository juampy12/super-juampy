'use client';

import React from 'react';
import TopProducts from '../components/TopProducts'; // <- relativo a app/top/page.tsx

export default function TopPage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Top productos</h1>
      <TopProducts />
    </main>
  );
}
