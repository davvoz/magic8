/**
 * Contract for the engine's only source of randomness.
 *
 * Implementations must be deterministic given their state so that a match can
 * be replayed from (seed, commands[]). The domain never calls Math.random.
 *
 * @typedef {object} RandomSource
 * @property {(maxExclusive: number) => number} nextInt Uniform integer in [0, maxExclusive).
 * @property {<T>(items: readonly T[]) => T[]} shuffle Returns a new shuffled array; the input is not modified.
 * @property {() => number} getState Serialisable state for snapshots and replays.
 */

/** Method names a RandomSource must implement (used by assertImplements at wiring time). */
export const RANDOM_SOURCE_METHODS = Object.freeze(["nextInt", "shuffle", "getState"]);
