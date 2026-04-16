/**
 * history.ts — Local price history persistence
 *
 * Stores fetched price data in ~/.btc-signal/history.json so indicators
 * can be calculated across runs without re-fetching everything.
 *
 * Keeps a rolling window of the last 1200 data points to bound file size.
 * Deduplicates by timestamp when merging new data with stored history.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PricePoint } from "./price";

const FILE = join(homedir(), ".btc-signal", "history.json");

/** Load stored history from disk. Returns empty array if file doesn't exist yet. */
export const loadHistory = async (): Promise<PricePoint[]> => {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as PricePoint[];
  } catch {
    return [];
  }
};

/**
 * Merge stored and fresh price data, deduplicating by timestamp.
 * Sorted chronologically, capped at last 1200 points.
 */
export const mergeHistory = (base: PricePoint[], extra: PricePoint[]): PricePoint[] =>
  [...new Map([...base, ...extra].map((p) => [p.timestamp, p] as const)).values()]
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.price))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-1200);

/** Persist merged history to disk. Creates the directory if needed. */
export const saveHistory = async (history: PricePoint[]): Promise<void> => {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(history, null, 2));
};
