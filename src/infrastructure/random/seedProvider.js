/**
 * Produces the match seed. Uses the platform CSPRNG so seeds are
 * unpredictable; the seed is then the only source of randomness for the
 * whole match (see domain/random/SeededRandom.js).
 */

/** @returns {number} 32-bit unsigned integer */
export function createSeed() {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0];
}
