import { FormEvent, useState } from "react";
import { login, type Session } from "./auth";
import { Customers } from "./Customers";
import { Dashboard } from "./Dashboard";
import { Delivery } from "./Delivery";
import { Intake } from "./Intake";
import { Settings } from "./Settings";
import type { Page } from "./types";
import { Users } from "./Users";
import { Workshop } from "./Workshop";
import { PublicPortal } from "./PublicPortal";
import { ConnectivityStatus } from "./ConnectivityStatus";
import { PrintAgent } from "./printer";
import { Finance } from "./Finance";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  if (!session) return <Login onLogin={setSession} />;
  const permissions = session.user.permissions;
  const nav = [
    { page: "dashboard" as const, label: "لوحة الاستقبال", permission: "repair.view" },
    { page: "intake" as const, label: "استلام جهاز", permission: "repair.intake.create" },
    { page: "delivery" as const, label: "تسليم جهاز", permission: "delivery.complete" },
    { page: "customers" as const, label: "العملاء", permission: "customer.manage" },
    { page: "workshop" as const, label: "ورشة الصيانة", permission: "workshop.access" },
    { page: "finance" as const, label: "الصندوق والتقارير", permission: "cash.manage" },
    { page: "settings" as const, label: "الإعدادات", permission: "settings.manage" },
    { page: "users" as const, label: "المستخدمون", permission: "user.manage" },
  ].filter((item) => permissions.includes(item.permission));
  return <div className="app" style={{ "--brand": session.tenant.primaryColor } as React.CSSProperties}>
    <aside className="sidebar"><div><div className="brand-mark">ص</div><div><strong>{session.tenant.name}</strong><small>{session.user.name}</small><small>{session.branch ? `${session.branch.name} · ${session.branch.code}` : "كل الفروع"}</small></div></div><ConnectivityStatus /><nav>{nav.map((item) => <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>{item.label}</button>)}</nav><button className="signout" onClick={() => { setSession(null); setPage("dashboard"); }}>تسجيل الخروج</button></aside>
    <PrintAgent session={session} /><main>{page === "dashboard" && <Dashboard session={session} navigate={setPage} />}{page === "intake" && <Intake session={session} onDone={() => setPage("dashboard")} />}{page === "delivery" && <Delivery session={session} />}{page === "customers" && <Customers session={session} />}{page === "workshop" && <Workshop session={session} />}{page === "finance" && <Finance session={session} />}{page === "settings" && <Settings session={session} />}{page === "users" && <Users session={session} />}</main>
  </div>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { onLogin(await login({ tenant: String(data.get("tenant")), email: String(data.get("email")), password: String(data.get("password")) })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="login-shell"><section className="login-card"><span className="eyebrow">منصة إدارة مراكز الصيانة</span><h1>أهلاً بعودتك</h1><p>سجّل الدخول إلى مساحة عمل المركز</p><form onSubmit={submit}><label>رمز المركز<input name="tenant" defaultValue="demo" required /></label><label>البريد الإلكتروني<input name="email" type="email" defaultValue="reception@demo.local" required /></label><label>كلمة المرور<input name="password" type="password" defaultValue="Demo@12345" required /></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "جارٍ الدخول…" : "تسجيل الدخول"}</button></form><small>بيانات البيئة التجريبية موضحة في README</small></section><section className="login-visual"><div><b>استقبال أسرع.</b><b>متابعة أوضح.</b><b>تسليم بلا أخطاء.</b></div></section></div>;
}
