/**
 * Deterministic PRNG (mulberry32). Not cryptographically secure and not meant
 * to be: it exists for reproducible shuffles and replays. Seeds are produced
 * by infrastructure (crypto.getRandomValues) at match start.
 *
 * @implements {import("./RandomSource.contract.js").RandomSource}
 */
export class SeededRandom {
  /** @type {number} 32-bit unsigned state */
  #state;

  /** @param {number} seed Any integer; reduced to 32 bits. */
  constructor(seed) {
    if (!Number.isInteger(seed)) {
      throw new TypeError("SeededRandom: seed must be an integer");
    }
    this.#state = seed >>> 0;
  }

  /**
   * Restores a generator from a state previously returned by getState().
   * @param {number} state
   */
  static fromState(state) {
    return new SeededRandom(state);
  }

  /** @returns {number} Uniform float in [0, 1). */
  nextFloat() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * @param {number} maxExclusive Positive integer.
   * @returns {number} Uniform integer in [0, maxExclusive).
   */
  nextInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("SeededRandom.nextInt: maxExclusive must be a positive integer");
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  /**
   * Fisher–Yates shuffle into a new array.
   * @template T
   * @param {readonly T[]} items
   * @returns {T[]}
   */
  shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.nextInt(index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  getState() {
    return this.#state;
  }
}
