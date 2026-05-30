"use client";

import { useState, useEffect } from "react";
import { getPosEmployee } from "@/lib/posSession";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Store = { id: string; name: string };
type Register = { id: string; name: string; store_id: string };
type Employee = {
  id: string;
  code: string;
  name: string;
  role: string;
  store_id: string | null;
  register_id: string | null;
  active: boolean;
  stores?: { name: string } | null;
  registers?: { name: string } | null;
};

const ROLES = [
  { value: "cashier", label: "Cajero" },
  { value: "supervisor", label: "Supervisor" },
];

export default function EmpleadosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", pin: "", role: "cashier",
    store_id: "", register_id: "", active: true,
  });

  useEffect(() => {
    const emp = getPosEmployee();
    if (emp?.role !== "supervisor") { router.replace("/ventas"); return; }
    setReady(true);
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [empRes, storeRes, regRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/stores"),
        fetch("/api/registers"),
      ]);
      const empJson = await empRes.json();
      const storeJson = await storeRes.json();
      const regJson = await regRes.json();
      setEmployees((empJson.employees ?? []).map((e: any) => ({ ...e, active: e.is_active })));
      setStores(storeJson.stores ?? []);
      setRegisters(regJson.registers ?? []);
    } catch { toast.error("Error cargando datos"); }
    finally { setLoading(false); }
  }

  function openNew() {
    setForm({ name: "", code: "", pin: "", role: "cashier", store_id: "", register_id: "", active: true });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setForm({ name: emp.name, code: emp.code, pin: "", role: emp.role,
      store_id: emp.store_id ?? "", register_id: emp.register_id ?? "", active: emp.active });
    setEditingId(emp.id);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Falta el nombre"); return; }
    if (!form.code.trim()) { toast.error("Falta el codigo"); return; }
    if (!editingId && !form.pin.trim()) { toast.error("Falta el PIN"); return; }
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          id: editingId, name: form.name, role: form.role,
          store_id: form.store_id || null, register_id: form.register_id || null, active: form.active,
        };
        if (form.pin.trim()) body.pin = form.pin;
        const res = await fetch("/api/employees", {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { toast.error(json.error ?? "Error"); return; }
        toast.success("Empleado actualizado");
      } else {
        const res = await fetch("/api/employees", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, code: form.code, pin: form.pin,
            role: form.role, store_id: form.store_id || null, register_id: form.register_id || null }),
        });
        const json = await res.json();
        if (!res.ok) { toast.error(json.error ?? "Error"); return; }
        toast.success("Empleado creado");
      }
      setShowForm(false);
      loadAll();
    } catch { toast.error("Error inesperado"); }
  }

  async function toggleActive(emp: Employee) {
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emp.id, active: !emp.active }),
      });
      if (!res.ok) { toast.error("Error actualizando"); return; }
      toast.success(emp.active ? "Empleado desactivado" : "Empleado activado");
      loadAll();
    } catch { toast.error("Error inesperado"); }
  }

  const filteredRegisters = registers.filter(r => r.store_id === form.store_id);
  if (!ready) return null;

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <button onClick={openNew}
          className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700">
          + Nuevo empleado
        </button>
      </div>

      {showForm && (
        <div className="border rounded-2xl p-4 bg-white space-y-3 shadow-sm">
          <h2 className="font-semibold text-lg">{editingId ? "Editar empleado" : "Nuevo empleado"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-neutral-600">Nombre</label>
              <input className="border rounded-lg px-3 py-2 w-full" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-600">Codigo de ingreso</label>
              <input className="border rounded-lg px-3 py-2 w-full" value={form.code}
                disabled={!!editingId}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="ej: 201" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-600">{editingId ? "Nuevo PIN (vacio = no cambiar)" : "PIN"}</label>
              <input className="border rounded-lg px-3 py-2 w-full" type="password"
                inputMode="numeric" value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="minimo 4 digitos" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-600">Rol</label>
              <select className="border rounded-lg px-3 py-2 w-full" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, register_id: "" }))}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-neutral-600">Sucursal</label>
              <select className="border rounded-lg px-3 py-2 w-full" value={form.store_id}
                onChange={e => setForm(f => ({ ...f, store_id: e.target.value, register_id: "" }))}>
                <option value="">Sin asignar</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {form.store_id && (
              <div className="space-y-1">
                <label className="text-sm text-neutral-600">Caja asignada</label>
                <select className="border rounded-lg px-3 py-2 w-full" value={form.register_id}
                  onChange={e => setForm(f => ({ ...f, register_id: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {filteredRegisters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            {editingId && (
              <div className="flex items-center gap-2 col-span-2">
                <input type="checkbox" id="active" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="active" className="text-sm text-neutral-600">Activo</label>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSubmit}
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700">
              {editingId ? "Guardar cambios" : "Crear empleado"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500 text-sm">Cargando...</p>
      ) : (
        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Codigo</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Sucursal</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Caja</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.map(emp => (
                <tr key={emp.id} className={emp.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-medium">{emp.name}</td>
                  <td className="px-4 py-3 text-neutral-500">{emp.code}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.role === "supervisor" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>{emp.role === "supervisor" ? "Supervisor" : "Cajero"}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{(emp.stores as any)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{(emp.registers as any)?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      emp.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}>{emp.active ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(emp)}
                        className="text-xs border rounded-lg px-3 py-1 hover:bg-neutral-50">Editar</button>
                      <button onClick={() => toggleActive(emp)}
                        className={`text-xs border rounded-lg px-3 py-1 ${
                          emp.active ? "hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                                     : "hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                        }`}>{emp.active ? "Desactivar" : "Activar"}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No hay empleados cargados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
