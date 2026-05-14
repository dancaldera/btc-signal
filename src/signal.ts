/**
 * signal.ts — Decision engine
 *
 * Weak BUY/SELL entries become WATCH/HOLD. Actionable signals require
 * indicator agreement plus context: trend, Bollinger position, ATR volatility,
 * and enough real BTC volume from OHLCV candles.
 */

import type { Indicators } from "./indicators";

export type SignalType = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
export type Action = "ENTER_LONG" | "EXIT_LONG" | "WATCH";

export type SignalResult = {
  type: SignalType;
  action: Action;
  icon: string;
  confidence: number;
  shouldNotify: boolean;
  reason: string;
  risk: {
    stopLoss: number | null;
    takeProfit: number | null;
    trailingStopPct: number | null;
  };
  notes: string[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const roundMoney = (n: number) => Math.round(n * 100) / 100;

const longRisk = (
  price: number,
  confidence: number,
  atr20: number,
  mode: "reversal" | "trend" = "reversal",
): SignalResult["risk"] => {
  const safeAtr = Number.isFinite(atr20) && atr20 > 0 ? atr20 : price * 0.01;

  if (mode === "trend") {
    return {
      stopLoss: roundMoney(Math.max(price * 0.85, price - safeAtr * 4)),
      takeProfit: null,
      trailingStopPct: Math.max(6, Math.min(20, (safeAtr / price) * 100 * 4)),
    };
  }

  const minStopPct = confidence >= 90 ? 0.025 : 0.02;
  const stopDistance = Math.max(price * minStopPct, safeAtr * 1.5);
  return {
    stopLoss: roundMoney(price - stopDistance),
    takeProfit: roundMoney(price + stopDistance * 2),
    trailingStopPct: Math.max(2, (stopDistance / price) * 100),
  };
};

const noRisk = (): SignalResult["risk"] => ({ stopLoss: null, takeProfit: null, trailingStopPct: null });

export const getSignal = (i: Indicators): SignalResult => {
  const bullishMacd = i.macd > i.macdSignal && i.macdHist > 0;
  const bearishMacd = i.macd < i.macdSignal && i.macdHist < 0;
  const bullishMacdCross = i.prevMacd <= i.prevMacdSignal && bullishMacd;
  const bearishMacdCross = i.prevMacd >= i.prevMacdSignal && bearishMacd;
  const longTermUp = i.currentPrice > i.sma200 && i.sma200SlopePct >= 0;
  const smaBullish = i.sma20 > i.sma50 && longTermUp;
  const smaBearish = i.sma20 < i.sma50 && i.currentPrice < i.sma200;
  const oversold = i.rsi < 35;
  const deeplyOversold = i.rsi < 28;
  const overbought = i.rsi > 65;
  const deeplyOverbought = i.rsi > 75;
  const nearLowerBand = i.bollingerPosition < 0.25;
  const nearUpperBand = i.bollingerPosition > 0.75;
  const enoughVolatility = i.volatilityRatio >= 0.85 && i.volatility20 >= 0.35;
  const enoughVolume = i.volumeRatio >= 0.75;
  const higherTrendBullish = i.trend4h !== "DOWN" && i.trend1d !== "DOWN";
  const higherTrendBearish = i.trend4h !== "UP" && i.trend1d !== "UP";
  const trendContinuationLong =
    smaBullish &&
    i.currentPrice > i.sma50 &&
    i.currentPrice > i.sma20 &&
    i.rsi >= 50 &&
    i.rsi < 72 &&
    i.trend4h !== "DOWN" &&
    i.trend1d === "UP" &&
    i.momentum7dPct > 0 &&
    enoughVolatility &&
    enoughVolume &&
    i.bollingerPosition < 0.95 &&
    bullishMacd;

  const buyScore = [oversold || trendContinuationLong, smaBullish, bullishMacd, nearLowerBand, enoughVolatility, enoughVolume, higherTrendBullish]
    .filter(Boolean).length;
  const sellScore = [overbought, smaBearish, bearishMacd, nearUpperBand, enoughVolatility, enoughVolume, higherTrendBearish]
    .filter(Boolean).length;

  const notes = [
    enoughVolatility
      ? `ATR volatility is tradable (${i.volatilityRatio.toFixed(2)}x recent baseline).`
      : `ATR volatility is low (${i.volatilityRatio.toFixed(2)}x recent baseline), avoid forcing entries.`,
    enoughVolume
      ? `Volume is acceptable (${i.volumeRatio.toFixed(2)}x baseline).`
      : `Volume is thin (${i.volumeRatio.toFixed(2)}x baseline), lower confidence.`,
    `4h trend: ${i.trend4h}; 1d trend: ${i.trend1d}.`,
    nearLowerBand ? "Price is near the lower Bollinger band." : nearUpperBand ? "Price is near the upper Bollinger band." : "Price is inside the Bollinger range.",
  ];

  if (deeplyOversold && bullishMacdCross && nearLowerBand && enoughVolatility && enoughVolume && higherTrendBullish) {
    const confidence = clamp(82 + buyScore * 3);
    return {
      type: "STRONG BUY",
      action: "ENTER_LONG",
      icon: "🟢🟢",
      confidence,
      shouldNotify: true,
      reason: "High-conviction reversal: deeply oversold RSI, bullish MACD cross, lower Bollinger confirmation, tradable ATR, and acceptable volume.",
      risk: longRisk(i.currentPrice, confidence, i.atr20),
      notes,
    };
  }

  if (oversold && bullishMacd && (smaBullish || nearLowerBand) && enoughVolatility && enoughVolume && higherTrendBullish && buyScore >= 5) {
    const confidence = clamp(66 + buyScore * 4);
    return {
      type: "BUY",
      action: "ENTER_LONG",
      icon: "🟢",
      confidence,
      shouldNotify: confidence >= 70,
      reason: "Actionable long setup: oversold RSI with bullish momentum, real volume, and enough ATR movement.",
      risk: longRisk(i.currentPrice, confidence, i.atr20),
      notes,
    };
  }

  if (trendContinuationLong) {
    const confidence = clamp(62 + buyScore * 4);
    return {
      type: "BUY",
      action: "ENTER_LONG",
      icon: "🟢",
      confidence,
      shouldNotify: confidence >= 70,
      reason: "Trend-continuation long: price is above key averages with healthy RSI, 1d trend up, and acceptable volume.",
      risk: longRisk(i.currentPrice, confidence, i.atr20, "trend"),
      notes,
    };
  }

  if (deeplyOverbought && bearishMacdCross && nearUpperBand && enoughVolatility && enoughVolume && higherTrendBearish) {
    const confidence = clamp(82 + sellScore * 3);
    return {
      type: "STRONG SELL",
      action: "EXIT_LONG",
      icon: "🔴🔴",
      confidence,
      shouldNotify: true,
      reason: "High-conviction exit: deeply overbought RSI, bearish MACD cross, upper Bollinger confirmation, tradable ATR, and acceptable volume.",
      risk: noRisk(),
      notes,
    };
  }

  if (overbought && bearishMacd && (smaBearish || nearUpperBand) && enoughVolatility && enoughVolume && higherTrendBearish && sellScore >= 5) {
    const confidence = clamp(66 + sellScore * 4);
    return {
      type: "SELL",
      action: "EXIT_LONG",
      icon: "🔴",
      confidence,
      shouldNotify: confidence >= 70,
      reason: "Actionable exit setup: overbought RSI with bearish momentum, real volume, and enough ATR movement.",
      risk: noRisk(),
      notes,
    };
  }

  const bias = buyScore > sellScore ? "bullish" : sellScore > buyScore ? "bearish" : "mixed";
  return {
    type: "HOLD",
    action: "WATCH",
    icon: "🟡",
    confidence: clamp(35 + Math.max(buyScore, sellScore) * 5),
    shouldNotify: false,
    reason: `No actionable signal. Weak ${bias} conditions are being filtered out until confirmation improves.`,
    risk: noRisk(),
    notes,
  };
};
