import QRCode from "qrcode";

export type PrintDocumentKind = "RECEIPT" | "LABEL";
export type PrintDocumentOptions = { kind: PrintDocumentKind; payload: Record<string, unknown>; paperWidth: "58mm" | "80mm"; labelWidthMm?: number; labelHeightMm?: number };
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const fieldLabels: Record<string, string> = { branch: "الفرع", repairNumber: "رقم الصيانة", intakeDate: "التاريخ", deliveredAt: "التاريخ", customer: "العميل", phone: "الهاتف", brand: "الماركة", model: "الموديل", device: "الجهاز", color: "اللون", imei: "IMEI", fault: "وصف العطل", estimatedCost: "التكلفة التقديرية", finalCharge: "السعر النهائي", deposit: "العربون", previouslyPaid: "المدفوع سابقًا", collected: "المحصل", estimatedRemaining: "المتبقي", remaining: "المتبقي", customerIdentifier: "معرف العميل" };
const safeKeys = Object.keys(fieldLabels);

export async function renderPrintDocument({ kind, payload, paperWidth, labelWidthMm = 50, labelHeightMm = 30 }: PrintDocumentOptions) {
  const qrValue = String(payload.qrValue ?? payload.trackingUrl ?? "");
  const qr = qrValue ? await QRCode.toDataURL(qrValue, { errorCorrectionLevel: "M", margin: 1, width: kind === "LABEL" ? 180 : 240 }) : "";
  const selectedFaults = Array.isArray(payload.selectedFaults) ? payload.selectedFaults.map(escapeHtml).join("، ") : "";
  const fields = safeKeys.filter((key) => payload[key] != null && payload[key] !== "").map((key) => `<div><dt>${fieldLabels[key]}</dt><dd>${escapeHtml(payload[key])}</dd></div>`).join("");
  const width = kind === "LABEL" ? `${labelWidthMm}mm` : paperWidth;
  const height = kind === "LABEL" ? `min-height:${labelHeightMm}mm;` : "";
  const logoValue = payload.logoUrl ?? payload.shopLogo;
  const logo = logoValue ? `<img class="logo" src="${escapeHtml(logoValue)}" alt="شعار المركز" />` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${kind === "LABEL" ? "ملصق جهاز" : "إيصال صيانة"}</title><style>@page{size:${width} auto;margin:2mm}*{box-sizing:border-box}body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;width:${width};${height}margin:0 auto;padding:2mm;color:#000;direction:rtl}.logo{display:block;max-width:22mm;max-height:16mm;margin:0 auto 2mm}h1,h2,p{text-align:center;margin:1mm 0}h1{font-size:15px}h2{font-size:13px}dl{margin:2mm 0}dl div{display:flex;justify-content:space-between;gap:2mm;border-bottom:1px dashed #777;padding:1.2mm 0;font-size:11px}dt{font-weight:700}dd{margin:0;text-align:left}.faults{font-size:11px;border:1px solid #000;padding:2mm}.qr{display:block;width:${kind === "LABEL" ? "22mm" : "30mm"};height:${kind === "LABEL" ? "22mm" : "30mm"};margin:2mm auto 0}.tracking{font-size:8px;direction:ltr;overflow-wrap:anywhere}.footer{font-size:9px;border-top:1px dashed #777;padding-top:2mm}@media print{button{display:none}}</style></head><body>${logo}<h1>${escapeHtml(payload.shopName ?? (kind === "LABEL" ? "ملصق جهاز" : "إيصال صيانة"))}</h1><dl>${fields}</dl>${selectedFaults ? `<p class="faults"><b>الأعطال المحددة:</b> ${selectedFaults}</p>` : ""}${qr ? `<img class="qr" src="${qr}" alt="QR"/><p class="tracking">${escapeHtml(qrValue)}</p>` : ""}${payload.receiptFooter ? `<p class="footer">${escapeHtml(payload.receiptFooter)}</p>` : ""}<button onclick="window.print()">طباعة</button></body></html>`;
}
