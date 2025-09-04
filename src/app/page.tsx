export default function Home() {
  return (
    <div className="min-h-screen">
      <h1 className="text-3xl font-extrabold tracking-tight">Super Juampy</h1>
      <p className="mt-2 text-sm text-gray-600">
        Elegí una sección. Si no estás logueado, te pedirá iniciar sesión.
      </p>

      <div className="mt-6 grid gap-3">
        <a href="/login" className="btn-secondary">Login</a>
        <a href="/pos" className="btn-primary">Ir al POS</a>
        <a href="/inventory" className="btn-accent">Inventario</a>
        <a href="/reports" className="btn-primary">Reportes</a>
      </div>
    </div>
  );
}

