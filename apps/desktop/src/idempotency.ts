export interface IdempotencyTracker {
  keyFor(fingerprint: string): string;
  clear(): void;
}

export function createIdempotencyTracker(createKey: () => string = () => crypto.randomUUID()): IdempotencyTracker {
  let pending: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(fingerprint) {
      if (pending?.fingerprint !== fingerprint) pending = { fingerprint, key: createKey() };
      return pending.key;
    },
    clear() { pending = null; },
  };
}