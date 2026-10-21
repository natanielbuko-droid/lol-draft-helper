import type { ItemRef } from "../../shared/types";
import type { DDragonItem } from "./ddragon";
import { img } from "./ddragon";

/**
 * Katalog przedmiotów z automatyczną klasyfikacją.
 * Zamiast wpisywać "Mortal Reminder = anti-heal", czytamy opis przedmiotu z bieżącego patcha.
 * Jeśli Riot doda nowy przedmiot z Grievous Wounds – zostanie wykryty sam.
 */
export interface CatalogItem extends ItemRef {
  tags: string[];
  /** Statystyki odczytane z bloku <stats> opisu, np. { "Attack Damage": 35, "Armor Penetration%": 30 } */
  stats: Record<string, number>;
  isBoots: boolean;
  isCompleted: boolean; // pełny przedmiot (nie komponent)
  isComponent: boolean;
  flags: {
    antiHeal: boolean;
    armor: boolean;
    magicResist: boolean;
    percentArmorPen: boolean;
    percentMagicPen: boolean;
    tenacity: boolean;
    cleanse: boolean; // usuwa CC (Quicksilver)
    stasis: boolean; // Zhonya i podobne
    spellShield: boolean;
    lifeline: boolean; // tarcza/odrodzenie przy niskim HP
    antiShield: boolean;
  };
}

const STAT_RE = /<attention>([\d.]+)(%?)<\/attention>\s*([A-Za-z' ]+)/g;

export function parseItemStats(description: string): Record<string, number> {
  const block = description.match(/<stats>([\s\S]*?)<\/stats>/)?.[1] ?? "";
  const out: Record<string, number> = {};
  for (const m of block.matchAll(STAT_RE)) {
    const name = m[3].trim() + (m[2] === "%" && /Penetration/.test(m[3]) ? "%" : "");
    out[name] = Number(m[1]);
  }
  return out;
}

export function buildItemCatalog(
  items: Record<string, DDragonItem>,
  names: Record<string, string>,
  version: string,
): Map<string, CatalogItem> {
  const catalog = new Map<string, CatalogItem>();
  for (const [id, it] of Object.entries(items)) {
    // Tylko przedmioty dostępne w sklepie na Summoner's Rift (mapa 11).
    if (!it.maps["11"] || !it.gold.purchasable || it.inStore === false) continue;
    if (it.requiredChampion || it.requiredAlly || Number(id) >= 10000) continue;
    if (it.tags.includes("Consumable") || it.tags.includes("Trinket")) continue;

    const text = it.description.replace(/<[^>]+>/g, " ");
    const stats = parseItemStats(it.description);
    const isBoots = it.tags.includes("Boots");
    const upgrades = (it.into ?? []).filter((x) => items[x]?.maps["11"]);
    // Buty: liczymy poziom 2 (np. Mercury's Treads); ulepszenia 3. poziomu kupuje się dopiero późno.
    const isCompleted = isBoots ? it.depth === 2 : upgrades.length === 0 && it.gold.total >= 2200;

    catalog.set(id, {
      id,
      name: names[id] ?? it.name,
      image: img.item(version, it.image.full),
      gold: it.gold.total,
      tags: it.tags,
      stats,
      isBoots,
      isCompleted,
      isComponent: !isCompleted && !isBoots && it.gold.total >= 700,
      flags: {
        antiHeal: /Grievous Wounds|\bWounds\b/i.test(text),
        armor: "Armor" in stats,
        magicResist: "Magic Resist" in stats,
        percentArmorPen: "Armor Penetration%" in stats,
        percentMagicPen: "Magic Penetration%" in stats,
        tenacity: it.tags.includes("Tenacity"),
        cleanse: /remove(?:s)? all crowd control|Quicksilver/i.test(text),
        stasis: /\bStasis\b/i.test(text),
        spellShield: /spell ?shield/i.test(text),
        lifeline: /Lifeline|revive|resurrect/i.test(text),
        antiShield: /Shieldbreaker|reduc\w* shield/i.test(text),
      },
    });
  }
  return catalog;
}
