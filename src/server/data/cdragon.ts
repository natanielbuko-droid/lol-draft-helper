import path from "node:path";
import { cachedJson, mapLimit } from "./http";

/**
 * CommunityDragon – lustro plików samego klienta LoL. Daje dane, których nie ma w Data Dragon:
 * typ obrażeń (kPhysical/kMagic/kMixed), oceny 1–3 (damage, durability, crowdControl...)
 * oraz pełne opisy umiejętności, z których wyciągamy leczenie i twarde CC.
 */
const GLOBAL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global";
const BASE = `${GLOBAL}/default/v1/champions`;

/** Ścieżka z plików klienta ("/lol-game-data/assets/v1/...") -> adres obrazka w CommunityDragon. */
export function cdragonAsset(iconPath: string): string {
  return `${GLOBAL}/default/${iconPath.replace(/^\/lol-game-data\/assets\//i, "").toLowerCase()}`;
}

export interface CDragonPerk {
  id: number;
  name: string;
  iconPath: string;
}

export interface CDragonPerkStyle {
  id: number;
  name: string;
  iconPath: string;
  /** Kolejne rzędy drzewa: kKeyStone, 3× kMixedRegularSplashable, 3× kStatMod (odłamki). */
  slots: { type: string; perks: number[] }[];
}

/**
 * Wszystkie runy (łącznie z odłamkami statystyk, których nie ma w Data Dragon) i drzewa run,
 * z nazwami w języku UI. Gdy tłumaczenia brak – wersja angielska.
 */
export async function loadCDragonPerks(version: string, cacheDir: string, displayLocale: string) {
  const locales = [displayLocale.toLowerCase(), "default"];
  for (const loc of [...new Set(locales.map((l) => (l === "en_us" ? "default" : l)))]) {
    try {
      const get = <T>(file: string) => cachedJson<T>(path.join(cacheDir, version, "cdragon", loc, file), `${GLOBAL}/${loc}/v1/${file}`);
      const [perks, styles] = await Promise.all([get<CDragonPerk[]>("perks.json"), get<{ styles: CDragonPerkStyle[] }>("perkstyles.json")]);
      return { perks, styles: styles.styles };
    } catch {
      /* próbujemy kolejnego języka */
    }
  }
  return { perks: [] as CDragonPerk[], styles: [] as CDragonPerkStyle[] };
}

export interface CDragonChampion {
  id: number;
  name: string;
  alias: string;
  roles: string[];
  tacticalInfo: { style: number; difficulty: number; damageType: string; attackType: string };
  playstyleInfo: { damage: number; durability: number; crowdControl: number; mobility: number; utility: number };
  passive: { name: string; description: string };
  spells: { spellKey: string; name: string; description: string }[];
}

export async function loadCDragonChampions(ids: number[], version: string, cacheDir: string) {
  const list = await mapLimit(ids, 8, async (id) => {
    try {
      return await cachedJson<CDragonChampion>(path.join(cacheDir, version, "cdragon", `${id}.json`), `${BASE}/${id}.json`);
    } catch {
      return null; // np. postać dodana dziś, której CDragon jeszcze nie ma – użyjemy samego Data Dragon
    }
  });
  const byId = new Map<number, CDragonChampion>();
  for (const c of list) if (c) byId.set(c.id, c);
  return byId;
}
