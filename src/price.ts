/**
 * price.ts — BTC OHLCV market data fetcher
 *
 * Uses Binance public BTCUSDT hourly klines for real OHLCV candles. This is
 * materially better than CoinGecko price-only samples because indicators can
 * use true highs/lows, ATR-style volatility, and volume confirmation.
 */

export type Candle = {
  timestamp: number; // open time, ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // base BTC volume
};

export type MarketData = { currentPrice: number; change24h: number; history: Candle[] };

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const HOUR_MS = 3600000;
const HISTORY_DAYS = 90;
const MAX_CANDLES = 2400;

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getJson = async <T>(url: string): Promise<T> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;

    if (res.status !== 429 && res.status < 500) throw new Error(`Binance request failed: ${res.status} ${res.statusText}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw new Error("Binance request failed after retries");
};

const parseKline = (row: BinanceKline): Candle => ({
  timestamp: row[0],
  open: Number(row[1]),
  high: Number(row[2]),
  low: Number(row[3]),
  close: Number(row[4]),
  volume: Number(row[5]),
});

const isValidCandle = (c: Candle): boolean =>
  Number.isFinite(c.timestamp) &&
  Number.isFinite(c.open) &&
  Number.isFinite(c.high) &&
  Number.isFinite(c.low) &&
  Number.isFinite(c.close) &&
  Number.isFinite(c.volume) &&
  c.high >= Math.max(c.open, c.close) &&
  c.low <= Math.min(c.open, c.close) &&
  c.close > 0;

export const fetchMarketData = async (): Promise<MarketData> => {
  const endTime = Date.now();
  let startTime = endTime - HISTORY_DAYS * 24 * HOUR_MS;
  const candles: Candle[] = [];

  while (startTime < endTime && candles.length < MAX_CANDLES) {
    const url = new URL(BINANCE_KLINES_URL);
    url.searchParams.set("symbol", "BTCUSDT");
    url.searchParams.set("interval", "1h");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("startTime", String(startTime));
    url.searchParams.set("endTime", String(endTime));

    const batch = (await getJson<BinanceKline[]>(url.toString())).map(parseKline).filter(isValidCandle);
    if (batch.length === 0) break;

    candles.push(...batch);
    startTime = batch[batch.length - 1]!.timestamp + HOUR_MS;
    if (batch.length < 1000) break;
  }

  const history = [...new Map(candles.map((c) => [c.timestamp, c] as const)).values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_CANDLES);

  if (history.length < 240) throw new Error("Not enough BTCUSDT hourly OHLCV candles returned");

  const currentPrice = history[history.length - 1]!.close;
  const prior24 = history[Math.max(0, history.length - 25)]!;
  const change24h = (currentPrice / prior24.close - 1) * 100;

  return { currentPrice, change24h, history };
};
