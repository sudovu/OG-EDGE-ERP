import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function LedgerPage() {
  const [from, setFrom] = useState("1970-01-01");
  const [to, setTo] = useState("2999-12-31");
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/reports/ledger", { params: { from, to } });
      setRows(r.data.data);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Ledger Book</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <input className="border p-2 rounded" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="border p-2 rounded" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button onClick={load} className="bg-slate-900 text-white rounded px-4 py-2">Load</button>
      </div>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Journal</th>
              <th className="p-2 text-left">Account</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-right">Debit</th>
              <th className="p-2 text-right">Credit</th>
              <th className="p-2 text-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((e) =>
              e.lines.map((l: any, i: number) => (
                <tr key={`${e.id}-${i}`} className="border-t">
                  <td className="p-2">{e.entry_date}</td>
                  <td className="p-2">{e.number}</td>
                  <td className="p-2">{l.code} - {l.name}</td>
                  <td className="p-2">{l.account_type}</td>
                  <td className="p-2 text-right">{l.debit || ""}</td>
                  <td className="p-2 text-right">{l.credit || ""}</td>
                  <td className="p-2">{l.description}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
