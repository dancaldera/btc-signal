/**
 * display.ts — Terminal output renderer
 */

import type { Indicators } from "./indicators";
import type { SignalResult } from "./signal";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  white: "\x1b[37m",
};

const money = (n: number) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "N/A";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const colorFor = (n: number) => (n >= 0 ? c.green : c.red);
const signalColor = (s: SignalResult["type"]) =>
  s === "BUY" || s === "STRONG BUY" ? c.green : s === "SELL" || s === "STRONG SELL" ? c.red : c.yellow;

const riskLines = (s: SignalResult): string[] => {
  if (s.action !== "ENTER_LONG") return [];
  return [
    `${c.bold}${c.white}Stop Loss${c.reset}      ${money(s.risk.stopLoss ?? NaN)}`,
    `${c.bold}${c.white}Take Profit${c.reset}    ${money(s.risk.takeProfit ?? NaN)}`,
    `${c.bold}${c.white}Trailing Stop${c.reset}  ${s.risk.trailingStopPct?.toFixed(1) ?? "N/A"}%`,
  ];
};

export const render = (i: Indicators, s: SignalResult): string => [
  `${c.cyan}${c.bold}  ____ _____ ____    ____  _                   _ ${c.reset}`,
  `${c.cyan}${c.bold} | __ )_   _/ ___|  / ___|(_) __ _ _ __   __ _| |${c.reset}`,
  `${c.cyan}${c.bold} |  _ \\ | || |     \\___ \\| |/ _\` | '_ \\ / _\` | |${c.reset}`,
  `${c.cyan}${c.bold} | |_) || || |___   ___) | | (_| | | | | (_| | |${c.reset}`,
  `${c.cyan}${c.bold} |____/ |_| \\____| |____/|_|\\__, |_| |_|\\__,_|_|${c.reset}`,
  `${c.cyan}${c.bold}                            |___/               ${c.reset}`,
  "",
  `${c.bold}${c.white}Current Price${c.reset}  ${money(i.currentPrice)}`,
  `${c.bold}${c.white}24h Change${c.reset}     ${colorFor(i.change24h)}${pct(i.change24h)}${c.reset}`,
  `${c.bold}${c.white}SMA 20${c.reset}         ${money(i.sma20)}`,
  `${c.bold}${c.white}SMA 50${c.reset}         ${money(i.sma50)}`,
  `${c.bold}${c.white}SMA 200${c.reset}        ${money(i.sma200)}`,
  `${c.bold}${c.white}RSI (14)${c.reset}       ${i.rsi.toFixed(2)}`,
  `${c.bold}${c.white}MACD Hist${c.reset}      ${colorFor(i.macdHist)}${i.macdHist >= 0 ? "+" : ""}${i.macdHist.toFixed(3)}${c.reset}`,
  `${c.bold}${c.white}Bollinger${c.reset}      ${money(i.bollingerLower)} / ${money(i.bollingerMiddle)} / ${money(i.bollingerUpper)}`,
  `${c.bold}${c.white}BB Position${c.reset}    ${(i.bollingerPosition * 100).toFixed(0)}%`,
  `${c.bold}${c.white}Volatility${c.reset}     ${i.volatility20.toFixed(3)}% hourly (${i.volatilityRatio.toFixed(2)}x baseline)`,
  `${c.bold}${c.white}Trend 4h/1d${c.reset}    ${i.trend4h} / ${i.trend1d}`,
  "",
  `${c.bold}${c.white}Signal${c.reset}         ${signalColor(s.type)}${s.icon} ${s.type}${c.reset} ${c.dim}(${s.confidence}% confidence)${c.reset}`,
  `${c.bold}${c.white}Action${c.reset}         ${s.action}${s.shouldNotify ? " 🔔" : ""}`,
  `${c.bold}${c.white}Why${c.reset}            ${s.reason}`,
  ...riskLines(s),
  `${c.bold}${c.white}Context${c.reset}        ${s.notes.join(" ")}`,
].join("\n");

export const renderError = (message: string): string =>
  `${c.red}${c.bold}BTC Signal Error${c.reset}\n${c.dim}${message}${c.reset}`;
