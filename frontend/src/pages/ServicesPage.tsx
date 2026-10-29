import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function ServicesPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", customer_id: "", priority: "normal", currency: "NPR", estimated_cost: 0 });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [sr, cust] = await Promise.all([api.get("/service-requests"), api.get("/customers")]);
      setRequests(sr.data.data);
      setCustomers(cust.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/service-requests", form);
      setForm({ title: "", customer_id: "", priority: "normal", currency: "NPR", estimated_cost: 0 });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Create failed");
    }
  };

  const bill = async (id: string) => {
    try {
      await api.post(`/service-requests/${id}/bill`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Bill failed");
    }
  };

  const advance = async (id: string, status: string) => {
    try {
      await api.patch(`/service-requests/${id}`, { status });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Update failed");
    }
  };

  const statuses = ["received", "diagnosed", "approved", "in_progress", "completed", "delivered"];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Services / Repairs</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <form onSubmit={create} className="bg-white p-4 rounded shadow mb-6 grid grid-cols-2 md:grid-cols-5 gap-2">
        <input className="border p-2 rounded" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <select className="border p-2 rounded" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
          <option value="">Customer (optional)</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input className="border p-2 rounded" type="number" placeholder="Est. cost" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: Number(e.target.value) })} />
        <button className="bg-slate-900 text-white rounded px-4">Create</button>
      </form>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Number</th>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Priority</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.number}</td>
                <td className="p-2">{r.title}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.priority}</td>
                <td className="p-2">
                  <select className="border p-1 rounded" value={r.status} onChange={(e) => advance(r.id, e.target.value)}>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => bill(r.id)} className="ml-2 text-blue-600 text-xs">Bill</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
