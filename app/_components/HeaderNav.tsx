'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPosEmployee, logoutPos } from '@/lib/posSession';
import { useIsMobile } from '@/lib/useIsMobile';

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
      { href: '/cierres/historial', label: 'Historial cierres', icon: 'ti-history' },
      { href: '/reports/auditoria', label: 'Auditoría operaciones', icon: 'ti-history' },
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

// SVG paths for the mobile menu — avoids CDN dependency when offline
const MOBILE_ICON_PATHS: Record<string, string> = {
  'ti-shopping-cart': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17h-11v-14h-2"/><path d="M6 5l14 1l-1 7h-13"/>',
  'ti-tag': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M11 3l9 9a1.5 1.5 0 0 1 0 2l-6 6a1.5 1.5 0 0 1 -2 0l-9 -9v-6a3 3 0 0 1 3 -3h5z"/><circle cx="9" cy="9" r="1" fill="currentColor"/>',
  'ti-package': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5"/><path d="M12 12l8 -4.5"/><path d="M12 12l0 9"/><path d="M12 12l-8 -4.5"/><path d="M16 5.25l-8 4.5"/>',
  'ti-chart-bar': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M9 8m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v9a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M15 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v13a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 20l14 0"/>',
  'ti-brain': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/>',
  'ti-settings': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
  'ti-adjustments': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M6 4v4"/><path d="M6 12v8"/><path d="M10 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M12 4v10"/><path d="M12 18v2"/><path d="M16 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M18 4v1"/><path d="M18 9v11"/>',
  'ti-stack': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 6l-8 4l8 4l8 -4l-8 -4"/><path d="M4 14l8 4l8 -4"/><path d="M4 18l8 4l8 -4"/>',
  'ti-rosette-discount': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 15l6 -6"/><circle cx="9.5" cy="9.5" r=".5" fill="currentColor"/><circle cx="14.5" cy="14.5" r=".5" fill="currentColor"/><path d="M5 7.2a2.2 2.2 0 0 1 2.2 -2.2h1a2.2 2.2 0 0 0 1.55 -.64l.7 -.7a2.2 2.2 0 0 1 3.12 0l.7 .7a2.2 2.2 0 0 0 1.55 .64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58 .23 1.138 .64 1.55l.7 .7a2.2 2.2 0 0 1 0 3.12l-.7 .7a2.2 2.2 0 0 0 -.64 1.55v1a2.2 2.2 0 0 1 -2.2 2.2h-1a2.2 2.2 0 0 0 -1.55 .64l-.7 .7a2.2 2.2 0 0 1 -3.12 0l-.7 -.7a2.2 2.2 0 0 0 -1.55 -.64h-1a2.2 2.2 0 0 1 -2.2 -2.2v-1a2.2 2.2 0 0 0 -.64 -1.55l-.7 -.7a2.2 2.2 0 0 1 0 -3.12l.7 -.7a2.2 2.2 0 0 0 .64 -1.55v-1"/>',
  'ti-alert-triangle': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
  'ti-list-check': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3.5 5.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 11.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 17.5l1.5 1.5l2.5 -2.5"/><path d="M11 6l9 0"/><path d="M11 12l9 0"/><path d="M11 18l9 0"/>',
  'ti-chart-pie': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8"/><path d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5"/>',
  'ti-trophy': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 21l8 0"/><path d="M12 17l0 4"/><path d="M7 4l10 0"/><path d="M17 4v8a5 5 0 0 1 -10 0v-8"/><path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>',
  'ti-receipt': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"/><path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5m2 0v1.5m0 -9v1.5"/>',
  'ti-calculator': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 3m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M8 7m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z"/><path d="M8 14l0 .01"/><path d="M12 14l0 .01"/><path d="M16 14l0 .01"/><path d="M8 17l0 .01"/><path d="M12 17l0 .01"/><path d="M16 17l0 .01"/>',
  'ti-history': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 8l0 4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>',
  'ti-cpu': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 5m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z"/><path d="M9 9h6v6h-6z"/><path d="M3 10h2"/><path d="M3 14h2"/><path d="M10 3v2"/><path d="M14 3v2"/><path d="M21 10h-2"/><path d="M21 14h-2"/><path d="M10 21v-2"/><path d="M14 21v-2"/>',
  'ti-trending-up': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 17l4 -4l4 4l4 -6l4 4"/><path d="M14 7l3 0l0 3"/>',
  'ti-scale': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 20l10 0"/><path d="M12 4l0 16"/><path d="M3 7l4.5 10"/><path d="M20.5 7l-4.5 10"/><path d="M3 7q2.25 -3.5 4.5 0q2.25 3.5 4.5 0"/><path d="M11.5 7q2.25 -3.5 4.5 0q2.25 3.5 4.5 0"/>',
  'ti-message-circle': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20l-3 -3h-2a3 3 0 0 1 -3 -3v-6a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v6a3 3 0 0 1 -3 3h-2l-3 3"/>',
  'ti-users': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
  'ti-speakerphone': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/><path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/>',
  'ti-file-import': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5"/><path d="M2 19h7"/><path d="M5 16l-3 3l3 3"/>',
  'ti-chevron-down': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6"/>',
  'ti-chevron-up': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6"/>',
};

function MobileIcon({ name, size = 18 }: { name: string; size?: number }) {
  const inner = MOBILE_ICON_PATHS[name];
  if (!inner) return null;
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export default function HeaderNav() {
  const pathname = usePathname();
  const [emp, setEmp] = useState<ReturnType<typeof getPosEmployee>>(null);
  const [ready, setReady] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const navRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();

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

  // En el celular, el supervisor no vende — el POS le molesta, sacarlo del
  // menú mobile. En desktop y para el cajero (mobile o desktop) no cambia nada.
  const mobileSupervisorGroups = isSupervisor && isMobile
    ? supervisorGroups.filter(g => g.href !== '/ventas')
    : supervisorGroups;

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
      <style jsx global>{`
        @media (max-width: 767px) {
          .sj-mobile-nav-bar { height: 48px !important; padding: 0 10px !important; }
          .sj-mobile-logo { margin-right: 6px !important; }
          .sj-mobile-logo img { height: 34px !important; }
          .sj-mobile-hide { display: none !important; }
        }
      `}</style>
      {/* Barra principal */}
      <div className="sj-mobile-nav-bar" style={{ display: 'flex', alignItems: 'stretch', height: '52px', padding: '0 16px', gap: '2px' }}>

        {/* Logo */}
        <div className="sj-mobile-logo" style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
          <img src='/logo-super-juampy-header.png' alt='Super Juampy' style={{ height: '38px', width: 'auto' }} />
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
            <div className="sj-mobile-hide" style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              color: 'white', fontSize: '12px', padding: '4px 8px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
            }}>
              <i className='ti ti-building-store' style={{ fontSize: '13px' }} aria-hidden='true' />
              {storeName}
            </div>
          )}
          {empName && (
            <div className="sj-mobile-hide" style={{
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
            <button className="sj-mobile-hide" onClick={logoutPos} style={{
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
            mobileSupervisorGroups.map((group) => {
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
                    <MobileIcon name={group.icon} />
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
                    <MobileIcon name={group.icon} />
                    <span style={{ flex: 1 }}>{group.label}</span>
                    <MobileIcon name={isOpen ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} />
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
                            <MobileIcon name={child.icon} size={15} />
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
                  <MobileIcon name={link.icon} />
                  {link.label}
                </Link>
              );
            })
          )}
        {emp && (
          <div className="md:hidden" style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {storeName && (
                <span style={{ flex: 1, borderRadius: '10px', background: 'rgba(255,255,255,0.12)', color: 'white', padding: '8px 10px', fontSize: '13px' }}>
                  {storeName}
                </span>
              )}
              {empName && (
                <span style={{ flex: 1, borderRadius: '10px', background: '#1A5FA8', color: 'white', padding: '8px 10px', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {empName}
                </span>
              )}
            </div>
            <button
              onClick={logoutPos}
              style={{
                width: '100%', minHeight: '44px', border: 'none', borderRadius: '12px',
                background: '#A8C62A', color: '#1a1a1a', fontSize: '14px', fontWeight: 700,
              }}
            >
              Salir
            </button>
          </div>
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
