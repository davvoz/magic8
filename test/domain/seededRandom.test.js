import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RANDOM_SOURCE_METHODS } from "../../src/domain/random/RandomSource.contract.js";
import { SeededRandom } from "../../src/domain/random/SeededRandom.js";

describe("SeededRandom", () => {
  it("implements the RandomSource contract", () => {
    const random = new SeededRandom(1);
    for (const method of RANDOM_SOURCE_METHODS) {
      assert.equal(typeof random[method], "function", method);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const sequenceA = Array.from({ length: 20 }, () => a.nextInt(1000));
    const sequenceB = Array.from({ length: 20 }, () => b.nextInt(1000));
    assert.deepEqual(sequenceA, sequenceB);
    assert.notDeepEqual(sequenceA, Array.from({ length: 20 }, () => new SeededRandom(54321).nextInt(1000)));
  });

  it("resumes from a saved state", () => {
    const original = new SeededRandom(7);
    original.nextInt(10);
    const resumed = SeededRandom.fromState(original.getState());
    assert.equal(original.nextInt(1000), resumed.nextInt(1000));
  });

  it("stays within range and covers all values", () => {
    const random = new SeededRandom(99);
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      const value = random.nextInt(6);
      assert.ok(value >= 0 && value < 6);
      seen.add(value);
    }
    assert.equal(seen.size, 6);
  });

  it("rejects invalid arguments", () => {
    assert.throws(() => new SeededRandom(1.5), TypeError);
    assert.throws(() => new SeededRandom(1).nextInt(0), RangeError);
    assert.throws(() => new SeededRandom(1).nextInt("5"), RangeError);
  });

  it("shuffle returns a permutation and leaves the input untouched", () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const shuffled = new SeededRandom(3).shuffle(input);
    assert.deepEqual([...shuffled].sort((x, y) => x - y), [...input]);
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.notDeepEqual(shuffled, [...input]);
  });
});
