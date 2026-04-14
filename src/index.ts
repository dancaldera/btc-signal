import { calculateIndicators } from "./indicators";
import { loadHistory, mergeHistory, saveHistory } from "./history";
import { fetchMarketData } from "./price";
import { render, renderError } from "./display";
import { getSignal } from "./signal";

const main = async (): Promise<void> => {
  const market = await fetchMarketData();
  const stored = await loadHistory();
  const latest = [...market.history, { timestamp: Date.now(), price: market.currentPrice }];
  const history = mergeHistory(stored, latest);
  await saveHistory(history);
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
