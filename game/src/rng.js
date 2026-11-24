// rng.js — deterministic randomness for Sirena City.
// A tiny mulberry32 generator: the same seed always builds the same city,
// which keeps the staged screenshot scenes repeatable and the smoke test honest.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max], both ends included.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  // A stable 0..1 hash of three integers, for per-window lighting and other
  // details that must look random yet never flicker between frames.
  static hash3(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
}
