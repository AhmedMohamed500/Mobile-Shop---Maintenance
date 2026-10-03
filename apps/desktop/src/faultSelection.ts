export type FaultChoice = { id: string; name: string };
export function toggleFault(selected: string[], id: string) { return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]; }
export function selectedFaultNames(selected: string[], faults: FaultChoice[]) { const ids = new Set(selected); return faults.filter((fault) => ids.has(fault.id)).map((fault) => fault.name); }
