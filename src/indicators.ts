/**
 * indicators.ts — Technical indicator calculations
 *
 * All indicators are computed on resampled hourly candles to ensure
 * consistent periods regardless of CoinGecko's irregular data spacing.
 *
 * Indicators calculated:
 *   - SMA 20 / SMA 50  → trend direction (golden/death cross)
 *   - RSI (14)          → momentum via Wilder smoothing
 *   - MACD              → EMA12 - EMA26, signal = EMA9 of MACD
 */

import type { PricePoint } from "./price";

/** All computed indicators bundled together for the signal engine */
export type Indicators = {
  currentPrice: number;
  change24h: number;
  sma20: number;
  sma50: number;
  prevSma20: number;  // previous candle's SMA — used to detect crossovers
  prevSma50: number;
  rsi: number;
  macd: number;       // MACD line = EMA12 - EMA26
  macdSignal: number; // Signal line = EMA9 of MACD
  macdHist: number;   // Histogram = MACD - Signal (positive = bullish)
};

/** Simple average of an array of numbers */
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Simple Moving Average. Offset=0 gives current SMA, offset=1 gives
 * the previous period's SMA (for crossover detection).
 */
const sma = (values: number[], period: number, offset = 0): number =>
  avg(values.slice(values.length - period - offset, offset ? values.length - offset : undefined));

/**
 * Exponential Moving Average. Returns the full EMA series so MACD
 * can compute its signal line from it. Multiplier k = 2/(period+1).
 */
const ema = (values: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
};

/**
 * RSI using Wilder's smoothing method (the industry standard).
 *
 * 1. Seed: simple average of first `period` gains/losses
 * 2. Smooth: avgGain = (prev * (period-1) + current) / period
 * 3. RS = avgGain / avgLoss → RSI = 100 - 100/(1+RS)
 *
 * Returns 50 (neutral) if not enough data. Returns 100 if avgLoss is 0.
 */
const rsiWilder = (values: number[], period = 14): number => {
  if (values.length < period + 1) return 50;
  const deltas = values.slice(1).map((val, i) => val - values[i]);
  const gains = deltas.map(d => Math.max(d, 0));
  const losses = deltas.map(d => Math.max(-d, 0));

  // Seed with simple average of first `period` values
  let avgGain = avg(gains.slice(0, period));
  let avgLoss = avg(losses.slice(0, period));

  // Apply Wilder smoothing for remaining values
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

/**
 * Resamples irregular CoinGecko price points into consistent hourly candles.
 * Groups by hour (floor timestamp to hour), takes the last price in each bucket.
 * This ensures SMA/EMA periods are truly N hours, not N random data points.
 */
const resampleToHourly = (history: PricePoint[]): number[] => {
  const hourlyBuckets = new Map<number, number>();
  for (const point of history) {
    const hour = Math.floor(point.timestamp / 3600000) * 3600000;
    hourlyBuckets.set(hour, point.price); // last price in each hour wins
  }
  return Array.from(hourlyBuckets.values());
};

/**
 * Main entry point — takes raw history + current price and returns
 * all computed indicators. Appends current price to history before
 * resampling so the latest hour is included.
 */
export const calculateIndicators = (
  history: PricePoint[],
  currentPrice: number,
  change24h: number,
): Indicators => {
  const prices = resampleToHourly([...history, { timestamp: Date.now(), price: currentPrice }]);
  if (prices.length < 51) throw new Error("Need at least 51 hourly data points");

  // MACD: EMA12 - EMA26, then EMA9 of that = signal line
  const shortPeriod = 12, longPeriod = 26;
  const emaShort = ema(prices, shortPeriod);
  const emaLong = ema(prices, longPeriod);
  const macdLine = emaShort.map((val, i) => val - emaLong[i]);
  // MACD signal starts after EMA26 has enough data
  const macdSignalLine = ema(macdLine.slice(longPeriod - 1), 9);

  const currentMacd = macdLine[macdLine.length - 1];
  const currentSignal = macdSignalLine[macdSignalLine.length - 1];

  return {
    currentPrice,
    change24h,
    sma20: sma(prices, 20),
    sma50: sma(prices, 50),
    prevSma20: sma(prices, 20, 1),
    prevSma50: sma(prices, 50, 1),
    rsi: rsiWilder(prices),
    macd: currentMacd,
    macdSignal: currentSignal,
    macdHist: currentMacd - currentSignal,
  };
};
