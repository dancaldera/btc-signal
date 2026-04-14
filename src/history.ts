import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PricePoint } from "./price";

const FILE = join(homedir(), ".btc-signal", "history.json");

export const loadHistory = async (): Promise<PricePoint[]> => {
  try {
    const file = Bun.file(FILE);
    return JSON.parse(await file.text()) as PricePoint[];
  } catch {
    return [];
  }
};

export const mergeHistory = (base: PricePoint[], extra: PricePoint[]): PricePoint[] =>
  [...new Map([...base, ...extra].map((p) => [p.timestamp, p] as const)).values()]
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.price))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-500);

export const saveHistory = async (history: PricePoint[]): Promise<void> => {
  await Bun.$`mkdir -p ${dirname(FILE)}`;
  await Bun.write(FILE, JSON.stringify(history, null, 2));
};
