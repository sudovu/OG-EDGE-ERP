import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get("/reports/dashboard").then((r) => setData(r.data.data)).catch(() => {});
  }, []);
  const card = (label: string, value: any) => (
    <div className="bg-white rounded shadow p-4">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
    </div>
  );
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {card("Customers", data?.customers)}
        {card("Products", data?.products)}
        {card("Invoices", data?.invoices)}
        {card("Revenue", data?.revenue)}
        {card("Outstanding", data?.outstanding)}
        {card("Service Requests", data?.serviceRequests)}
      </div>
    </div>
  );
}