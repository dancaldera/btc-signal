import { calculateIndicators } from "./indicators";
import { getSignal, type SignalResult } from "./signal";
import type { PricePoint } from "./price";

type Trade = {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  entrySignal: SignalResult["type"];
  exitReason: string;
  pnlUsd: number;
  pnlPct: number;
};

type Position = {
  entryTime: number;
  entryPrice: number;
  qty: number;
  entrySignal: SignalResult["type"];
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopPct: number | null;
  highWater: number;
};

type BacktestResult = {
  asset: string;
  first: PricePoint;
  last: PricePoint;
  finalValue: number;
  buyHold: number;
  signals: number;
  trades: Trade[];
  position: Position | null;
};

const arg = (name: string, fallback: string) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};

const initialCapital = Number(arg("capital", "1000"));
const feePct = Number(arg("fee", "0.001"));
const days = Number(arg("days", "90"));
const assets = arg("assets", "bitcoin,ethereum,solana")
  .split(",")
  .map((asset) => asset.trim())
  .filter(Boolean);

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const when = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
};

const fetchHistory = async (asset: string): Promise<PricePoint[]> => {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(asset)}/market_chart?vs_currency=usd&days=${days}`;
  const chart = await getJson<{ prices: [number, number][] }>(url);
  const history = chart.prices
    .map(([timestamp, price]) => ({ timestamp, price }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.price));
  if (history.length < 240) throw new Error(`${asset}: not enough historical data returned`);
  return history;
};

const hourlyCloses = (history: PricePoint[]): PricePoint[] => {
  const buckets = new Map<number, PricePoint>();
  for (const point of history) {
    const timestamp = Math.floor(point.timestamp / 3600000) * 3600000;
    buckets.set(timestamp, { timestamp, price: point.price });
  }
  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
};

const closePosition = (
  position: Position,
  timestamp: number,
  price: number,
  cashBeforeExit: number,
  reason: string,
): { cash: number; trade: Trade } => {
  const grossExit = position.qty * price;
  const fee = grossExit * feePct;
  const cash = cashBeforeExit + grossExit - fee;
  const entryCost = position.qty * position.entryPrice * (1 + feePct);
  const pnlUsd = cash - cashBeforeExit - entryCost;
  const pnlPct = (price / position.entryPrice - 1) * 100 - feePct * 200;
  return {
    cash,
    trade: {
      entryTime: position.entryTime,
      exitTime: timestamp,
      entryPrice: position.entryPrice,
      exitPrice: price,
      entrySignal: position.entrySignal,
      exitReason: reason,
      pnlUsd,
      pnlPct,
    },
  };
};

const runBacktest = (asset: string, history: PricePoint[]): BacktestResult => {
  const candles = hourlyCloses(history);
  if (candles.length < 240) throw new Error(`${asset}: need at least 240 hourly candles for backtest`);

  const warmupIndex = 200;
  let cash = initialCapital;
  let position: Position | null = null;
  const trades: Trade[] = [];
  let signals = 0;

  for (let i = warmupIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const prior24 = candles[Math.max(0, i - 24)]!;
    const change24h = (candle.price / prior24.price - 1) * 100;
    const signal = getSignal(calculateIndicators(candles.slice(0, i + 1), candle.price, change24h, candle.timestamp));
    if (signal.action !== "WATCH") signals++;

    if (position) {
      position.highWater = Math.max(position.highWater, candle.price);
      const trailingStop = position.trailingStopPct ? position.highWater * (1 - position.trailingStopPct / 100) : null;
      const activeStop = Math.max(position.stopLoss ?? 0, trailingStop ?? 0);
      const exitReason =
        activeStop > 0 && candle.price <= activeStop
          ? "STOP"
          : position.takeProfit && candle.price >= position.takeProfit
            ? "TAKE_PROFIT"
            : signal.action === "EXIT_LONG"
              ? signal.type
              : null;

      if (exitReason) {
        const result = closePosition(position, candle.timestamp, candle.price, cash, exitReason);
        cash = result.cash;
        trades.push(result.trade);
        position = null;
      }
    }

    if (!position && signal.action === "ENTER_LONG") {
      const fee = cash * feePct;
      const spendable = cash - fee;
      position = {
        entryTime: candle.timestamp,
        entryPrice: candle.price,
        qty: spendable / candle.price,
        entrySignal: signal.type,
        stopLoss: signal.risk.stopLoss,
        takeProfit: signal.risk.takeProfit,
        trailingStopPct: signal.risk.trailingStopPct,
        highWater: candle.price,
      };
      cash = 0;
    }
  }

  const first = candles[warmupIndex]!;
  const last = candles[candles.length - 1]!;
  const finalValue = position ? cash + position.qty * last.price * (1 - feePct) : cash;
  const buyHoldQty = (initialCapital * (1 - feePct)) / first.price;
  const buyHold = buyHoldQty * last.price * (1 - feePct);
  return { asset, first, last, finalValue, buyHold, signals, trades, position };
};

const printResult = (result: BacktestResult) => {
  const strategyPct = (result.finalValue / initialCapital - 1) * 100;
  const buyHoldPct = (result.buyHold / initialCapital - 1) * 100;
  console.log(
    `${result.asset.padEnd(10)} Strategy ${money(result.finalValue).padStart(10)} ${pct(strategyPct).padStart(9)} | Buy & Hold ${money(result.buyHold).padStart(10)} ${pct(buyHoldPct).padStart(9)} | Delta ${money(result.finalValue - result.buyHold).padStart(10)} | signals ${String(result.signals).padStart(3)} | trades ${String(result.trades.length).padStart(2)}`,
  );
};

const main = async () => {
  console.log(`Multi-asset backtest: ${assets.join(", ")}, ${money(initialCapital)} per asset, ${(feePct * 100).toFixed(2)}% fee per side`);
  const results: BacktestResult[] = [];

  for (const asset of assets) {
    const history = await fetchHistory(asset);
    results.push(runBacktest(asset, history));
  }

  const firstWindow = results.map((result) => result.first.timestamp).reduce((a, b) => Math.max(a, b));
  const lastWindow = results.map((result) => result.last.timestamp).reduce((a, b) => Math.min(a, b));
  console.log(`Comparable window after 200h warmup: ${when(firstWindow)} → ${when(lastWindow)}`);
  console.log("");
  for (const result of results) printResult(result);

  const strategyTotal = results.reduce((sum, result) => sum + result.finalValue, 0);
  const buyHoldTotal = results.reduce((sum, result) => sum + result.buyHold, 0);
  const totalCapital = initialCapital * results.length;
  console.log("");
  console.log(
    `Equal-weight total: Strategy ${money(strategyTotal)} (${pct((strategyTotal / totalCapital - 1) * 100)}) | Buy & Hold ${money(buyHoldTotal)} (${pct((buyHoldTotal / totalCapital - 1) * 100)}) | Delta ${money(strategyTotal - buyHoldTotal)}`,
  );
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
