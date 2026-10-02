import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { moneyMinorToDisplay, statusLabels, type RepairStatus } from "@repair/domain";
import "./styles.css";

type Tracking = { shop: { name: string; logoUrl?: string; primaryColor: string; phone?: string }; branch: { name: string; address?: string; phone?: string }; repairNumber: string; device: { brand: string; model: string }; status: RepairStatus; timeline: { toStatus: RepairStatus; createdAt: string }[]; lastUpdate: string; estimatedCost: number; paid: number };
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const token = location.pathname.split("/").filter(Boolean).at(-1); const [data, setData] = useState<Tracking | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (!token) return setError("رابط المتابعة غير صالح"); fetch(`${apiUrl}/public/tracking/${token}`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; }).then(setData).catch((e) => setError(e.message)); }, [token]);
  if (error) return <Shell><div className="notice error">{error}</div></Shell>;
  if (!data) return <Shell><div className="notice">جارٍ تحميل حالة جهازك…</div></Shell>;
  const remaining = Math.max(0, data.estimatedCost - data.paid);
  return <Shell color={data.shop.primaryColor}><header><div className="logo">{data.shop.logoUrl ? <img src={data.shop.logoUrl} /> : data.shop.name.slice(0, 1)}</div><div><small>متابعة أمر الصيانة</small><h1>{data.shop.name}</h1></div></header><section className="hero"><span>{data.repairNumber}</span><h2>{statusLabels[data.status]}</h2><p>{data.device.brand} · {data.device.model}</p><small>آخر تحديث {new Date(data.lastUpdate).toLocaleString("ar-EG")}</small></section><section className="card"><h3>رحلة الجهاز</h3><div className="timeline">{data.timeline.map((event, index) => <div key={`${event.toStatus}-${index}`} className="event"><i>✓</i><div><b>{statusLabels[event.toStatus]}</b><small>{new Date(event.createdAt).toLocaleString("ar-EG")}</small></div></div>)}</div></section><section className="card totals"><h3>المدفوعات</h3><div><span>المبلغ التقديري</span><b>{moneyMinorToDisplay(data.estimatedCost * 100)}</b></div><div><span>تم دفعه</span><b>{moneyMinorToDisplay(data.paid * 100)}</b></div><div className="remaining"><span>المتبقي التقديري</span><b>{moneyMinorToDisplay(remaining * 100)}</b></div></section><footer><b>{data.branch.name}</b><span>{data.branch.address}</span><a href={`tel:${data.branch.phone ?? data.shop.phone}`}>اتصل بالمركز</a></footer></Shell>;
}
function Shell({ children, color = "#0f766e" }: { children: React.ReactNode; color?: string }) { return <main style={{ "--brand": color } as React.CSSProperties}>{children}</main>; }
createRoot(document.getElementById("root")!).render(<App />);
