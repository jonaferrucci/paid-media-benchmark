// Deterministic pseudo-random helpers used only by the mock data layer.
// Given the same seed string (derived from the active cohort filters),
// these always produce the same "observations" — so switching a filter
// and switching it back returns to the same mock numbers, which is
// important for a believable prototype.
//
// Phase 38 note: fully disconnected from production since Phase 29 —
// see lib/mock/benchmarks.ts's Phase 38 header comment for why this
// file is still kept on disk rather than deleted.

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 PRNG
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(seed: string): () => number {
  return mulberry32(hashString(seed));
}

export function randomInRange(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

export function randomIntInRange(rand: () => number, min: number, max: number): number {
  return Math.floor(randomInRange(rand, min, max + 1));
}
