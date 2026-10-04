export type PatternPoint = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const patternPoints: PatternPoint[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function patternCoordinates(point: PatternPoint) {
  const index = point - 1;
  return { row: Math.floor(index / 3), column: index % 3 };
}

export function midpointBetween(from: PatternPoint, to: PatternPoint): PatternPoint | null {
  const a = patternCoordinates(from); const b = patternCoordinates(to);
  const rowSum = a.row + b.row; const columnSum = a.column + b.column;
  if (rowSum % 2 || columnSum % 2 || (a.row === b.row && a.column === b.column)) return null;
  const row = rowSum / 2; const column = columnSum / 2;
  const midpoint = row * 3 + column + 1;
  return midpoint === from || midpoint === to ? null : midpoint as PatternPoint;
}

export function addPatternPoint(value: PatternPoint[], point: PatternPoint) {
  if (value.includes(point)) return value;
  const next = [...value]; const previous = next.at(-1);
  if (previous) { const midpoint = midpointBetween(previous, point); if (midpoint && !next.includes(midpoint)) next.push(midpoint); }
  next.push(point); return next;
}

export function serializePattern(value: PatternPoint[]) { return value.join("-"); }
