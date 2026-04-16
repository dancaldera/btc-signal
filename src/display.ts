/**
 * display.ts — Terminal output renderer
 *
 * Renders indicators and signals as a color-coded ASCII display.
 * Uses ANSI escape codes for colors and formatting — no external deps needed.
 *
 * Colors: green = positive/bullish, red = negative/bearish, yellow = neutral/hold
 */

import type { Indicators } from "./indicators";
import type { SignalResult } from "./signal";

// ANSI escape code palette
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

/** Format a number as USD currency string */
const money = (n: number) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "N/A";

/** Format a number as a signed percentage string */
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/** Green for positive, red for negative */
const colorFor = (n: number) => (n >= 0 ? c.green : c.red);

/** Pick a color based on signal type */
const signalColor = (s: SignalResult["type"]) => (s === "BUY" || s === "STRONG BUY" || s === "WEAK BUY" ? c.green : s === "SELL" || s === "STRONG SELL" || s === "WEAK SELL" ? c.red : c.yellow);

/**
 * Full terminal render: ASCII banner + all indicator values + signal.
 * MACD values are color-coded green (positive) or red (negative).
 */
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
  `${c.bold}${c.white}MACD${c.reset}           ${colorFor(i.macd)}${i.macd >= 0 ? "+" : ""}${i.macd.toFixed(3)}${c.reset}`,
  `${c.bold}${c.white}MACD Signal${c.reset}    ${colorFor(i.macdSignal)}${i.macdSignal >= 0 ? "+" : ""}${i.macdSignal.toFixed(3)}${c.reset}`,
  `${c.bold}${c.white}MACD Hist${c.reset}      ${colorFor(i.macdHist)}${i.macdHist >= 0 ? "+" : ""}${i.macdHist.toFixed(3)}${c.reset}`,
  "",
  `${c.bold}${c.white}Signal${c.reset}         ${signalColor(s.type)}${s.icon} ${s.type}${c.reset} ${c.dim}(${s.confidence}% confidence)${c.reset}`,
  `${c.bold}${c.white}Why${c.reset}            ${s.reason}`,
].join("\n");

/** Error renderer for when things go wrong (API failures, etc.) */
export const renderError = (message: string): string =>
  `${c.red}${c.bold}BTC Signal Error${c.reset}\n${c.dim}${message}${c.reset}`;
