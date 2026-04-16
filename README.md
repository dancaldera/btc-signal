# ₿ BTC Signal

A lean CLI tool that analyzes Bitcoin's price using technical indicators and tells you whether to **buy**, **sell**, or **hold**.

Zero dependencies. Pure Bun + TypeScript. 300 lines.

## Quick Start

```bash
git clone https://github.com/dancaldera/btc-signal.git
cd btc-signal
bun run src/index.ts
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
MACD            +832.945
MACD Signal     +629.120
MACD Hist       +203.825

Signal          🟡 HOLD (50% confidence)
Why             Mixed signals - trend is positive but conditions not strong enough for entry.
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

### Signal Logic

Signals are generated based on how many indicators agree:

| Signal | Condition |
|--------|-----------|
| 🟢 **STRONG BUY** | RSI < 25 AND bullish MACD crossover |
| 🟢 **BUY** | RSI < 35 AND (SMA20 > SMA50 OR MACD histogram positive) |
| 🟡 **WEAK BUY** | RSI < 40 AND SMA20 > SMA50 |
| 🔴 **STRONG SELL** | RSI > 75 AND bearish MACD crossover |
| 🔴 **SELL** | RSI > 65 AND (SMA20 < SMA50 OR MACD histogram negative) |
| 🟡 **WEAK SELL** | RSI > 60 AND SMA20 < SMA50 |
| 🟡 **HOLD** | No strong consensus among indicators |

**Confidence** is calculated by how many indicators align (RSI direction + SMA trend + MACD direction).

## Architecture

```
src/
├── index.ts        # Entry point — orchestrates fetch → calculate → display
├── price.ts        # Fetches market data from CoinGecko API
├── history.ts      # Persists price history locally (JSON, max 1200 points)
├── indicators.ts   # Calculates SMA 20/50/200, RSI (Wilder), MACD, EMA
├── signal.ts       # Decision engine — maps indicators to buy/sell/hold signals
└── display.ts      # Terminal output with ANSI colors and ASCII banner
```

## Requirements

- [Bun](https://bun.sh/) runtime
- Internet connection (for CoinGecko API)

## Disclaimer

This is a learning project. **Not financial advice.** Always do your own research before making investment decisions. Technical indicators are tools, not crystal balls.

## License

MIT
