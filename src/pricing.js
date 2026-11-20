// Price metadata for tools sold by the bridge. x402 USDC prices are read from
// the public GET /catalog endpoint; credit costs are defined here in code so
// docs never have to parse the tool description text. Per-asset tools point at
// a representative catalog product because the catalog prices each product
// type uniformly.
export const TOOL_PRICING = Object.freeze({
  get_signal: Object.freeze({ catalogId: "signal", credits: 1 }),
  get_market_scan: Object.freeze({ catalogId: "market-scan", credits: 10 }),
  get_trend: Object.freeze({ catalogId: "trend-btc", credits: 1 }),
  get_regime: Object.freeze({ catalogId: "regime-btc", credits: 1 }),
  get_indicators: Object.freeze({ catalogId: "indicators-btc", credits: 1 }),
  get_regime_stats: Object.freeze({ catalogId: "regime-stats-btc", credits: 4 }),
  get_derivatives: Object.freeze({ catalogId: "derivatives-btc", credits: 1 }),
  get_derivatives_scan: Object.freeze({
    catalogId: "derivatives-scan",
    credits: 10,
  }),
});

export function getToolPricing(name) {
  return TOOL_PRICING[name] ?? null;
}
