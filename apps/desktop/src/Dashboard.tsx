import { useEffect, useState } from "react";
import { statusLabels } from "@repair/domain";
import { api } from "./api";
import type { Session } from "./auth";
import type { Page, Repair } from "./types";
import { formatMoney } from "./types";

type DashboardData = { received: number; ready: number; recentRepairs: Repair[]; readyRepairs: (Repair & { paid: number; finalCharge: number })[] };

export function Dashboard({ session, navigate }: { session: Session; navigate: (page: Page) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [results, setResults] = useState<Repair[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<DashboardData>("/dashboard/reception", {}, session.token).then(setData).catch((e) => setError(e.message)); }, [session.token]);
  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const timer = setTimeout(() => { const path = query.includes("/r/") ? `/repairs/scan?code=${encodeURIComponent(query)}` : `/repairs?search=${encodeURIComponent(query)}`; api<Repair[] | Repair>(path, {}, session.token).then((value) => setResults(Array.isArray(value) ? value : [value])).catch((e) => { setResults([]); setError(e.message); }); }, 250);
    return () => clearTimeout(timer);
  }, [query, session.token]);
  return <>
    <header><div><span className="eyebrow">الدور الأرضي · الاستقبال</span><h1>صباح الخير، {session.user.name}</h1></div>{session.user.permissions.includes("repair.intake.create") && <button className="primary" onClick={() => navigate("intake")}>+ استلام جهاز</button>}</header>
    {error && <div className="error">{error}</div>}
    {!data ? <div className="loading">جارٍ تحميل لوحة العمل…</div> : <>
      <section className="stats"><article><div className="stat-icon received">↓</div><div><span>الأجهزة المستلمة</span><strong>{data.received}</strong><small>قيد المتابعة داخل المركز</small></div></article><article onClick={() => navigate("delivery")} className="clickable"><div className="stat-icon ready">✓</div><div><span>الأجهزة الجاهزة للتسليم</span><strong>{data.ready}</strong><small>بانتظار حضور العميل</small></div></article></section>
      <section className="quick"><h2>بحث سريع</h2><div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="رقم أمر الصيانة، الهاتف، IMEI أو اسم العميل" /><button type="button" onClick={() => { const value = window.prompt("امسح QR/الباركود أو أدخل الرقم"); if (value) setQuery(value); }}>مسح QR / باركود</button></div>{results.length > 0 && <div className="search-results">{results.map((repair) => <article key={repair.id}><b>{repair.repairNumber}</b><span>{repair.customer.name} · {repair.brand.name} {repair.model}</span><em>{statusLabels[repair.status]}</em></article>)}</div>}<div className="actions">{session.user.permissions.includes("repair.intake.create") && <button onClick={() => navigate("intake")}><b>استلام جهاز</b><span>تسجيل جهاز جديد وطباعة الإيصال</span></button>}{session.user.permissions.includes("delivery.complete") && <button onClick={() => navigate("delivery")}><b>تسليم جهاز</b><span>بحث، تحصيل المتبقي وإتمام التسليم</span></button>}</div></section>
      <section className="panel"><h2>أحدث الأجهزة قيد العمل</h2><div className="table">{data.recentRepairs.map((repair) => <article key={repair.id}><b>{repair.repairNumber}</b><span>{repair.customer.name}</span><span>{repair.brand.name} {repair.model}</span><em>{statusLabels[repair.status]}</em></article>)}{!data.recentRepairs.length && <div className="empty">لا توجد أجهزة قيد العمل</div>}</div></section>
      {data.readyRepairs.length > 0 && <section className="panel"><h2>جاهز للتسليم الآن</h2><div className="table">{data.readyRepairs.map((repair) => <article key={repair.id}><b>{repair.repairNumber}</b><span>{repair.customer.name}</span><span>{repair.customer.phoneDisplay}</span><strong>{formatMoney(Math.max(0, repair.finalCharge - repair.paid))}</strong></article>)}</div></section>}
    </>}
  </>;
}

