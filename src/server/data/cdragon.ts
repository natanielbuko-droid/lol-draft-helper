import path from "node:path";
import { cachedJson, mapLimit } from "./http";

/**
 * CommunityDragon – lustro plików samego klienta LoL. Daje dane, których nie ma w Data Dragon:
 * typ obrażeń (kPhysical/kMagic/kMixed), oceny 1–3 (damage, durability, crowdControl...)
 * oraz pełne opisy umiejętności, z których wyciągamy leczenie i twarde CC.
 */
const BASE = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions";

export interface CDragonChampion {
  id: number;
  name: string;
  alias: string;
  roles: string[];
  tacticalInfo: { style: number; difficulty: number; damageType: string; attackType: string };
  playstyleInfo: { damage: number; durability: number; crowdControl: number; mobility: number; utility: number };
  passive: { description: string };
  spells: { spellKey: string; description: string }[];
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
