import type { ChampionProfile } from "../../shared/types";
import type { CatalogItem } from "../data/itemCatalog";

/** Ogólny "typ" postaci – decyduje, jakie statystyki na przedmiotach są dla niej wartościowe. */
export type Archetype = "marksman" | "ad_assassin" | "ad_fighter" | "ap_mage" | "ap_assassin" | "ap_fighter" | "tank" | "enchanter";

export function archetypeOf(c: ChampionProfile): Archetype {
  const r = c.roles;
  if (r.includes("marksman") && c.damageType !== "magic") return "marksman";
  if (r[0] === "support" && c.durability <= 1) return "enchanter";
  if (r[0] === "tank" || (r.includes("support") && c.durability >= 2) || (c.durability === 3 && c.damage <= 2)) return "tank";
  if (c.damageType === "magic" || (c.damageType === "mixed" && r.includes("mage"))) {
    if (r.includes("assassin")) return "ap_assassin";
    if (c.attackType === "melee" && (r.includes("fighter") || r.includes("tank"))) return "ap_fighter";
    return "ap_mage";
  }
  return r.includes("assassin") ? "ad_assassin" : "ad_fighter";
}

/**
 * Wartość statystyk dla archetypu. Statystyka spoza listy = kara (np. AP dla strzelca).
 * Nazwy statystyk pochodzą wprost z opisów przedmiotów w Data Dragon.
 */
const NEUTRAL = { "Move Speed": 0, "Base Health Regen": 0, "Gold Per": 0 };
export const STAT_WEIGHTS: Record<Archetype, Record<string, number>> = {
  marksman: { ...NEUTRAL, "Attack Damage": 1, "Critical Strike Chance": 1, "Critical Strike Damage": 1, "Attack Speed": 1, "Armor Penetration%": 0.8, "Life Steal": 0.5, Lethality: 0.2, "Ability Haste": 0.1 },
  ad_assassin: { ...NEUTRAL, "Attack Damage": 1, Lethality: 1, "Ability Haste": 0.7, "Armor Penetration%": 0.4, Omnivamp: 0.2 },
  ad_fighter: { ...NEUTRAL, "Attack Damage": 1, Health: 0.9, "Ability Haste": 0.8, Omnivamp: 0.4, "Life Steal": 0.3, Armor: 0.3, "Magic Resist": 0.3, "Armor Penetration%": 0.4, Tenacity: 0.3, "Attack Speed": 0.2 },
  ap_mage: { ...NEUTRAL, "Ability Power": 1, "Ability Haste": 0.7, "Magic Penetration": 0.8, "Magic Penetration%": 0.8, Mana: 0.4, "Base Mana Regen": 0.2, Health: 0.1 },
  ap_assassin: { ...NEUTRAL, "Ability Power": 1, "Magic Penetration": 1, "Magic Penetration%": 0.8, "Ability Haste": 0.5, "Adaptive Force": 0.5 },
  ap_fighter: { ...NEUTRAL, "Ability Power": 1, Health: 0.9, "Ability Haste": 0.6, Omnivamp: 0.4, Armor: 0.3, "Magic Resist": 0.3, "Magic Penetration%": 0.4 },
  tank: { ...NEUTRAL, Health: 1, Armor: 0.9, "Magic Resist": 0.9, "Ability Haste": 0.6, Tenacity: 0.3, "Base Mana Regen": 0.1 },
  enchanter: { ...NEUTRAL, "Heal and Shield Power": 1, "Ability Haste": 0.8, "Ability Power": 0.4, "Base Mana Regen": 0.6, Mana: 0.3, Health: 0.2 },
};

/** Dopasowanie przedmiotu do postaci: średnia wartości jego statystyk (od ok. -0.5 do 1). */
export function itemFit(item: CatalogItem, arch: Archetype): number {
  const names = Object.keys(item.stats);
  if (!names.length) return 0;
  const w = STAT_WEIGHTS[arch];
  return names.reduce((s, n) => s + (w[n] ?? -0.5), 0) / names.length;
}
