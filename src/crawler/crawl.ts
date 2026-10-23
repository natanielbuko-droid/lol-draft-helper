import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getLatestVersion, loadDDragon } from "../server/data/ddragon";
import { loadEnvFile } from "../server/env";
import { buildItemCatalog } from "../server/data/itemCatalog";
import { emptyStats, type StatsFile } from "../server/data/statsStore";
import { addMatch, comparePatch, patchOf } from "./aggregate";
import { RiotApi } from "./riotApi";

/**
 * CRAWLER STATYSTYK
 * 1. Pobiera listę graczy z wybranych lig (league-v4).
 * 2. Pobiera ID ich ostatnich meczów rankingowych (match-v5).
 * 3. Każdy mecz z NAJNOWSZEGO patcha dodaje do statystyk (winrate, matchupy, synergie, buildy).
 * 4. Zapisuje data/stats/<patch>.json oraz data/stats/latest.json (czyta je aplikacja).
 *
 * Gdy pojawią się mecze z nowego patcha, statystyki zaczynają się liczyć od zera – automatycznie.
 * Uruchomienie: RIOT_API_KEY=... npm run crawl -- --matches 500 --timelines
 */
export interface CrawlOptions {
  apiKey: string;
  platform: string;
  dataDir: string;
  maxMatches: number;
  timelines: boolean;
  tiers?: string[];
  /** Zbieraj konkretny patch (np. "16.20") zamiast bieżącego. */
  patch?: string;
}

/** Domyślnie zbieramy mecze graczy z Mistrza i Arcymistrza – wysoki poziom gry, a przy tym duża pula graczy. */
const DEFAULT_TIERS = ["MASTER", "GRANDMASTER"];

export async function crawl(opts: CrawlOptions): Promise<StatsFile> {
  const api = new RiotApi(opts.apiKey, opts.platform);
  const statsDir = path.join(opts.dataDir, "stats");
  await fs.mkdir(statsDir, { recursive: true });

  // Katalog przedmiotów z bieżącego patcha – żeby wiedzieć, które przedmioty są "ukończone".
  const version = await getLatestVersion();
  const dd = await loadDDragon(version, "en_US", path.join(opts.dataDir, "cache"));
  const catalog = buildItemCatalog(dd.items, {}, version);
  const isCoreItem = (id: string) => !!catalog.get(id)?.isCompleted && !catalog.get(id)?.isBoots;

  // Docelowy patch: bieżący z Data Dragon albo wskazany ręcznie (--patch 16.20), np. tuż po premierze
  // nowego patcha, gdy mało kto zdążył na nim zagrać.
  const pinned = !!opts.patch;
  const targetPatch = opts.patch ?? patchOf(version);

  // Kontynuujemy statystyki tego patcha (przyrostowo), pamiętając już policzone mecze.
  let stats: StatsFile;
  let seen: Set<string>;
  try {
    stats = JSON.parse(await fs.readFile(path.join(statsDir, `${targetPatch}.json`), "utf8"));
    seen = new Set(JSON.parse(await fs.readFile(path.join(statsDir, `${targetPatch}.seen.json`), "utf8")));
  } catch {
    stats = emptyStats(targetPatch);
    seen = new Set();
  }

  // Nie mieszamy lig ani serwerów: jeśli plik zebrano z innych rang lub z innego serwera, zaczynamy od zera.
  const tiers = opts.tiers ?? DEFAULT_TIERS;
  const sameTiers = stats.tiers?.join(",") === tiers.join(",");
  const samePlatform = (stats.platform ?? opts.platform) === opts.platform;
  if (stats.matches && (!sameTiers || !samePlatform)) {
    console.log(
      `[crawl] Istniejące statystyki pochodzą z ${!samePlatform ? `innego serwera (${stats.platform})` : `innych rang (${stats.tiers?.join(", ") ?? "nieznane"})`} – zaczynam od zera.`,
    );
    stats = emptyStats(targetPatch);
    seen = new Set();
  }
  stats.tiers = tiers;
  stats.platform = opts.platform;

  // 1) Gracze
  const puuids: string[] = [];
  for (const tier of tiers) {
    const players = await api.leaguePlayers(tier);
    console.log(`[crawl] ${tier}: ${players.length} graczy`);
    puuids.push(...players);
  }
  puuids.sort(() => Math.random() - 0.5); // losowa kolejność = bardziej zróżnicowana próbka

  const save = async () => {
    stats.generatedAt = new Date().toISOString();
    const json = JSON.stringify(stats);
    await fs.writeFile(path.join(statsDir, `${stats.patch}.json`), json);
    await fs.writeFile(path.join(statsDir, "latest.json"), json);
    await fs.writeFile(path.join(statsDir, `${stats.patch}.seen.json`), JSON.stringify([...seen]));
  };

  // 2) + 3) Mecze
  let added = 0;
  for (const puuid of puuids) {
    if (added >= opts.maxMatches) break;
    // Gdy znamy początek patcha, Riot zwraca tylko nowsze mecze – nie marnujemy zapytań na stary patch.
    // Zbierając starszy patch (--patch), pytamy tylko o mecze sprzed startu nowszego – gry z nowego patcha nie zużywają limitu.
    for (const id of await api.matchIds(puuid, 20, pinned ? undefined : stats.patchStartTime, pinned ? stats.nextPatchStartTime : undefined)) {
      if (added >= opts.maxMatches) break;
      if (seen.has(id)) continue;
      seen.add(id);

      const match = await api.match(id);
      if (!match || match.info.queueId !== 420) continue;
      const patch = patchOf(match.info.gameVersion);

      if (pinned && comparePatch(patch, stats.patch) > 0) {
        // Mecz z nowszego patcha niż wskazany – pomijamy (starsze mecze gracza są dalej na liście)
        // i zapamiętujemy, kiedy najpóźniej zaczął się nowszy patch, by następne zapytania go omijały.
        const created = Math.floor(match.info.gameCreation / 1000);
        if (!stats.nextPatchStartTime || created < stats.nextPatchStartTime) stats.nextPatchStartTime = created;
        continue;
      } else if (comparePatch(patch, stats.patch) > 0) {
        // Wyszedł patch nowszy niż znany – stare statystyki tracą ważność.
        console.log(`[crawl] Nowy patch ${patch} – zaczynam statystyki od nowa.`);
        stats = emptyStats(patch);
        seen = new Set([id]);
        added = 0;
      } else if (comparePatch(patch, stats.patch) < 0) {
        break; // lista jest od najnowszych – dalej są już tylko starsze mecze tego gracza
      }

      // Najwcześniejszy mecz z tego patcha przybliża moment jego wydania.
      const created = Math.floor(match.info.gameCreation / 1000);
      if (!stats.patchStartTime || created < stats.patchStartTime) stats.patchStartTime = created;

      const timeline = opts.timelines ? await api.timeline(id) : null;
      if (!addMatch(stats, match, timeline, isCoreItem)) continue;
      added++;
      if (added % 25 === 0) {
        await save(); // zapis co 25 meczów – przerwanie crawla nie gubi danych
        console.log(`[crawl] ${added}/${opts.maxMatches} meczów (patch ${stats.patch}, łącznie ${stats.matches})`);
      }
    }
  }

  // 4) Zapis
  await save();
  console.log(`[crawl] Zapisano statystyki patcha ${stats.patch}: ${stats.matches} meczów.`);
  return stats;
}

// Uruchomienie z linii poleceń: npm run crawl -- --matches 500 --timelines --platform euw1
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  loadEnvFile();
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    console.error("Brak RIOT_API_KEY – wpisz klucz do pliku .env (wzór w .env.example).");
    process.exit(1);
  }
  crawl({
    apiKey,
    platform: arg("platform") ?? process.env.RIOT_PLATFORM ?? "euw1",
    dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
    maxMatches: Number(arg("matches") ?? 300),
    timelines: process.argv.includes("--timelines"),
    tiers: arg("tiers")?.split(","),
    patch: arg("patch"),
  }).catch((err) => {
    console.error("[crawl] Błąd:", err.message);
    process.exit(1);
  });
}
