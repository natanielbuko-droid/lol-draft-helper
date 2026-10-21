import path from "node:path";
import { cachedJson, fetchJson } from "./http";

/**
 * Data Dragon – oficjalne, publiczne pliki statyczne Riot Games (postacie, przedmioty, runy, czary).
 * Nie wymaga klucza API. Każdy patch ma własną wersję, np. "16.21.1".
 */
const BASE = "https://ddragon.leagueoflegends.com";

export interface DDragonChampion {
  key: string; // numeryczne ID jako tekst, np. "222"
  id: string; // np. "Jinx"
  name: string;
  tags: string[];
  image: { full: string };
}

export interface DDragonItem {
  name: string;
  description: string;
  plaintext: string;
  from?: string[];
  into?: string[];
  image: { full: string };
  gold: { total: number; purchasable: boolean };
  tags: string[];
  maps: Record<string, boolean>;
  depth?: number;
  inStore?: boolean;
  requiredChampion?: string;
  requiredAlly?: string;
}

export interface DDragonSummoner {
  id: string; // np. "SummonerFlash"
  key: string; // np. "4"
  name: string;
  modes: string[];
  image: { full: string };
}

export interface DDragonRuneTree {
  id: number;
  key: string; // np. "Precision"
  name: string;
  icon: string;
  slots: { runes: { id: number; key: string; name: string; icon: string }[] }[];
}

export interface DDragonBundle {
  version: string;
  champions: Record<string, DDragonChampion>; // dane analityczne (en_US)
  championNames: Record<string, string>; // key -> nazwa w języku UI
  items: Record<string, DDragonItem>;
  itemNames: Record<string, string>;
  summoners: Record<string, DDragonSummoner>;
  summonerNames: Record<string, string>;
  runes: DDragonRuneTree[];
  /** Nazwy umiejętności w języku UI: klucz postaci (np. "222") -> pasywka + Q/W/E/R. */
  abilityNames: Record<string, { passive: string; spells: string[] }>;
}

export async function getLatestVersion(): Promise<string> {
  const versions = await fetchJson<string[]>(`${BASE}/api/versions.json`);
  return versions[0];
}

export async function loadDDragon(version: string, displayLocale: string, cacheDir: string): Promise<DDragonBundle> {
  const dir = path.join(cacheDir, version);
  const get = <T>(locale: string, file: string) =>
    cachedJson<T>(path.join(dir, locale, file), `${BASE}/cdn/${version}/data/${locale}/${file}`);

  type Wrapped<T> = { data: Record<string, T> };
  const [champions, items, summoners, runes] = await Promise.all([
    get<Wrapped<DDragonChampion>>("en_US", "champion.json"),
    get<Wrapped<DDragonItem>>("en_US", "item.json"),
    get<Wrapped<DDragonSummoner>>("en_US", "summoner.json"),
    get<DDragonRuneTree[]>("en_US", "runesReforged.json"),
  ]);

  // Nazwy w języku UI – jeśli język nie istnieje, zostają angielskie.
  const names = async <T extends { name: string }>(file: string, keyOf: (k: string, v: T) => string) => {
    const out: Record<string, string> = {};
    try {
      const loc = await get<Wrapped<T>>(displayLocale, file);
      for (const [k, v] of Object.entries(loc.data)) out[keyOf(k, v)] = v.name;
    } catch {
      /* brak tłumaczenia – używamy en_US */
    }
    return out;
  };

  // Nazwy umiejętności – jeden plik z pełnymi danymi postaci (ok. 2,4 MB, w cache per patch).
  type FullChampion = { key: string; passive: { name: string }; spells: { name: string }[] };
  const abilityNames: DDragonBundle["abilityNames"] = {};
  for (const locale of [displayLocale, "en_US"]) {
    try {
      const full = await get<Wrapped<FullChampion>>(locale, "championFull.json");
      for (const c of Object.values(full.data)) abilityNames[c.key] = { passive: c.passive.name, spells: c.spells.map((s) => s.name) };
      break;
    } catch {
      /* próbujemy kolejnego języka */
    }
  }

  return {
    version,
    abilityNames,
    champions: champions.data,
    championNames: await names<DDragonChampion>("champion.json", (_k, v) => v.key),
    items: items.data,
    itemNames: await names<DDragonItem>("item.json", (k) => k),
    summoners: summoners.data,
    summonerNames: await names<DDragonSummoner>("summoner.json", (k) => k),
    runes,
  };
}

export const img = {
  champion: (v: string, file: string) => `${BASE}/cdn/${v}/img/champion/${file}`,
  item: (v: string, file: string) => `${BASE}/cdn/${v}/img/item/${file}`,
  spell: (v: string, file: string) => `${BASE}/cdn/${v}/img/spell/${file}`,
  rune: (icon: string) => `${BASE}/cdn/img/${icon}`,
};
