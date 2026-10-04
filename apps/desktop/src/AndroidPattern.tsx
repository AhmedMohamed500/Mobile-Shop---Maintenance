import { useRef, useState, type PointerEvent } from "react";
import { addPatternPoint, patternCoordinates, patternPoints, type PatternPoint } from "./pattern";

type Props = { value: PatternPoint[]; onChange: (value: PatternPoint[]) => void };

function pointPosition(point: PatternPoint) { const { row, column } = patternCoordinates(point); return { x: 16.67 + column * 33.33, y: 16.67 + row * 33.33 }; }

export function AndroidPattern({ value, onChange }: Props) {
  const board = useRef<HTMLDivElement>(null); const valueRef = useRef(value); valueRef.current = value; const [drawing, setDrawing] = useState(false); const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  function locate(clientX: number, clientY: number) { const rect = board.current?.getBoundingClientRect(); if (!rect) return null; const x = (clientX - rect.left) / rect.width * 100; const y = (clientY - rect.top) / rect.height * 100; const nearest = patternPoints.map((id) => ({ id, ...pointPosition(id) })).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]!; return { point: Math.hypot(nearest.x - x, nearest.y - y) <= 12 ? nearest.id : null, pointer: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } }; }
  function start(event: PointerEvent<HTMLDivElement>) { const located = locate(event.clientX, event.clientY); if (!located?.point) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDrawing(true); setPointer(located.pointer); const next = addPatternPoint([], located.point); valueRef.current = next; onChange(next); }
  function move(event: PointerEvent<HTMLDivElement>) { if (!drawing) return; event.preventDefault(); const located = locate(event.clientX, event.clientY); if (!located) return; setPointer(located.pointer); if (located.point) { const next = addPatternPoint(valueRef.current, located.point); valueRef.current = next; onChange(next); } }
  function finish(event: PointerEvent<HTMLDivElement>) { if (!drawing) return; event.preventDefault(); setDrawing(false); setPointer(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  const selected = value.map(pointPosition); const linePoints = selected.map((point) => `${point.x},${point.y}`).join(" "); const last = selected.at(-1);
  return <div className="pattern-control"><div ref={board} className={`android-pattern${drawing ? " drawing" : ""}`} role="application" aria-label="رسم نمط فتح الجهاز" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><polyline className="pattern-line" points={linePoints} />{drawing && last && pointer && <line className="pattern-line active" x1={last.x} y1={last.y} x2={pointer.x} y2={pointer.y} />}</svg>
    {patternPoints.map((point) => { const position = pointPosition(point); return <span key={point} className={`pattern-dot${value.includes(point) ? " selected" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} aria-hidden="true"><i /></span>; })}
  </div><div className="pattern-meta"><span>{value.length ? `تم اختيار ${value.length} نقاط` : "اضغط واسحب لرسم النمط"}</span><button type="button" className="ghost" disabled={!value.length} onClick={() => onChange([])}>مسح النمط</button></div></div>;
}
