# ₿ BTC Signal

A lean CLI tool that analyzes Bitcoin's price using technical indicators and tells you whether to **buy**, **sell**, or **hold**.

Zero dependencies. Pure Bun + TypeScript.

## Quick Start

```bash
git clone https://github.com/dancaldera/btc-signal.git
cd btc-signal
bun run start
```

That's it. No API keys, no config, no setup.

## Sample Output

```
  ____ _____ ____    ____  _                   _
 | __ )_   _/ ___|  / ___|(_) __ _ _ __   __ _| |
 |  _ \ | || |     \___ \| |/ _` | '_ \ / _` | |
 | |_) || || |___   ___) | | (_| | | | | (_| | |
 |____/ |_| \____| |____/|_|\__, |_| |_|\__,_|_|
                            |___/

Current Price   $74,413.00
24h Change      +4.68%
SMA 20          $72,660.20
SMA 50          $71,797.67
SMA 200         $68,205.41
RSI (14)        72.56
MACD Hist       +203.825
Bollinger       $71,200.00 / $72,660.20 / $74,120.00
BB Position     78%
Volatility      0.240% hourly (1.05x baseline)
Trend 4h/1d     FLAT / UP

Signal          🟡 HOLD (50% confidence)
Action          WATCH
Why             No actionable signal. Weak bullish conditions are being filtered out until confirmation improves.
```

## How It Works

### Data Source

- **[CoinGecko API](https://www.coingecko.com/en/api)** — free, no API key required
- Fetches 90 days of historical price data + current price
- Resamples into consistent hourly candles for accurate indicator calculation
- Stores history locally at `~/.btc-signal/history.json` (keeps last 1200 data points)

### Indicators

| Indicator | What It Measures |
|-----------|-----------------|
| **SMA 20** | Short-term trend over the last 20 hourly candles. |
| **SMA 50** | Medium-term trend used with SMA20 for golden/death cross detection. |
| **SMA 200** | Long-term trend baseline over the last 200 hourly candles. |
| **RSI (14)** | Momentum. Uses Wilder smoothing (industry standard). Below 30 = oversold, above 70 = overbought. |
| **MACD** | Trend strength & direction. EMA12 - EMA26 = MACD line. EMA9 of MACD = Signal line. Histogram = difference. Positive histogram = bullish momentum. |
| **Bollinger Bands** | Confirms whether price is near statistically stretched zones. Lower band supports oversold setups; upper band supports exit setups. |
| **Volatility Ratio** | Close-to-close hourly volatility vs recent baseline. Low-volatility setups are filtered to avoid forcing trades in flat markets. |
| **4h / 1d Trend** | Lightweight multi-timeframe context so entries are not taken blindly against the broader move. |

### Signal Logic

Signals are generated from indicator agreement plus context filters:

| Signal | Action | Condition Summary |
|--------|--------|-------------------|
| 🟢🟢 **STRONG BUY** | `ENTER_LONG` | Deep oversold RSI + bullish MACD cross + lower Bollinger confirmation + enough volatility + no higher-timeframe downtrend. |
| 🟢 **BUY** | `ENTER_LONG` | Oversold RSI + bullish momentum + SMA or Bollinger confirmation + enough volatility. |
| 🔴 **SELL** | `EXIT_LONG` | Overbought RSI + bearish momentum + SMA or Bollinger confirmation + enough volatility. |
| 🔴🔴 **STRONG SELL** | `EXIT_LONG` | Deep overbought RSI + bearish MACD cross + upper Bollinger confirmation + enough volatility. |
| 🟡 **HOLD** | `WATCH` | Weak/low-conviction setups are intentionally filtered out. |

Actionable long signals include suggested stop-loss, take-profit, and trailing-stop levels. These are risk-management hints, not automated orders.

## Architecture

```
src/
├── index.ts        # Entry point — orchestrates fetch → calculate → display
├── price.ts        # Fetches market data from CoinGecko API
├── history.ts      # Persists price history locally (JSON, max 1200 points)
├── indicators.ts   # Calculates SMA, RSI, MACD, Bollinger, volatility, multi-timeframe context
├── signal.ts       # Decision engine — filters weak signals and adds risk guidance
└── display.ts      # Terminal output with ANSI colors and ASCII banner
```

## Requirements

- [Bun](https://bun.sh/) runtime
- Internet connection (for CoinGecko API)

## Useful Commands

```bash
bun run start   # run the signal once
bun run check   # TypeScript typecheck
```

## Disclaimer

This is a learning project. **Not financial advice.** Always do your own research before making investment decisions. Technical indicators are tools, not crystal balls.

## License

MIT
