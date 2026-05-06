/**
 * signal.ts — Decision engine
 *
 * The engine intentionally ignores weak BUY/SELL entries as actionable
 * notifications. Weak setups become WATCH/HOLD so the bot does not encourage
 * low-conviction trades. Entry/exit signals require indicator agreement plus
 * market context: trend, Bollinger position, and enough close-to-close
 * volatility to make the move worth watching.
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

const longRisk = (price: number, confidence: number, mode: "reversal" | "trend" = "reversal"): SignalResult["risk"] => {
  if (mode === "trend") {
    return {
      stopLoss: roundMoney(price * 0.85),
      takeProfit: null,
      trailingStopPct: 20,
    };
  }

  const stopPct = confidence >= 90 ? 0.025 : 0.02;
  const rewardPct = stopPct * 2;
  return {
    stopLoss: roundMoney(price * (1 - stopPct)),
    takeProfit: roundMoney(price * (1 + rewardPct)),
    trailingStopPct: confidence >= 90 ? 2.5 : 2,
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
  const enoughVolatility = i.volatilityRatio >= 0.85 && i.volatility20 >= 0.12;
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
    i.bollingerPosition < 0.95 &&
    bullishMacd;

  const buyScore = [oversold || trendContinuationLong, smaBullish, bullishMacd, nearLowerBand, enoughVolatility, higherTrendBullish]
    .filter(Boolean).length;
  const sellScore = [overbought, smaBearish, bearishMacd, nearUpperBand, enoughVolatility, higherTrendBearish]
    .filter(Boolean).length;

  const notes = [
    enoughVolatility
      ? `Volatility is tradable (${i.volatilityRatio.toFixed(2)}x recent baseline).`
      : `Volatility is low (${i.volatilityRatio.toFixed(2)}x recent baseline), avoid forcing entries.`,
    `4h trend: ${i.trend4h}; 1d trend: ${i.trend1d}.`,
    nearLowerBand ? "Price is near the lower Bollinger band." : nearUpperBand ? "Price is near the upper Bollinger band." : "Price is inside the Bollinger range.",
  ];

  if (deeplyOversold && bullishMacdCross && nearLowerBand && enoughVolatility && higherTrendBullish) {
    const confidence = clamp(82 + buyScore * 3);
    return {
      type: "STRONG BUY",
      action: "ENTER_LONG",
      icon: "🟢🟢",
      confidence,
      shouldNotify: true,
      reason: "High-conviction reversal: deeply oversold RSI, bullish MACD cross, lower Bollinger confirmation, and acceptable volatility.",
      risk: longRisk(i.currentPrice, confidence),
      notes,
    };
  }

  if (oversold && bullishMacd && (smaBullish || nearLowerBand) && enoughVolatility && higherTrendBullish && buyScore >= 4) {
    const confidence = clamp(66 + buyScore * 4);
    return {
      type: "BUY",
      action: "ENTER_LONG",
      icon: "🟢",
      confidence,
      shouldNotify: confidence >= 70,
      reason: "Actionable long setup: oversold RSI with bullish momentum and enough market movement.",
      risk: longRisk(i.currentPrice, confidence),
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
      reason: "Trend-continuation long: price is above key averages with healthy RSI and the 1d trend up.",
      risk: longRisk(i.currentPrice, confidence, "trend"),
      notes,
    };
  }

  if (deeplyOverbought && bearishMacdCross && nearUpperBand && enoughVolatility && higherTrendBearish) {
    const confidence = clamp(82 + sellScore * 3);
    return {
      type: "STRONG SELL",
      action: "EXIT_LONG",
      icon: "🔴🔴",
      confidence,
      shouldNotify: true,
      reason: "High-conviction exit: deeply overbought RSI, bearish MACD cross, upper Bollinger confirmation, and acceptable volatility.",
      risk: noRisk(),
      notes,
    };
  }

  if (overbought && bearishMacd && (smaBearish || nearUpperBand) && enoughVolatility && higherTrendBearish && sellScore >= 4) {
    const confidence = clamp(66 + sellScore * 4);
    return {
      type: "SELL",
      action: "EXIT_LONG",
      icon: "🔴",
      confidence,
      shouldNotify: confidence >= 70,
      reason: "Actionable exit setup: overbought RSI with bearish momentum and enough market movement.",
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
