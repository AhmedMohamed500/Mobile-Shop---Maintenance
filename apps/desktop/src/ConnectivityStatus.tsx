import { useEffect, useState } from "react";
import { api } from "./api";

export function ConnectivityStatus() {
  const [online, setOnline] = useState(navigator.onLine); const [checking, setChecking] = useState(false);
  useEffect(() => { let stopped = false; async function check() { setChecking(true); try { await api("/health"); if (!stopped) setOnline(true); } catch { if (!stopped) setOnline(false); } finally { if (!stopped) setChecking(false); } } void check(); const timer = window.setInterval(() => void check(), 15_000); const onOnline = () => void check(); const onOffline = () => setOnline(false); window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline); return () => { stopped = true; clearInterval(timer); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); }; }, []);
  return <div className={`connectivity ${online ? "online" : "offline"}`}><i />{checking && !online ? "جارٍ إعادة الاتصال…" : online ? "متصل بالخادم" : "غير متصل — العمليات غير المتزامنة ستبقى معلقة"}</div>;
}