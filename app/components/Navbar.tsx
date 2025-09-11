'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const initial = (saved as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  }

  const linkCls = "px-3 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition";
  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="Super Juampy" className="h-8 w-8" />
            <span className="font-extrabold text-neutral-900 dark:text-white">Super Juampy</span>
          </Link>
          <div className="hidden sm:flex items-center gap-1 ml-4">
            <Link href="/products" className={linkCls}>Productos</Link>
            <Link href="/reports" className={linkCls}>Reportes</Link>
            <Link href="/reports/top-products" className={linkCls}>Top</Link>
          </div>
        </div>
        <button onClick={toggleTheme}
          className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[.98] transition">
          {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
        </button>
      </nav>
    </header>
  );
}
