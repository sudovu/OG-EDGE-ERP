import { useState } from "react";
import { api } from "../lib/api";

export default function WorkflowsPage() {
  const [entityType, setEntityType] = useState("sales_order");
  const [state, setState] = useState("draft");
  const [entityId, setEntityId] = useState("");
  const [toState, setToState] = useState("");
  const [transitions, setTransitions] = useState<any[]>([]);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const loadTransitions = async () => {
    try {
      const r = await api.get("/workflows/transitions", { params: { entityType, state } });
      setTransitions(r.data.data);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Failed");
    }
  };

  const doTransition = async () => {
    try {
      const r = await api.post("/workflows/transition", { entityType, entityId, toState });
      setResult(JSON.stringify(r.data.data));
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? "Transition failed");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Workflows</h1>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="bg-white p-4 rounded shadow mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
        <select className="border p-2 rounded" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="sales_order">Sales Order</option>
          <option value="quotation">Quotation</option>
          <option value="service_request">Service Request</option>
          <option value="invoice">Invoice</option>
          <option value="purchase_order">Purchase Order</option>
          <option value="work_order">Work Order</option>
        </select>
        <input className="border p-2 rounded" placeholder="Current state" value={state} onChange={(e) => setState(e.target.value)} />
        <button onClick={loadTransitions} className="bg-slate-200 rounded px-4">Load transitions</button>
      </div>
      {transitions.length > 0 && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-2">Allowed transitions</h2>
          <ul className="text-sm">
            {transitions.map((t) => <li key={t.id}>{t.from_name} → <b>{t.to_name}</b> ({t.name})</li>)}
          </ul>
        </div>
      )}
      <div className="bg-white p-4 rounded shadow grid grid-cols-2 md:grid-cols-4 gap-2">
        <input className="border p-2 rounded" placeholder="Entity ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        <input className="border p-2 rounded" placeholder="To state" value={toState} onChange={(e) => setToState(e.target.value)} />
        <button onClick={doTransition} className="bg-slate-900 text-white rounded px-4">Transition</button>
      </div>
      {result && <pre className="mt-4 bg-slate-100 p-3 rounded text-xs">{result}</pre>}
    </div>
  );
}