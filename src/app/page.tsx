'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const [checking, setChecking] = useState(true)
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setLogged(!!data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLogged(!!session)
    })
    return () => {
      mounted = false
      sub.subscription?.unsubscribe()
    }
  }, [])

  if (checking) {
    return (
      <section>
        <p style={{ color:'#6b7280' }}>Cargando…</p>
      </section>
    )
  }

  return (
    <section>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
        <img src="/super-juampy-logo.png" alt="Super Juampy" width={48} height={48} />
        <h1 style={{ margin:0, fontSize:'28px' }}>Super Juampy</h1>
      </div>

      <p style={{ color:'#4b5563', fontSize:'14px' }}>
        Elegí una sección. Si no estás logueado, te pedirá iniciar sesión.
      </p>

      <div style={{ display:'grid', gap:'10px', marginTop:'14px' }}>
        {logged ? (
          <>
            <a href="/pos"       style={{ background:'#2E7D32', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Ir al POS</a>
            <a href="/inventory" style={{ background:'#3F51B5', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Inventario</a>
            <a href="/reports"   style={{ background:'#FDD835', color:'#111827', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Reportes</a>
          </>
        ) : (
          <a href="/login"     style={{ background:'#111827', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Login</a>
        )}
      </div>
    </section>
  )
}
