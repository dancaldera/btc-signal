/**
 * history.ts — Local BTC OHLCV history persistence
 *
 * Stores Binance BTCUSDT hourly candles in ~/.btc-signal/ohlcv-history.json.
 * Keeps a rolling window to bound file size and deduplicates by candle open
 * timestamp when merging fresh data with stored history.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Candle } from "./price";

const FILE = join(homedir(), ".btc-signal", "ohlcv-history.json");
const MAX_CANDLES = 2400;

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

export const loadHistory = async (): Promise<Candle[]> => {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Candle[];
    return parsed.filter(isValidCandle);
  } catch {
    return [];
  }
};

export const mergeHistory = (base: Candle[], extra: Candle[]): Candle[] =>
  [...new Map([...base, ...extra].filter(isValidCandle).map((c) => [c.timestamp, c] as const)).values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_CANDLES);

export const saveHistory = async (history: Candle[]): Promise<void> => {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(history, null, 2));
};
