import type { PricePoint } from "./price";

export type Indicators = {
  currentPrice: number;
  change24h: number;
  sma20: number;
  sma50: number;
  prevSma20: number;
  prevSma50: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
};

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const sma = (values: number[], period: number, offset = 0): number =>
  avg(values.slice(values.length - period - offset, offset ? values.length - offset : undefined));

const ema = (values: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
};

const rsiWilder = (values: number[], period = 14): number => {
  if (values.length < period + 1) return 50;
  const deltas = values.slice(1).map((val, i) => val - values[i]);
  const gains = deltas.map(d => Math.max(d, 0));
  const losses = deltas.map(d => Math.max(-d, 0));

  let avgGain = avg(gains.slice(0, period));
  let avgLoss = avg(losses.slice(0, period));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
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
  return Array.from(hourlyBuckets.values());
};

export const calculateIndicators = (
  history: PricePoint[],
  currentPrice: number,
  change24h: number,
): Indicators => {
  const prices = resampleToHourly([...history, { timestamp: Date.now(), price: currentPrice }]);
  if (prices.length < 51) throw new Error("Need at least 51 hourly data points");

  const shortPeriod = 12, longPeriod = 26;
  const emaShort = ema(prices, shortPeriod);
  const emaLong = ema(prices, longPeriod);
  const macdLine = emaShort.map((val, i) => val - emaLong[i]);
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
