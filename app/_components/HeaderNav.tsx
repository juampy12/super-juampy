'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Package, ShoppingCart } from 'lucide-react'

const links = [
  { href: '/', label: 'POS', icon: ShoppingCart },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/reports/top-products', label: 'Top productos', icon: BarChart3 },
]

export default function HeaderNav(){
  const pathname = usePathname()
  return (
    <nav className="navbar border-b border-black/10">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-5">
        <img loading="lazy" src="/logo-super-juampy.png" alt="Super Juampy" className="h-8 w-auto rounded" />
        <div className="flex gap-1 flex-wrap">
          {links.map(({href,label,icon:Icon})=>{
            const active = pathname===href || (href!=='/' && pathname?.startsWith(href))
            return (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2
                  ${active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'}`}>
                <Icon size={16} /> {label}
              </Link>
            )
          })}
        </div>
      </div>
      <a href="/ventas" className="ml-4">POS</a>
</nav>
  )
}








