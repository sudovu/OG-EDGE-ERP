import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AccountingPage() {
  // accounts not displayed currently
  const [periods, setPeriods] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [trialBalance, setTrialBalance] = useState<any[]>([]);
  const [pl, setPl] = useState<any>(null);
  const [newPeriod, setNewPeriod] = useState({ name: "", start_date: "", end_date: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [p, ap, tb, plr] = await Promise.all([
        api.get("/accounting/periods"),
        api.get("/approvals"),
        api.get("/reports/trial-balance"),
        api.get("/reports/profit-loss"),
      ]);
      setPeriods(p.data.data);
      setApprovals(ap.data.data);
      setTrialBalance(tb.data.data);
      setPl(plr.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  const createPeriod = async () => {
    try {
      await api.post("/accounting/periods", newPeriod);
      setNewPeriod({ name: "", start_date: "", end_date: "" });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  const closePeriod = async (id: string) => {
    try {
      await api.post(`/accounting/periods/${id}/close`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    try {
      await api.post(`/approvals/${id}/decide`, { status });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Accounting</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {pl && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow"><div className="text-sm text-slate-500">Revenue</div><div className="text-xl font-bold">{pl.revenue}</div></div>
          <div className="bg-white p-4 rounded shadow"><div className="text-sm text-slate-500">Expense</div><div className="text-xl font-bold">{pl.expense}</div></div>
          <div className="bg-white p-4 rounded shadow"><div className="text-sm text-slate-500">Net</div><div className="text-xl font-bold">{pl.net}</div></div>
        </div>
      )}
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="font-semibold mb-2">Trial Balance</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Name</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th></tr></thead>
          <tbody>
            {trialBalance.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.code}</td><td className="p-2">{a.name}</td>
                <td className="p-2 text-right">{a.total_debit}</td><td className="p-2 text-right">{a.total_credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Periods</h2>
          <div className="flex gap-2 mb-3">
            <input className="border p-2 rounded flex-1" placeholder="Name" value={newPeriod.name} onChange={(e) => setNewPeriod({ ...newPeriod, name: e.target.value })} />
            <input className="border p-2 rounded" type="date" value={newPeriod.start_date} onChange={(e) => setNewPeriod({ ...newPeriod, start_date: e.target.value })} />
            <input className="border p-2 rounded" type="date" value={newPeriod.end_date} onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })} />
            <button onClick={createPeriod} className="bg-slate-900 text-white rounded px-4">Add</button>
          </div>
          <ul className="text-sm space-y-1">
            {periods.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name} ({p.start_date} → {p.end_date}) {p.is_closed ? "🔒" : ""}</span>
                {!p.is_closed && <button onClick={() => closePeriod(p.id)} className="text-blue-600 text-xs">Close</button>}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Approvals</h2>
          <ul className="text-sm space-y-2">
            {approvals.map((a) => (
              <li key={a.id} className="border-b pb-2">
                <div>{a.entity_type} / {a.entity_id} — <b>{a.status}</b></div>
                {a.status === "pending" && (
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => decide(a.id, "approved")} className="text-green-600 text-xs">Approve</button>
                    <button onClick={() => decide(a.id, "rejected")} className="text-red-600 text-xs">Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}