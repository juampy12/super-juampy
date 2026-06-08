'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPosEmployee, logoutPos } from '@/lib/posSession';

type NavGroup = {
  label: string;
  icon: string;
  href?: string;
  children?: { href: string; label: string; icon: string }[];
};

const supervisorGroups: NavGroup[] = [
  { label: 'POS', icon: 'ti-shopping-cart', href: '/ventas' },
  { label: 'Precios', icon: 'ti-tag', href: '/products' },
  {
    label: 'Inventario', icon: 'ti-package',
    children: [
      { href: '/stock', label: 'Stock', icon: 'ti-adjustments' },
      { href: '/catalogo', label: 'Catálogo', icon: 'ti-stack' },
      { href: '/ofertas', label: 'Ofertas', icon: 'ti-rosette-discount' },
      { href: '/stock-bajo', label: 'Stock bajo', icon: 'ti-alert-triangle' },
      { href: '/minimos', label: 'Mínimos', icon: 'ti-list-check' },
    ],
  },
  {
    label: 'Reportes', icon: 'ti-chart-bar',
    children: [
      { href: '/reports', label: 'Resumen', icon: 'ti-chart-pie' },
      { href: '/reports/top-products', label: 'Top productos', icon: 'ti-trophy' },
      { href: '/ventas/historial', label: 'Historial ventas', icon: 'ti-receipt' },
      { href: '/cierres', label: 'Cierre de caja', icon: 'ti-calculator' },
      { href: '/cierres/historial', label: 'Historial cierres', icon: 'ti-history' },
    ],
  },
  {
    label: 'Inteligencia', icon: 'ti-brain',
    children: [
      { href: '/inteligencia/control', label: 'Panel IA', icon: 'ti-cpu' },
      { href: '/inteligencia/margen', label: 'IA Margen', icon: 'ti-trending-up' },
      { href: '/inteligencia/diferencias', label: 'Diferencias caja', icon: 'ti-scale' },
      { href: '/inteligencia/asistente', label: 'Asistente', icon: 'ti-message-circle' },
    ],
  },
  {
    label: 'Gestión', icon: 'ti-settings',
    children: [
      { href: '/empleados', label: 'Empleados', icon: 'ti-users' },
    ],
  },
];

const cashierLinks = [
  { href: '/ventas', label: 'POS', icon: 'ti-shopping-cart' },
  { href: '/cierres', label: 'Cierre de caja', icon: 'ti-calculator' },
];

export default function HeaderNav() {
  const pathname = usePathname();
  const [emp, setEmp] = useState<ReturnType<typeof getPosEmployee>>(null);
  const [ready, setReady] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setEmp(getPosEmployee());
    setReady(true);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!ready) return null;
  if (pathname === '/pos-login') return null;

  const isSupervisor = emp?.role === 'supervisor';
  const empName = emp?.name ?? '';

  const storeLabels: Record<string, string> = {
    '914dee4d-a78c-4f3f-8998-402c56fc88e9': 'Alberdi',
    '06ca13ff-d96d-4670-84d7-41057b3f6bc7': 'San Martín',
    'fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f': 'Tacuarí',
  };
  const storeName = emp?.store_id ? (storeLabels[emp.store_id] ?? 'Sucursal') : '';

  function isGroupActive(group: NavGroup): boolean {
    if (group.href) return pathname === group.href || (group.href !== '/' && pathname?.startsWith(group.href));
    return group.children?.some(c => pathname === c.href || pathname?.startsWith(c.href)) ?? false;
  }

  return (
    <nav ref={navRef} style={{ background: '#CC2020', borderBottom: '3px solid #1A5FA8', position: 'sticky', top: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', padding: '0 16px', gap: '2px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
          <img src='/logo-super-juampy.png' alt='Super Juampy' style={{ height: '38px', width: 'auto' }} />
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, gap: '1px' }}>
          {isSupervisor ? (
            supervisorGroups.map((group) => {
              const active = isGroupActive(group);
              const isOpen = openGroup === group.label;

              if (!group.children) {
                return (
                  <Link key={group.href} href={group.href!}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '0 12px', color: active ? 'white' : 'rgba(255,255,255,0.88)',
                      fontSize: '13px', fontWeight: active ? '500' : '400',
                      textDecoration: 'none', borderBottom: active ? '3px solid #A8C62A' : '3px solid transparent',
                      marginBottom: '-3px', whiteSpace: 'nowrap',
                      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                      minHeight: 'unset',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = active ? 'rgba(255,255,255,0.1)' : 'transparent')}
                  >
                    <i className={`ti ${group.icon}`} style={{ fontSize: '15px' }} aria-hidden='true' />
                    {group.label}
                  </Link>
                );
              }

              return (
                <div key={group.label} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : group.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '0 12px', color: active || isOpen ? 'white' : 'rgba(255,255,255,0.88)',
                      fontSize: '13px', fontWeight: active ? '500' : '400',
                      background: active || isOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: 'none', borderBottom: active ? '3px solid #A8C62A' : '3px solid transparent',
                      marginBottom: '-3px', whiteSpace: 'nowrap', cursor: 'pointer', minHeight: 'unset',
                    }}
                  >
                    <i className={`ti ${group.icon}`} style={{ fontSize: '15px' }} aria-hidden='true' />
                    {group.label}
                    <i className='ti ti-chevron-down' style={{ fontSize: '11px', opacity: 0.7, marginLeft: '2px' }} aria-hidden='true' />
                  </button>
                  {isOpen && (
                    <div style={{
                      position: 'absolute', top: '52px', left: 0,
                      background: '#1A5FA8', borderRadius: '0 0 8px 8px',
                      minWidth: '180px', zIndex: 100,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    }}>
                      {group.children.map(child => {
                        const childActive = pathname === child.href || pathname?.startsWith(child.href);
                        return (
                          <Link key={child.href} href={child.href}
                            onClick={() => setOpenGroup(null)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '10px 14px', color: 'white',
                              fontSize: '13px', textDecoration: 'none',
                              background: childActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                              borderLeft: childActive ? '3px solid #A8C62A' : '3px solid transparent',
                              minHeight: 'unset',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                            onMouseLeave={e => (e.currentTarget.style.background = childActive ? 'rgba(255,255,255,0.15)' : 'transparent')}
                          >
                            <i className={`ti ${child.icon}`} style={{ fontSize: '14px' }} aria-hidden='true' />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            cashierLinks.map(link => {
              const active = pathname === link.href || pathname?.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '0 12px', color: active ? 'white' : 'rgba(255,255,255,0.88)',
                    fontSize: '13px', fontWeight: active ? '500' : '400',
                    textDecoration: 'none', borderBottom: active ? '3px solid #A8C62A' : '3px solid transparent',
                    marginBottom: '-3px', whiteSpace: 'nowrap',
                    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    minHeight: 'unset',
                  }}
                >
                  <i className={`ti ${link.icon}`} style={{ fontSize: '15px' }} aria-hidden='true' />
                  {link.label}
                </Link>
              );
            })
          )}
        </div>

        {/* Right side: info + salir */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {storeName && (
            <div style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              color: 'white', fontSize: '12px', padding: '4px 10px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
            }}>
              <i className='ti ti-building-store' style={{ fontSize: '13px' }} aria-hidden='true' />
              {storeName}
            </div>
          )}
          {empName && (
            <div style={{
              background: '#1A5FA8', color: 'white', fontSize: '12px',
              padding: '4px 10px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
            }}>
              <i className='ti ti-user' style={{ fontSize: '13px' }} aria-hidden='true' />
              {empName}
            </div>
          )}
          {emp && (
            <button onClick={logoutPos} style={{
              background: '#A8C62A', color: '#1a1a1a', fontSize: '12px',
              padding: '5px 14px', borderRadius: '6px', fontWeight: '500',
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'unset',
            }}>
              Salir
            </button>
          )}
        </div>

      </div>
    </nav>
  );
}
