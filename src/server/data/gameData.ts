import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChampionProfile, ItemRef, RuneRef } from "../../shared/types";
import { cdragonAsset, loadCDragonChampions, loadCDragonPerks, type CDragonPerkStyle } from "./cdragon";
import { buildChampionProfile } from "./championProfile";
import { getLatestVersion, img, loadDDragon, type DDragonBundle, type DDragonRuneTree } from "./ddragon";
import { buildItemCatalog, type CatalogItem } from "./itemCatalog";

export interface SummonerSpell {
  id: string; // "SummonerFlash"
  key: number; // 4
  name: string;
  image: string;
}

/**
 * Wszystkie dane o grze dla bieżącego patcha.
 * Emituje zdarzenie "updated", gdy wykryje nowy patch – reszta aplikacji przelicza wtedy rekomendacje.
 */
export class GameData extends EventEmitter {
  version = "";
  champions = new Map<number, ChampionProfile>();
  championsByKey = new Map<string, ChampionProfile>();
  items = new Map<string, CatalogItem>();
  /** Wszystkie przedmioty z Summoner's Rift (także mikstury i inne zużywalne) – do wyświetlania przedmiotów startowych. */
  itemRefs = new Map<string, ItemRef>();
  summoners = new Map<string, SummonerSpell>();
  runeTrees: DDragonRuneTree[] = [];
  /** Wszystkie runy i odłamki (nazwa w języku UI + ikona) oraz drzewa run z rzędami – z CommunityDragon. */
  perks = new Map<number, RuneRef>();
  perkStyles: CDragonPerkStyle[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private cacheDir: string,
    private displayLocale: string,
  ) {
    super();
  }

  /** Pobiera najnowszą wersję gry (lub korzysta z cache, gdy brak internetu). */
  async init(): Promise<void> {
    let version: string;
    try {
      version = await getLatestVersion();
    } catch (err) {
      const cached = await this.newestCachedVersion();
      if (!cached) throw new Error(`Brak internetu i brak danych w cache – nie można pobrać danych gry (${(err as Error).message}).`);
      console.warn(`[data] Brak połączenia z Data Dragon – używam danych z cache (patch ${cached}).`);
      version = cached;
    }
    await this.loadVersion(version);
  }

  /** Najnowsza wersja zapisana wcześniej w data/cache (foldery typu "16.21.1"). */
  private async newestCachedVersion(): Promise<string | null> {
    try {
      const dirs = (await fs.readdir(this.cacheDir)).filter((d) => /^\d+\.\d+\.\d+$/.test(d));
      const num = (v: string) => v.split(".").map(Number);
      dirs.sort((a, b) => {
        const [x, y] = [num(a), num(b)];
        return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
      });
      return dirs[0] ?? null;
    } catch {
      return null;
    }
  }

  async loadVersion(version: string): Promise<void> {
    console.log(`[data] Ładowanie danych patcha ${version}...`);
    const dd = await loadDDragon(version, this.displayLocale, this.cacheDir);
    const ids = Object.values(dd.champions).map((c) => Number(c.key));
    const [cd, perks] = await Promise.all([
      loadCDragonChampions(ids, version, path.join(this.cacheDir)),
      loadCDragonPerks(version, this.cacheDir, this.displayLocale),
    ]);
    this.apply(dd, cd);
    this.perks = new Map(perks.perks.map((p) => [p.id, { id: p.id, name: p.name, image: cdragonAsset(p.iconPath) }]));
    this.perkStyles = perks.styles;
    console.log(`[data] Gotowe: ${this.champions.size} postaci, ${this.items.size} przedmiotów (patch ${version}).`);
    this.emit("updated", version);
  }

  private apply(dd: DDragonBundle, cd: Awaited<ReturnType<typeof loadCDragonChampions>>) {
    const champions = new Map<number, ChampionProfile>();
    const byKey = new Map<string, ChampionProfile>();
    for (const c of Object.values(dd.champions)) {
      const profile = buildChampionProfile(c, cd.get(Number(c.key)), dd.championNames[c.key], dd.version);
      champions.set(profile.id, profile);
      byKey.set(profile.key, profile);
    }

    const summoners = new Map<string, SummonerSpell>();
    for (const [id, s] of Object.entries(dd.summoners)) {
      if (!s.modes.includes("CLASSIC")) continue; // tylko czary z Summoner's Rift
      summoners.set(id, { id, key: Number(s.key), name: dd.summonerNames[id] ?? s.name, image: img.spell(dd.version, s.image.full) });
    }

    this.version = dd.version;
    this.champions = champions;
    this.championsByKey = byKey;
    this.items = buildItemCatalog(dd.items, dd.itemNames, dd.version);
    this.itemRefs = new Map(
      Object.entries(dd.items)
        .filter(([, it]) => it.maps["11"])
        .map(([id, it]) => [id, { id, name: dd.itemNames[id] ?? it.name, image: img.item(dd.version, it.image.full), gold: it.gold.total }]),
    );
    this.summoners = summoners;
    this.runeTrees = dd.runes;
  }

  /** Okresowo sprawdza versions.json – nowy patch = automatyczne przeładowanie danych. */
  startPatchWatcher(minutes: number): void {
    this.timer = setInterval(async () => {
      try {
        const latest = await getLatestVersion();
        if (latest !== this.version) {
          console.log(`[data] Wykryto nowy patch: ${this.version} -> ${latest}`);
          await this.loadVersion(latest);
        }
      } catch (err) {
        console.warn("[data] Sprawdzanie patcha nie powiodło się:", (err as Error).message);
      }
    }, minutes * 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Mapa ID -> nazwa/ikona dla UI. */
  championIndex(): Record<number, { name: string; image: string }> {
    const out: Record<number, { name: string; image: string }> = {};
    for (const c of this.champions.values()) out[c.id] = { name: c.name, image: c.image };
    return out;
  }
}
