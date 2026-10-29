import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function SalesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ customer_id: "", currency: "NPR", productId: "", quantity: 1, unit_price: 0 });
  const [lines, setLines] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [inv, cust, prod] = await Promise.all([
        api.get("/invoices"),
        api.get("/customers"),
        api.get("/products"),
      ]);
      setInvoices(inv.data.data);
      setCustomers(cust.data.data);
      setProducts(prod.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const addLine = () => {
    const p = products.find((x) => x.id === form.productId);
    if (!p) return;
    setLines([...lines, { product_id: p.id, description: p.name, quantity: form.quantity, unit_price: form.unit_price || 0, tax_rate: 0 }]);
  };

  const createInvoice = async () => {
    if (lines.length === 0) { setError("Add at least one line"); return; }
    try {
      await api.post("/invoices", { customer_id: form.customer_id || undefined, currency: form.currency, lines });
      setLines([]);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Create failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Sales / Invoices</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select className="border p-2 rounded" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
            <option value="">Customer (optional)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="border p-2 rounded" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            <option value="">Product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="border p-2 rounded" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          <input className="border p-2 rounded" type="number" placeholder="Unit price" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} />
        </div>
        <div className="flex gap-2">
          <button onClick={addLine} className="bg-slate-200 rounded px-4 py-2">Add line</button>
          <button onClick={createInvoice} className="bg-slate-900 text-white rounded px-4 py-2">Create invoice</button>
        </div>
        {lines.length > 0 && (
          <ul className="text-sm">
            {lines.map((l, i) => <li key={i}>{l.description} x {l.quantity} @ {l.unit_price}</li>)}
          </ul>
        )}
      </div>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Number</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Total</th>
              <th className="p-2 text-left">Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="p-2">{inv.number}</td>
                <td className="p-2">{inv.status}</td>
                <td className="p-2">{inv.total}</td>
                <td className="p-2">{inv.amount_due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
