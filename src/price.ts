export type PricePoint = { timestamp: number; price: number };
export type MarketData = { currentPrice: number; change24h: number; history: PricePoint[] };

const HIST_URL =
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90";
const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
};

export const fetchMarketData = async (): Promise<MarketData> => {
  const [chart, current] = await Promise.all([
    getJson<{ prices: [number, number][] }>(HIST_URL),
    getJson<{ bitcoin?: { usd?: number; usd_24h_change?: number } }>(PRICE_URL),
  ]);
  const btc = current.bitcoin;
  if (!btc?.usd || typeof btc.usd_24h_change !== "number") throw new Error("Invalid current price payload");
  const history = chart.prices
    .map(([timestamp, price]) => ({ timestamp, price }))
    .filter((p) => Number.isFinite(p.price))
    .slice(-500);
  if (history.length < 50) throw new Error("Not enough historical data returned");
  return { currentPrice: btc.usd, change24h: btc.usd_24h_change, history };
};
