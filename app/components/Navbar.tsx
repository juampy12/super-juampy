'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [theme, setTheme] = useState<'light'|'dark'>('light');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = (saved === 'dark' || saved === 'light') ? (saved as 'light'|'dark') : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initial);
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  }

  return (
    <header className="site-header">
      <nav className="nav">
        <div className="brand">
          <Link href="/" className="brand-link">
            <img src="/logo.svg" alt="Super Juampy" className="brand-logo" />
            <span className="brand-name">Super Juampy</span>
          </Link>
          <div className="nav-links">
            <Link href="/products" className="nav-link">Productos</Link>
            <Link href="/reports" className="nav-link">Reportes</Link>
            <Link href="/top" className="nav-link">Top</Link>
          </div>
        </div>
        <button type="button" onClick={toggleTheme} className="theme-btn">
          {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
        </button>
        <a href="/ventas" className="ml-4">POS</a>
</nav>
    </header>
  );
}







