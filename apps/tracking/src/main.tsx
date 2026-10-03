import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { moneyMinorToDisplay, statusLabels, type RepairStatus } from "./domain";
import "./styles.css";

const apiUrl = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
type Tracking = { shop: { name: string; logoUrl?: string; primaryColor: string; phone?: string }; branch: { name: string; address?: string; phone?: string }; repairNumber: string; device: { brand: string; model: string }; status: RepairStatus; timeline: { toStatus: RepairStatus; createdAt: string }[]; lastUpdate: string; approvedAmount: number; paid: number; remaining: number };
type Approval = { repairNumber: string; customerName: string; device: string; quote: { version: number; amount: number; diagnosis: string; customerNote?: string; status: string }; decided: "APPROVED" | "REJECTED" | null };

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...options?.headers } });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new Error("تعذر الاتصال بخادم النظام");
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? body.error ?? "تعذر إتمام الطلب");
  return body;
}

function App() {
  const parts = location.pathname.split("/").filter(Boolean); const token = parts.at(-1); const approval = parts.includes("approve");
  if (approval) return <ApprovalPage token={token} />;
  return <TrackingPage token={token} />;
}

function TrackingPage({ token }: { token?: string }) {
  const [data, setData] = useState<Tracking | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (!token) return setError("رابط المتابعة غير صالح"); json<Tracking>(`/public/tracking/${token}`).then(setData).catch((e) => setError(e.message)); }, [token]);
  if (error) return <Shell><div className="notice error">{error}</div></Shell>;
  if (!data) return <Shell><div className="notice">جارٍ تحميل حالة جهازك…</div></Shell>;
  return <Shell color={data.shop.primaryColor}><header><div className="logo">{data.shop.logoUrl ? <img src={data.shop.logoUrl} /> : data.shop.name.slice(0, 1)}</div><div><small>متابعة أمر الصيانة</small><h1>{data.shop.name}</h1></div></header><section className="hero"><span>{data.repairNumber}</span><h2>{statusLabels[data.status]}</h2><p>{data.device.brand} · {data.device.model}</p><small>آخر تحديث {new Date(data.lastUpdate).toLocaleString("ar-EG")}</small></section><section className="card"><h3>رحلة الجهاز</h3><div className="timeline">{data.timeline.map((event, index) => <div key={`${event.toStatus}-${index}`} className="event"><i>✓</i><div><b>{statusLabels[event.toStatus]}</b><small>{new Date(event.createdAt).toLocaleString("ar-EG")}</small></div></div>)}</div></section><section className="card totals"><h3>المدفوعات</h3><div><span>السعر المعتمد</span><b>{moneyMinorToDisplay(data.approvedAmount * 100)}</b></div><div><span>تم دفعه</span><b>{moneyMinorToDisplay(data.paid * 100)}</b></div><div className="remaining"><span>المتبقي</span><b>{moneyMinorToDisplay(data.remaining * 100)}</b></div></section><footer><b>{data.branch.name}</b><span>{data.branch.address}</span><a href={`tel:${data.branch.phone ?? data.shop.phone}`}>اتصل بالمركز</a></footer></Shell>;
}

function ApprovalPage({ token }: { token?: string }) {
  const [data, setData] = useState<Approval | null>(null); const [error, setError] = useState(""); const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!token) return setError("رابط الموافقة غير صالح"); json<Approval>(`/public/approval/${token}`).then((value) => { setData(value); setDone(value.decided); }).catch((e) => setError(e.message)); }, [token]);
  async function decide(decision: "APPROVED" | "REJECTED") { if (!token) return; setBusy(true); setError(""); try { await json(`/public/approval/${token}`, { method: "POST", body: JSON.stringify({ decision }) }); setDone(decision); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (error && !data) return <Shell><div className="notice error">{error}</div></Shell>;
  if (!data) return <Shell><div className="notice">جارٍ تحميل عرض السعر…</div></Shell>;
  return <Shell><header><div className="logo">ص</div><div><small>موافقة العميل</small><h1>عرض سعر الصيانة</h1></div></header><section className="hero"><span>{data.repairNumber}</span><h2>{data.device}</h2><p>مرحبًا {data.customerName}</p></section><section className="card quote"><small>عرض السعر رقم {data.quote.version}</small><h3>{moneyMinorToDisplay(data.quote.amount * 100)}</h3><b>التشخيص</b><p>{data.quote.diagnosis}</p>{data.quote.customerNote && <p>{data.quote.customerNote}</p>}</section>{done ? <div className="notice decision">{done === "APPROVED" ? "تم تسجيل موافقتك بنجاح" : "تم تسجيل رفضك للعرض"}</div> : <div className="approval-actions"><button disabled={busy} className="approve" onClick={() => decide("APPROVED")}>أوافق على الإصلاح والسعر</button><button disabled={busy} className="reject" onClick={() => decide("REJECTED")}>أرفض عرض السعر</button></div>}{error && <div className="notice error">{error}</div>}</Shell>;
}
function Shell({ children, color = "#0f766e" }: { children: React.ReactNode; color?: string }) { return <main style={{ "--brand": color } as React.CSSProperties}>{children}</main>; }
createRoot(document.getElementById("root")!).render(<App />);
