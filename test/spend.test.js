import assert from "node:assert/strict";
import test from "node:test";

import { createSpendTracker, usdcFromAtomic } from "../src/spend.js";

test("tracks a session cap across calls", () => {
  const tracker = createSpendTracker(1);

  assert.equal(tracker.canSpend(0.01), true);
  tracker.record(0.01);
  assert.equal(tracker.spentUsdc, 0.01);

  assert.equal(tracker.canSpend(0.98), true);
  tracker.record(0.98);
  assert.equal(tracker.spentUsdc, 0.99);

  assert.equal(tracker.canSpend(0.02), false);
  assert.equal(tracker.remainingUsdc(), 0.01);
});

test("blocks the first payment when the cap is zero", () => {
  const tracker = createSpendTracker(0);
  assert.equal(tracker.canSpend(0.005), false);
});

test("rejects negative and non-finite amounts", () => {
  const tracker = createSpendTracker(1);
  assert.equal(tracker.canSpend(-1), false);
  assert.equal(tracker.canSpend(Number.NaN), false);
  assert.throws(() => tracker.record(-0.01), /non-negative/);
});

test("converts USDC atomic units", () => {
  assert.equal(usdcFromAtomic("5000"), 0.005);
  assert.equal(usdcFromAtomic("10000"), 0.01);
  assert.equal(usdcFromAtomic("0"), 0);
  assert.equal(usdcFromAtomic("nope"), null);
});
