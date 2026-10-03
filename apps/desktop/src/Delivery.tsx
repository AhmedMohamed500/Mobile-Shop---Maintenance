import { useEffect, useRef, useState } from "react";
import { statusLabels } from "@repair/domain";
import { api } from "./api";
import type { Session } from "./auth";
import type { Repair } from "./types";
import { formatMoney } from "./types";
import { useRepairEvents } from "./useRepairEvents";
import { createIdempotencyTracker } from "./idempotency";

export function Delivery({ session }: { session: Session }) {
  const eventRevision = useRepairEvents(session, ["repair.ready_for_delivery", "repair.status.changed", "repair.delivered"]);
  const [repairs, setRepairs] = useState<Repair[]>([]); const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Repair | null>(null); const [reference, setReference] = useState(""); const [paymentMethod, setPaymentMethod] = useState("CASH"); const [message, setMessage] = useState("");
  const pendingDelivery = useRef(createIdempotencyTracker());
  const load = () => api<Repair[]>(`/repairs?status=READY_FOR_DELIVERY,READY_FOR_RETURN_WITHOUT_REPAIR${query ? `&search=${encodeURIComponent(query)}` : ""}`, {}, session.token).then(setRepairs).catch((e) => setMessage(e.message));
  useEffect(() => { void load(); }, [session.token, query, eventRevision]);
  async function deliver() {
    if (!selected) return;
    const body = JSON.stringify({ collectedAmount: selected.remaining.toFixed(2), paymentMethod, reference: reference || undefined });
    const fingerprint = `${selected.id}:${body}`;
    const idempotencyKey = pendingDelivery.current.keyFor(fingerprint);
    try {
      const result = await api<{ repairNumber: string }>(`/repairs/${selected.id}/deliver`, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body }, session.token);
      pendingDelivery.current.clear();
      setMessage(`تم تسليم ${result.repairNumber} وتصفير المبلغ وحذف بيانات الفتح`); setSelected(null); load();
    } catch (e) { setMessage((e as Error).message); }
  }  return <><header><div><span className="eyebrow">نقطة التسليم والتحصيل</span><h1>تسليم جهاز</h1></div></header><div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم الأمر أو الهاتف أو اسم العميل" /></div>{message && <div className={message.startsWith("تم") ? "success" : "error"}>{message}</div>}<section className="delivery-list">{repairs.map((repair) => <article className="panel" key={repair.id}><div><b>{repair.repairNumber}</b><h2>{repair.customer.name}</h2><p>{repair.brand.name} {repair.model} · {statusLabels[repair.status]}</p></div><div className="amount"><small>المتبقي</small><strong>{formatMoney(repair.remaining)}</strong><button className="primary" onClick={() => setSelected(repair)}>إتمام التسليم</button></div></article>)}{!repairs.length && <div className="loading">لا توجد أجهزة جاهزة للتسليم</div>}</section>{selected && <div className="modal"><section className="panel modal-card"><h2>تأكيد التسليم</h2><p>{selected.repairNumber} · {selected.customer.name}</p><div className="receipt-summary"><span>السعر النهائي <b>{formatMoney(selected.finalCharge)}</b></span><span>المدفوع سابقًا <b>{formatMoney(selected.paid)}</b></span><span>المطلوب الآن <b>{formatMoney(selected.remaining)}</b></span></div><label>طريقة الدفع<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="CASH">نقدي</option><option value="VODAFONE_CASH">فودافون كاش</option><option value="INSTAPAY">إنستا باي</option><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="OTHER">أخرى</option></select></label><label>مرجع التحصيل (اختياري)<input value={reference} onChange={(e) => setReference(e.target.value)} /></label><p className="hint">سيتم إنشاء إيصال التسليم، إرسال رسالة العميل، وحذف بيانات فتح الجهاز نهائيًا.</p><div className="row end"><button className="ghost" onClick={() => setSelected(null)}>إلغاء</button><button className="primary" onClick={deliver}>تحصيل وتسليم</button></div></section></div>}</>;
}

