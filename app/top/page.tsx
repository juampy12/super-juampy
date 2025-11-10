import { redirect } from 'next/navigation';

export default function TopRedirect() {
  // Redirige a la página real de Top Productos
  redirect('/reports/top-products');
  return null; // (satisface el tipo de retorno)
}
