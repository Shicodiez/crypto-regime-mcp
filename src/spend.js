export function createSpendTracker(maxSpendUsdc) {
  let spentUsdc = 0;
  const epsilon = 1e-9;

  return {
    get maxUsdc() {
      return maxSpendUsdc;
    },
    get spentUsdc() {
      return spentUsdc;
    },
    remainingUsdc() {
      return Math.max(
        0,
        Math.round((maxSpendUsdc - spentUsdc) * 1e6) / 1e6,
      );
    },
    canSpend(amountUsdc) {
      return (
        Number.isFinite(amountUsdc) &&
        amountUsdc >= 0 &&
        spentUsdc + amountUsdc <= maxSpendUsdc + epsilon
      );
    },
    record(amountUsdc) {
      if (!Number.isFinite(amountUsdc) || amountUsdc < 0) {
        throw new Error("amountUsdc must be a non-negative finite number");
      }
      spentUsdc = Math.round((spentUsdc + amountUsdc) * 1e6) / 1e6;
    },
  };
}

export function usdcFromAtomic(amount, decimals = 6) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value / 10 ** decimals;
}
