/**
 * index.ts — Entry point
 *
 * Orchestrates the pipeline:
 *   1. Fetch BTC OHLCV market data from Binance
 *   2. Merge with stored local history
 *   3. Compute technical indicators (SMA, RSI, MACD)
 *   4. Generate a buy/sell/hold signal
 *   5. Render everything to the terminal
 */

import { calculateIndicators } from "./indicators";
import { loadHistory, mergeHistory, saveHistory } from "./history";
import { fetchMarketData } from "./price";
import { render, renderError } from "./display";
import { getSignal } from "./signal";

const main = async (): Promise<void> => {
  // Fetch fresh BTC OHLCV data from Binance
  const market = await fetchMarketData();

  // Merge with locally stored OHLCV history for better indicator accuracy
  const stored = await loadHistory();
  const history = mergeHistory(stored, market.history);
  await saveHistory(history);

  // Calculate indicators and generate signal
  const indicators = calculateIndicators(history, market.currentPrice, market.change24h);
  console.log(render(indicators, getSignal(indicators)));
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(renderError(message));
  process.exitCode = 1;
}
