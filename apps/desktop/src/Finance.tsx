import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Session } from "./auth";
import { formatMoney } from "./types";

type PaymentMethod = "CASH" | "VODAFONE_CASH" | "INSTAPAY" | "CARD" | "BANK_TRANSFER" | "OTHER";
type Shift = { id: string; status: string; openingBalance: number; expectedCash: number; openedAt: string; openedBy?: { name: string }; transactions: { id: string; type: string; direction: "IN" | "OUT"; amount: number; paymentMethod: PaymentMethod; createdAt: string; notes?: string }[] };
type Category = { id: string; name: string };
type Report = { revenue: number; collections: number; deposits: number; finalCollections: number; expenses: number; refunds: number; outstanding: number; cashMovement: number; transactionCount: number; paymentMethods: { method: PaymentMethod; amount: number }[] };

const methodLabels: Record<PaymentMethod, string> = { CASH: "نقدي", VODAFONE_CASH: "فودافون كاش", INSTAPAY: "إنستا باي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", OTHER: "أخرى" };
const methods = Object.entries(methodLabels) as [PaymentMethod, string][];

export function Finance({ session }: { session: Session }) {
  const canCash = session.permissions.includes("cash.manage"); const canExpense = session.permissions.includes("expense.manage");
  const [shift, setShift] = useState<Shift | null>(null); const [categories, setCategories] = useState<Category[]>([]); const [report, setReport] = useState<Report | null>(null); const [message, setMessage] = useState("");
  const dates = useMemo(() => { const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1); const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }, []);
  const [range, setRange] = useState(dates);
  const load = async () => {
    const tasks: Promise<unknown>[] = [];
    if (canCash) tasks.push(api<Shift | null>("/finance/shifts/current", {}, session.token).then(setShift));
    if (canExpense) tasks.push(api<Category[]>("/finance/expense-categories", {}, session.token).then(setCategories));
    if (session.permissions.includes("report.financial.view")) tasks.push(api<Report>(`/finance/report?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, {}, session.token).then(setReport));
    try { await Promise.all(tasks); } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { void load(); }, [session.token, range.from, range.to]);

  async function openShift(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); try { await api("/finance/shifts/open", { method: "POST", body: JSON.stringify({ openingBalance: data.get("openingBalance"), notes: data.get("notes") || undefined }) }, session.token); setMessage("تم فتح الوردية"); await load(); } catch (error) { setMessage((error as Error).message); } }
  async function closeShift(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!shift) return; const data = new FormData(event.currentTarget); try { await api(`/finance/shifts/${shift.id}/close`, { method: "POST", body: JSON.stringify({ actualCash: data.get("actualCash"), notes: data.get("notes") || undefined }) }, session.token); setMessage("تم إغلاق الوردية وحساب العجز أو الزيادة"); setShift(null); await load(); } catch (error) { setMessage((error as Error).message); } }
  async function postExpense(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); try { await api("/finance/expenses", { method: "POST", body: JSON.stringify({ categoryId: data.get("categoryId"), amount: data.get("amount"), paymentMethod: data.get("paymentMethod"), description: data.get("description") }) }, session.token); form.reset(); setMessage("تم تسجيل المصروف وحركة الصندوق"); await load(); } catch (error) { setMessage((error as Error).message); } }

  function exportCsv() {
    if (!report) return;
    const rows = [["البند", "القيمة"], ["الإيراد", report.revenue], ["التحصيلات", report.collections], ["العربون", report.deposits], ["التحصيل النهائي", report.finalCollections], ["المصروفات", report.expenses], ["المردودات", report.refunds], ["المتبقي", report.outstanding], ["حركة النقدية", report.cashMovement]];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.join(",")).join(String.fromCharCode(10))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "financial-report.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function applyRange(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setRange({ from: new Date(`${data.get("from")}T00:00:00`).toISOString(), to: new Date(`${data.get("to")}T23:59:59.999`).toISOString() }); }
  function today() { const value = new Date().toISOString().slice(0, 10); setRange({ from: new Date(`${value}T00:00:00`).toISOString(), to: new Date(`${value}T23:59:59.999`).toISOString() }); }

  return <><header><div><span className="eyebrow">عمليات مالية فعلية</span><h1>الصندوق والورديات</h1></div><div className="row">{report && <button className="ghost" onClick={today}>اليوم</button>}{report && <button className="ghost" onClick={() => setRange(dates)}>هذا الشهر</button>}{report && <button className="ghost" onClick={exportCsv}>تصدير CSV</button>}</div></header>{report && <form key={range.from + range.to} className="search" onSubmit={applyRange}><label>من<input name="from" type="date" defaultValue={range.from.slice(0, 10)} required /></label><label>إلى<input name="to" type="date" defaultValue={range.to.slice(0, 10)} required /></label><button className="primary">عرض الفترة</button></form>}
    {message && <div className={message.startsWith("تم") ? "success" : "error"}>{message}</div>}
    {report && <section className="kpis finance-kpis">{[["الإيراد", report.revenue], ["التحصيلات", report.collections], ["العربون", report.deposits], ["التحصيل النهائي", report.finalCollections], ["المصروفات", report.expenses], ["المردودات", report.refunds], ["المتبقي", report.outstanding], ["حركة النقدية", report.cashMovement]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{formatMoney(Number(value))}</strong></article>)}</section>}
    <div className="settings-grid">
      {canCash && <section className="panel"><h2>{shift ? "الوردية المفتوحة" : "فتح وردية"}</h2>{shift ? <><p>افتتحها: <b>{shift.openedBy?.name ?? session.user.name}</b></p><div className="receipt-summary"><span>الرصيد الافتتاحي <b>{formatMoney(shift.openingBalance)}</b></span><span>الرصيد النظري <b>{formatMoney(shift.expectedCash)}</b></span></div><form onSubmit={closeShift}><label>النقدية الفعلية<input name="actualCash" type="number" min="0" step="0.01" required /></label><label>ملاحظات<input name="notes" /></label><button className="primary">إغلاق الوردية</button></form></> : <form onSubmit={openShift}><label>الرصيد الافتتاحي<input name="openingBalance" type="number" min="0" step="0.01" required /></label><label>ملاحظات<input name="notes" /></label><button className="primary">فتح وردية</button></form>}</section>}
      {canExpense && <section className="panel"><h2>تسجيل مصروف</h2><form onSubmit={postExpense}><label>التصنيف<select name="categoryId" required><option value="">اختر التصنيف</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>طريقة الدفع<select name="paymentMethod">{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>الوصف<input name="description" required /></label><button className="primary">تسجيل المصروف</button></form></section>}
      {report && <section className="panel"><h2>طرق الدفع هذا الشهر</h2><div className="list">{report.paymentMethods.map((item) => <div className="list-row" key={item.method}><b>{methodLabels[item.method]}</b><span>{formatMoney(item.amount)}</span></div>)}</div><p className="hint">الإيراد والتحصيل والمصروفات معروضة كبنود منفصلة. لا يُعرض الربح قبل توفر تكلفة قطع الغيار.</p></section>}
    </div>
  </>;
}