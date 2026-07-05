/**
 * Deterministic PRNG so mock data looks the same across server restarts within a demo, instead
 * of reshuffling on every request. Seed it with a string key (e.g. `${campaignId}:${platform}`)
 * so each campaign/platform pair gets its own stable but distinct sequence.
 */
export function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

export type RandomFn = () => number;

export function mulberry32(seed: number): RandomFn {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRandom(key: string): RandomFn {
  return mulberry32(hashStringToSeed(key));
}

/** Uniform float in [min, max). */
export function randomInRange(rng: RandomFn, min: number, max: number): number {
  return min + rng() * (max - min);
}
