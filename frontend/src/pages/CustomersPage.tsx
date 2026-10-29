import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/customers");
      setCustomers(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/customers", form);
      setForm({ name: "", email: "", phone: "", city: "" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Create failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Customers</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <form onSubmit={create} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-2 md:grid-cols-5 gap-2">
        <input className="border p-2 rounded" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="border p-2 rounded" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <button className="bg-slate-900 text-white rounded px-4">Add</button>
      </form>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">City</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.email}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">{c.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}