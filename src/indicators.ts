/**
 * indicators.ts — Technical indicator calculations
 *
 * Works from CoinGecko price-only history, resampled into hourly candles.
 * Because the free endpoint used here does not provide OHLCV, volatility is
 * estimated from close-to-close returns instead of true ATR, and volume is not
 * used until a richer data source is added.
 */

import type { PricePoint } from "./price";

export type Indicators = {
  currentPrice: number;
  change24h: number;
  sma20: number;
  sma50: number;
  sma200: number;
  sma200SlopePct: number;
  prevSma20: number;
  prevSma50: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  prevMacd: number;
  prevMacdSignal: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  bollingerPosition: number; // 0 = lower band, 1 = upper band
  volatility20: number;      // avg absolute hourly return, percentage
  volatility100: number;     // longer baseline, percentage
  volatilityRatio: number;   // current / baseline
  momentum7dPct: number;
  trend4h: "UP" | "DOWN" | "FLAT";
  trend1d: "UP" | "DOWN" | "FLAT";
};

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

const sma = (values: number[], period: number, offset = 0): number => {
  const end = offset ? values.length - offset : values.length;
  if (end < period) return NaN;
  return avg(values.slice(end - period, end));
};

const stddev = (values: number[]): number => {
  if (values.length === 0) return NaN;
  const mean = avg(values);
  return Math.sqrt(avg(values.map((v) => (v - mean) ** 2)));
};

const ema = (values: number[], period: number): number[] => {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
};

const rsiWilder = (values: number[], period = 14): number => {
  if (values.length < period + 1) return 50;
  const deltas = values.slice(1).map((val, i) => val - values[i]!);
  const gains = deltas.map((d) => Math.max(d, 0));
  const losses = deltas.map((d) => Math.max(-d, 0));

  let avgGain = avg(gains.slice(0, period));
  let avgLoss = avg(losses.slice(0, period));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]!) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]!) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const resampleToHourly = (history: PricePoint[]): number[] => {
  const hourlyBuckets = new Map<number, number>();
  for (const point of history) {
    const hour = Math.floor(point.timestamp / 3600000) * 3600000;
    hourlyBuckets.set(hour, point.price);
  }
  return Array.from(hourlyBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([, price]) => price);
};

const avgAbsReturn = (values: number[], period: number): number => {
  if (values.length < period + 1) return NaN;
  const slice = values.slice(-(period + 1));
  const returns = slice.slice(1).map((price, i) => Math.abs((price / slice[i]! - 1) * 100));
  return avg(returns);
};

const trendFromChange = (changePct: number): "UP" | "DOWN" | "FLAT" => {
  if (changePct > 0.35) return "UP";
  if (changePct < -0.35) return "DOWN";
  return "FLAT";
};

export const calculateIndicators = (
  history: PricePoint[],
  currentPrice: number,
  change24h: number,
  currentTimestamp = Date.now(),
): Indicators => {
  const prices = resampleToHourly([...history, { timestamp: currentTimestamp, price: currentPrice }]);
  if (prices.length < 200) throw new Error("Need at least 200 hourly data points");

  const emaShort = ema(prices, 12);
  const emaLong = ema(prices, 26);
  const macdLine = emaShort.map((val, i) => val - emaLong[i]!);
  const macdSignalLine = ema(macdLine.slice(25), 9);

  const macd = macdLine[macdLine.length - 1]!;
  const macdSignal = macdSignalLine[macdSignalLine.length - 1]!;
  const prevMacd = macdLine[macdLine.length - 2]!;
  const prevMacdSignal = macdSignalLine[macdSignalLine.length - 2]!;

  const last20 = prices.slice(-20);
  const bollingerMiddle = avg(last20);
  const bandWidth = stddev(last20) * 2;
  const bollingerLower = bollingerMiddle - bandWidth;
  const bollingerUpper = bollingerMiddle + bandWidth;
  const bollingerPosition = bandWidth === 0 ? 0.5 : (currentPrice - bollingerLower) / (bollingerUpper - bollingerLower);

  const volatility20 = avgAbsReturn(prices, 20);
  const volatility100 = avgAbsReturn(prices, 100);
  const fourHoursAgo = prices[prices.length - 5] ?? prices[0]!;
  const oneDayAgo = prices[prices.length - 25] ?? prices[0]!;
  const sevenDaysAgo = prices[prices.length - 169] ?? prices[0]!;

  return {
    currentPrice,
    change24h,
    sma20: sma(prices, 20),
    sma50: sma(prices, 50),
    sma200: sma(prices, 200),
    sma200SlopePct: ((sma(prices, 200) / sma(prices, 200, 24)) - 1) * 100,
    prevSma20: sma(prices, 20, 1),
    prevSma50: sma(prices, 50, 1),
    rsi: rsiWilder(prices),
    macd,
    macdSignal,
    macdHist: macd - macdSignal,
    prevMacd,
    prevMacdSignal,
    bollingerUpper,
    bollingerMiddle,
    bollingerLower,
    bollingerPosition,
    volatility20,
    volatility100,
    volatilityRatio: volatility100 > 0 ? volatility20 / volatility100 : 1,
    momentum7dPct: (currentPrice / sevenDaysAgo - 1) * 100,
    trend4h: trendFromChange((currentPrice / fourHoursAgo - 1) * 100),
    trend1d: trendFromChange((currentPrice / oneDayAgo - 1) * 100),
  };
};
