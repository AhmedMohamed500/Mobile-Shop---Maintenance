import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "./api";
import type { Session } from "./auth";

export type PrinterInfo = { name: string; isDefault: boolean; isOffline: boolean };
export type WorkstationPrinterConfig = { workstationId: string; receiptPrinter: string; labelPrinter: string; paperSize: "58mm" | "80mm"; labelWidthMm: number; labelHeightMm: number; copies: number; autoPrintReception: boolean; autoPrintDelivery: boolean; autoPrintLabel: boolean };
type PendingJob = { id: string; kind: "RECEIPT" | "LABEL" | "DELIVERY_RECEIPT"; payload: Record<string, unknown> };

export function isTauriDesktop() { return "__TAURI_INTERNALS__" in window; }
function key(session: Session) { return `repair-printers:${session.tenant.id}:${session.branch?.id ?? "all"}`; }
export function getPrinterConfig(session: Session): WorkstationPrinterConfig | null { const raw = localStorage.getItem(key(session)); if (!raw) return null; try { return JSON.parse(raw) as WorkstationPrinterConfig; } catch { return null; } }
export function savePrinterConfig(session: Session, config: WorkstationPrinterConfig) { localStorage.setItem(key(session), JSON.stringify(config)); window.dispatchEvent(new CustomEvent("printer-config-changed")); }
export async function listPrinters(): Promise<PrinterInfo[]> { if (!isTauriDesktop()) return []; return invoke<PrinterInfo[]>("list_printers"); }

export function PrintAgent({ session }: { session: Session }) {
  const running = useRef(false); const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!isTauriDesktop() || !session.branch) return;
    let stopped = false;
    async function process() {
      if (running.current || stopped) return; const config = getPrinterConfig(session); if (!config) return; running.current = true;
      try {
        const jobs = await api<PendingJob[]>(`/print-jobs/pending?branchId=${session.branch!.id}`, {}, session.token);
        for (const job of jobs) {
          const enabled = job.kind === "LABEL" ? config.autoPrintLabel : job.kind === "DELIVERY_RECEIPT" ? config.autoPrintDelivery : config.autoPrintReception;
          const printerName = job.kind === "LABEL" ? config.labelPrinter : config.receiptPrinter; if (!enabled || !printerName) continue;
          try { await invoke("print_job", { request: { printerName, kind: job.kind, copies: config.copies, payload: { ...job.payload, paperWidth: config.paperSize } } }); await api(`/print-jobs/${job.id}/result`, { method: "POST", body: JSON.stringify({ status: "COMPLETED", printerName, workstationId: config.workstationId }) }, session.token); }
          catch (error) { setNotice("تم حفظ أمر الصيانة، ولكن تعذرت الطباعة. يمكنك إعادة الطباعة من تفاصيل أمر الصيانة."); await api(`/print-jobs/${job.id}/result`, { method: "POST", body: JSON.stringify({ status: "FAILED", printerName, workstationId: config.workstationId, error: String(error).slice(0, 900) }) }, session.token).catch(() => undefined); }
        }
      } catch { /* connectivity indicator reports API outages; queued jobs remain durable */ } finally { running.current = false; }
    }
    void process(); const timer = window.setInterval(() => void process(), 5_000); const changed = () => void process(); window.addEventListener("printer-config-changed", changed); return () => { stopped = true; clearInterval(timer); window.removeEventListener("printer-config-changed", changed); };
  }, [session]);
  return notice ? <div className="print-notice error" role="alert">{notice}<button onClick={() => setNotice("")}>×</button></div> : null;
}


