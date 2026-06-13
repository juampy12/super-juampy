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
      { href: '/marketing', label: 'Marketing', icon: 'ti-speakerphone' },
      { href: '/etiquetas', label: 'Etiquetas', icon: 'ti-tag' },
      { href: '/importar-precios', label: 'Importar precios', icon: 'ti-file-import' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    setEmp(getPosEmployee());
    setReady(true);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setMobileMenuOpen(false);
        setMobileOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cerrar menú mobile al cambiar de ruta
  useEffect(() => {
    setOpenGroup(null);
    setMobileMenuOpen(false);
    setMobileOpenGroup(null);
  }, [pathname]);

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
      {/* Barra principal */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', padding: '0 16px', gap: '2px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
          <img src='/logo-super-juampy.png' alt='Super Juampy' style={{ height: '38px', width: 'auto' }} />
        </div>

        {/* Nav items — solo desktop */}
        <div className="hidden md:flex" style={{ alignItems: 'stretch', flex: 1, gap: '1px' }}>
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
                      marginBottom: '-3px', whiteSpace: 'nowrap', cursor: 'pointer',
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
                  }}
                >
                  <i className={`ti ${link.icon}`} style={{ fontSize: '15px' }} aria-hidden='true' />
                  {link.label}
                </Link>
              );
            })
          )}
        </div>

        {/* Lado derecho: sucursal + nombre + Salir + hamburguesa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          {storeName && (
            <div style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              color: 'white', fontSize: '12px', padding: '4px 8px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
            }}>
              <i className='ti ti-building-store' style={{ fontSize: '13px' }} aria-hidden='true' />
              {storeName}
            </div>
          )}
          {empName && (
            <div style={{
              background: '#1A5FA8', color: 'white', fontSize: '12px',
              padding: '4px 8px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
              maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <i className='ti ti-user' style={{ fontSize: '13px', flexShrink: 0 }} aria-hidden='true' />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{empName}</span>
            </div>
          )}
          {emp && (
            <button onClick={logoutPos} style={{
              background: '#A8C62A', color: '#1a1a1a', fontSize: '12px',
              padding: '5px 12px', borderRadius: '6px', fontWeight: '500',
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              minHeight: '44px', minWidth: '44px',
            }}>
              Salir
            </button>
          )}

          {/* Botón hamburguesa — solo mobile */}
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: mobileMenuOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
              border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer',
              minHeight: '44px', minWidth: '44px', flexShrink: 0,
            }}
          >
            {mobileMenuOpen ? (
              /* X para cerrar */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              /* ☰ tres líneas */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

      </div>

      {/* Menú mobile desplegable */}
      {mobileMenuOpen && (
        <div
          className="md:hidden"
          style={{
            background: '#B51B1B',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            maxHeight: 'calc(100dvh - 55px)',
            overflowY: 'auto',
          }}
        >
          {isSupervisor ? (
            supervisorGroups.map((group) => {
              const active = isGroupActive(group);
              const isOpen = mobileOpenGroup === group.label;

              if (!group.children) {
                return (
                  <Link
                    key={group.href}
                    href={group.href!}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '0 20px', minHeight: '48px',
                      color: 'white', fontSize: '15px', fontWeight: active ? '500' : '400',
                      textDecoration: 'none',
                      background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                      borderLeft: active ? '4px solid #A8C62A' : '4px solid transparent',
                    }}
                  >
                    <i className={`ti ${group.icon}`} style={{ fontSize: '18px', width: '20px', textAlign: 'center' }} aria-hidden='true' />
                    {group.label}
                  </Link>
                );
              }

              return (
                <div key={group.label}>
                  <button
                    onClick={() => setMobileOpenGroup(isOpen ? null : group.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '0 20px', minHeight: '48px', width: '100%',
                      color: 'white', fontSize: '15px', fontWeight: active ? '500' : '400',
                      background: active || isOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: 'none',
                      borderLeft: active ? '4px solid #A8C62A' : '4px solid transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <i className={`ti ${group.icon}`} style={{ fontSize: '18px', width: '20px', textAlign: 'center' }} aria-hidden='true' />
                    <span style={{ flex: 1 }}>{group.label}</span>
                    <i
                      className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                      style={{ fontSize: '14px', opacity: 0.7 }}
                      aria-hidden='true'
                    />
                  </button>
                  {isOpen && (
                    <div style={{ background: 'rgba(0,0,0,0.2)' }}>
                      {group.children.map(child => {
                        const childActive = pathname === child.href || pathname?.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileMenuOpen(false)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '0 20px 0 52px', minHeight: '44px',
                              color: childActive ? 'white' : 'rgba(255,255,255,0.85)',
                              fontSize: '14px', textDecoration: 'none',
                              background: childActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                              borderLeft: childActive ? '4px solid #A8C62A' : '4px solid transparent',
                            }}
                          >
                            <i className={`ti ${child.icon}`} style={{ fontSize: '15px', width: '16px', textAlign: 'center' }} aria-hidden='true' />
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
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '0 20px', minHeight: '48px',
                    color: 'white', fontSize: '15px', fontWeight: active ? '500' : '400',
                    textDecoration: 'none',
                    background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                    borderLeft: active ? '4px solid #A8C62A' : '4px solid transparent',
                  }}
                >
                  <i className={`ti ${link.icon}`} style={{ fontSize: '18px', width: '20px', textAlign: 'center' }} aria-hidden='true' />
                  {link.label}
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Banner offline — visible en todas las páginas */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#DC2626', color: 'white', fontSize: '12px',
            padding: '5px 16px', textAlign: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
          Sin conexión — los cambios se sincronizan al reconectar
        </div>
      )}
    </nav>
  );
}
