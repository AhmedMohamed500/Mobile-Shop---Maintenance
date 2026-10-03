import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Session } from "./auth";

export function useRepairEvents(session: Session, acceptedTypes: string[]) {
  const [revision, setRevision] = useState(0); const cursor = useRef(new Date().toISOString()); const failures = useRef(0); const types = acceptedTypes.join("|");
  useEffect(() => { let stopped = false; async function poll() { try { const result = await api<{ events: { type: string }[]; cursor: string }>(`/events?after=${encodeURIComponent(cursor.current)}`, {}, session.token); cursor.current = result.cursor; failures.current = 0; if (!stopped && result.events.some((event) => acceptedTypes.includes(event.type))) setRevision((value) => value + 1); } catch { failures.current++; if (!stopped && failures.current % 3 === 0) setRevision((value) => value + 1); } } const timer = window.setInterval(() => void poll(), 5_000); return () => { stopped = true; clearInterval(timer); }; }, [session.token, types]);
  return revision;
}