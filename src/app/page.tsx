export default function Home() {
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
        <a href="/pos"       style={{ background:'#2E7D32', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Ir al POS</a>
        <a href="/inventory" style={{ background:'#3F51B5', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Inventario</a>
        <a href="/reports"   style={{ background:'#FDD835', color:'#111827', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Reportes</a>
        <a href="/login"     style={{ background:'#111827', color:'#fff', padding:'10px 14px', borderRadius:'10px', textDecoration:'none' }}>Login</a>
      </div>
    </section>
  );
}
