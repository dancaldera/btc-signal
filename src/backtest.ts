import { loadHistory } from "./history";
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

const arg = (name: string, fallback: string) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};

const initialCapital = Number(arg("capital", "1000"));
const feePct = Number(arg("fee", "0.001")); // 0.1% per side by default
const days = Number(arg("days", "8"));

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const when = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";

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

const main = async () => {
  const candles = hourlyCloses(await loadHistory());
  if (candles.length < 240) throw new Error("Need at least 240 hourly candles for backtest");

  const end = candles[candles.length - 1]!.timestamp;
  const start = end - days * 24 * 3600000;
  const startIndex = candles.findIndex((c) => c.timestamp >= start);
  const warmupIndex = Math.max(200, startIndex);

  let cash = initialCapital;
  let position: Position | null = null;
  const trades: Trade[] = [];
  const signals: { timestamp: number; signal: SignalResult; price: number }[] = [];

  for (let i = warmupIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const prior24 = candles[Math.max(0, i - 24)]!;
    const change24h = (candle.price / prior24.price - 1) * 100;
    const signal = getSignal(calculateIndicators(candles.slice(0, i + 1), candle.price, change24h, candle.timestamp));
    if (signal.action !== "WATCH") signals.push({ timestamp: candle.timestamp, signal, price: candle.price });

    if (position) {
      position.highWater = Math.max(position.highWater, candle.price);
      const trailingStop = position.trailingStopPct
        ? position.highWater * (1 - position.trailingStopPct / 100)
        : null;
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

  const last = candles[candles.length - 1]!;
  const finalValue = position ? cash + position.qty * last.price * (1 - feePct) : cash;
  const first = candles[warmupIndex]!;
  const buyHoldQty = (initialCapital * (1 - feePct)) / first.price;
  const buyHold = buyHoldQty * last.price * (1 - feePct);

  console.log(`Backtest: last ${days} days, ${money(initialCapital)} initial, ${(feePct * 100).toFixed(2)}% fee per side`);
  console.log(`Window: ${when(first.timestamp)} → ${when(last.timestamp)}`);
  console.log("");
  console.log(`Strategy: ${money(finalValue)} (${pct((finalValue / initialCapital - 1) * 100)})`);
  console.log(`Buy & Hold: ${money(buyHold)} (${pct((buyHold / initialCapital - 1) * 100)})`);
  console.log(`Delta: ${money(finalValue - buyHold)}`);
  console.log("");
  console.log(`Actionable signals: ${signals.length}`);
  console.log(`Closed trades: ${trades.length}`);

  if (trades.length > 0) {
    console.log("");
    for (const [index, trade] of trades.entries()) {
      console.log(
        `${index + 1}. ${trade.entrySignal} ${when(trade.entryTime)} @ ${money(trade.entryPrice)} → ${trade.exitReason} ${when(trade.exitTime)} @ ${money(trade.exitPrice)} = ${money(trade.pnlUsd)} (${pct(trade.pnlPct)})`,
      );
    }
  }

  if (position) {
    console.log("");
    console.log(`Open position from ${when(position.entryTime)} @ ${money(position.entryPrice)}; marked at ${money(last.price)}.`);
  }
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
