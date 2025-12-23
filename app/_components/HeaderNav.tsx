'use client';

import { useEffect, useState } from "react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPosEmployee, logoutPos } from "@/lib/posSession";
import {
  Home,
  ShoppingCart,
  Package,
  BarChart3,
  Wallet,
 AlertTriangle,
} from 'lucide-react';

const navLinks = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/ventas', label: 'POS', icon: ShoppingCart },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/cierres', label: 'Cierre de caja', icon: Wallet },
  { href: '/cierres/historial', label: 'Historial cierres', icon: Wallet },
  { href: '/reports/top-products', label: 'Top productos', icon: BarChart3 },
  { href: '/stock-bajo', label: 'Stock bajo', icon: AlertTriangle },
{ href: "/minimos", label: "Mínimos", icon: AlertTriangle },
];

const employeeAllowed = new Set([
  "/ventas",
  "/cierres",
  "/cierres/historial",
  "/stock-bajo",
]);

export default function HeaderNav() {
  const pathname = usePathname();

const [emp, setEmp] = useState<ReturnType<typeof getPosEmployee>>(null);
const [ready, setReady] = useState(false);

useEffect(() => {
  setEmp(getPosEmployee());
  setReady(true);
}, []);

if (!ready) return null;

const role = emp?.role ?? "";
const isSupervisor = role === "supervisor";

  return (
    <nav className="navbar border-b border-black/10">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-5">
        <img
          loading="lazy"
          src="/logo-super-juampy.png"
          alt="Super Juampy"
          className="h-8 w-auto rounded"
        />
        <div className="flex gap-1 flex-wrap">
{navLinks
  .filter(({ href }) => isSupervisor || employeeAllowed.has(href))
  .map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== '/' && pathname?.startsWith(href));

            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                  active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </div>
{emp && (
  <button
    onClick={logoutPos}
    className="ml-auto px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
  >
    Salir
  </button>
)}

      </div>
    </nav>
  );
}








