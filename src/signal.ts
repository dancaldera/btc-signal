/**
 * signal.ts — Decision engine
 *
 * Maps computed indicators to actionable buy/sell/hold signals.
 *
 * Signal hierarchy (from strongest to weakest):
 *   STRONG BUY  → RSI deeply oversold + MACD bullish crossover
 *   BUY         → RSI oversold + trend confirmation (SMA or MACD)
 *   WEAK BUY    → RSI mildly oversold + bullish SMA trend
 *   HOLD        → no consensus among indicators
 *   WEAK SELL   → RSI mildly overbought + bearish SMA trend
 *   SELL        → RSI overbought + negative trend (SMA or MACD)
 *   STRONG SELL → RSI deeply overbought + MACD bearish crossover
 *
 * Confidence is based on how many indicators agree (max 3: RSI, SMA trend, MACD).
 * More agreement = higher confidence the signal is right.
 */

import type { Indicators } from "./indicators";

export type SignalType = "STRONG BUY" | "BUY" | "WEAK BUY" | "HOLD" | "WEAK SELL" | "SELL" | "STRONG SELL";
export type SignalResult = { type: SignalType; icon: string; confidence: number; reason: string };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const getSignal = (i: Indicators): SignalResult => {
  // Pre-compute directional signals from MACD and SMA
  const bullishMacd = i.macd > i.macdSignal && i.macdHist > 0;
  const bearishMacd = i.macd < i.macdSignal && i.macdHist < 0;
  const smaTrend = i.sma20 > i.sma50;       // true = golden cross zone
  const macdHistPositive = i.macdHist > 0;   // true = bullish momentum

  // ── BUY SIGNALS ──────────────────────────────────────────────

  // STRONG BUY: RSI < 25 AND bullish MACD crossover
  if (i.rsi < 25 && bullishMacd) {
    const indicators = [i.rsi < 25, smaTrend, bullishMacd].filter(Boolean).length;
    return {
      type: "STRONG BUY",
      icon: "🟢🟢",
      confidence: clamp(85 + indicators * 5),
      reason: "Strong oversold RSI with bullish MACD crossover."
    };
  }

  // BUY: RSI < 35 AND (SMA20 > SMA50 OR MACD histogram positive)
  if (i.rsi < 35 && (smaTrend || macdHistPositive)) {
    const indicators = [i.rsi < 35, smaTrend, macdHistPositive].filter(Boolean).length;
    return {
      type: "BUY",
      icon: "🟢",
      confidence: clamp(70 + indicators * 5),
      reason: "Oversold RSI with positive trend momentum."
    };
  }

  // WEAK BUY: RSI < 40 AND SMA20 > SMA50
  if (i.rsi < 40 && smaTrend) {
    const indicators = [i.rsi < 40, smaTrend, macdHistPositive].filter(Boolean).length;
    return {
      type: "WEAK BUY",
      icon: "🟢",
      confidence: clamp(50 + indicators * 5),
      reason: "Moderately oversold RSI with bullish SMA trend."
    };
  }

  // ── SELL SIGNALS ─────────────────────────────────────────────

  // STRONG SELL: RSI > 75 AND bearish MACD crossover
  if (i.rsi > 75 && bearishMacd) {
    const indicators = [i.rsi > 75, !smaTrend, bearishMacd].filter(Boolean).length;
    return {
      type: "STRONG SELL",
      icon: "🔴🔴",
      confidence: clamp(85 + indicators * 5),
      reason: "Strong overbought RSI with bearish MACD crossover."
    };
  }

  // SELL: RSI > 65 AND (SMA20 < SMA50 OR MACD histogram negative)
  if (i.rsi > 65 && (!smaTrend || i.macdHist < 0)) {
    const indicators = [i.rsi > 65, !smaTrend, i.macdHist < 0].filter(Boolean).length;
    return {
      type: "SELL",
      icon: "🔴",
      confidence: clamp(70 + indicators * 5),
      reason: "Overbought RSI with negative trend momentum."
    };
  }

  // WEAK SELL: RSI > 60 AND SMA20 < SMA50
  if (i.rsi > 60 && !smaTrend) {
    const indicators = [i.rsi > 60, !smaTrend, i.macdHist < 0].filter(Boolean).length;
    return {
      type: "WEAK SELL",
      icon: "🔴",
      confidence: clamp(50 + indicators * 5),
      reason: "Moderately overbought RSI with bearish SMA trend."
    };
  }

  // ── HOLD (default) ───────────────────────────────────────────

  // No strong consensus — confidence reflects mild directional bias
  const indicators = [smaTrend, macdHistPositive, i.rsi < 50].filter(Boolean).length;
  const confidence = clamp(30 + indicators * 10);
  return {
    type: "HOLD",
    icon: "🟡",
    confidence,
    reason: smaTrend
      ? "Mixed signals - trend is positive but conditions not strong enough for entry."
      : "Mixed signals - waiting for clearer directional momentum.",
  };
};
