import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Kopiuje statystyki z crawlera (data/stats/latest.json) do repozytorium jako seed/stats.json.gz.
 * Dzięki temu osoby bez własnego klucza Riot API dostają gotowe statystyki.
 * Uruchomienie: npm run export-seed
 */
const src = path.resolve("data", "stats", "latest.json");
const dest = path.resolve("seed", "stats.json.gz");

const raw = await fs.readFile(src);
const stats = JSON.parse(raw.toString("utf8")) as { patch: string; matches: number; tiers?: string[] };
await fs.mkdir(path.dirname(dest), { recursive: true });
await fs.writeFile(dest, gzipSync(raw, { level: 9 }));
await fs.rm(path.resolve("seed", "stats.json"), { force: true }); // stary, nieskompresowany format

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
console.log(
  `Zapisano ${path.relative(process.cwd(), dest)}: patch ${stats.patch}, ${stats.matches} meczów` +
    `${stats.tiers ? ` (${stats.tiers.join(" + ")})` : ""}, ${kb(raw.length)} -> ${kb((await fs.stat(dest)).size)}`,
);
