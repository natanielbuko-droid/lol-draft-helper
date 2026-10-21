import type { ChampionProfile, TeamAnalysis } from "../../shared/types";
import type { CatalogItem } from "../data/itemCatalog";
import type { Archetype } from "./archetype";

/**
 * Reguły przedmiotów sytuacyjnych – zapisane deklaratywnie (jak tabela),
 * żeby łatwo było dodać nową regułę bez ruszania silnika.
 *
 *   strength(ctx)  -> 0..1, jak bardzo reguła jest potrzebna (0 = nie dotyczy)
 *   matches(item)  -> czy przedmiot realizuje tę potrzebę
 *   reason(ctx)    -> wyjaśnienie dla gracza
 *
 * Progi (THRESHOLDS) można stroić bez zmian w logice.
 */
export const THRESHOLDS = {
  healing: 4, // suma ocen leczenia wrogów (0–3 na postać)
  heavyHealing: 7,
  damageShare: 0.6, // od tego udziału AD/AP opłaca się dedykowana obrona
  frontline: 2, // liczba wytrzymałych wrogów
  avgDurability: 2.2,
  hardCC: 6, // suma umiejętności z twardym CC
  assassins: 2,
};

export interface RuleContext {
  me: ChampionProfile;
  arch: Archetype;
  enemy: TeamAnalysis;
}

export interface SituationalRule {
  id: string;
  strength(ctx: RuleContext): number;
  matches(item: CatalogItem, ctx: RuleContext): boolean;
  reason(ctx: RuleContext): string;
  /** Czy dopuszczać tańszy komponent (np. Executioner's Calling na wczesny anti-heal). */
  allowComponent?: (ctx: RuleContext) => boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const isDamageDealer = (a: Archetype) => a !== "tank" && a !== "enchanter";
const physicalArch = (a: Archetype) => a === "marksman" || a === "ad_assassin" || a === "ad_fighter";

export const RULES: SituationalRule[] = [
  {
    id: "anti-heal",
    // if enemy_healing > threshold -> recommend anti-heal
    strength: ({ enemy }) => (enemy.healing >= THRESHOLDS.healing ? Math.min(1, enemy.healing / THRESHOLDS.heavyHealing) : 0),
    matches: (item) => item.flags.antiHeal,
    allowComponent: ({ enemy }) => enemy.healing >= THRESHOLDS.heavyHealing,
    reason: ({ enemy }) => `Wrogowie mocno się leczą (wynik ${enemy.healing}) – Grievous Wounds obetnie leczenie.`,
  },
  {
    id: "armor",
    // if enemy_physical_share > 60% -> armor
    strength: ({ enemy, arch }) =>
      enemy.physicalShare >= THRESHOLDS.damageShare ? (enemy.physicalShare - 0.5) * 2 * (arch === "tank" ? 1 : 0.8) : 0,
    matches: (item) => item.flags.armor,
    reason: ({ enemy }) => `Przeciwnik zadaje ${pct(enemy.physicalShare)} obrażeń fizycznych – pancerz (Armor).`,
  },
  {
    id: "magic-resist",
    strength: ({ enemy, arch }) =>
      enemy.magicShare >= THRESHOLDS.damageShare ? (enemy.magicShare - 0.5) * 2 * (arch === "tank" ? 1 : 0.8) : 0,
    matches: (item) => item.flags.magicResist,
    reason: ({ enemy }) => `Przeciwnik zadaje ${pct(enemy.magicShare)} obrażeń magicznych – odporność na magię (MR).`,
  },
  {
    id: "anti-tank",
    // if enemy has >= 2 tanks or high avg durability -> % penetration
    strength: ({ enemy, arch }) =>
      isDamageDealer(arch) && (enemy.frontline >= THRESHOLDS.frontline || enemy.avgDurability >= THRESHOLDS.avgDurability) ? 0.8 : 0,
    matches: (item, { arch }) => (physicalArch(arch) ? item.flags.percentArmorPen : item.flags.percentMagicPen),
    reason: ({ enemy }) => `Wróg ma ${enemy.frontline} wytrzymałe postacie – procentowa penetracja (Armor/Magic Pen).`,
  },
  {
    id: "tenacity-cleanse",
    // if enemy_hard_cc > threshold -> tenacity / QSS
    strength: ({ enemy, me }) => (enemy.hardCC >= THRESHOLDS.hardCC ? Math.min(1, enemy.hardCC / 10) * (me.isCarry ? 1 : 0.7) : 0),
    matches: (item, { me, arch }) => (me.isCarry || arch === "enchanter" ? item.flags.cleanse || item.flags.tenacity : item.flags.tenacity),
    reason: ({ enemy }) => `Dużo twardego CC u wroga (${enemy.hardCC} umiejętności) – nieustępliwość (Tenacity) lub oczyszczenie (QSS).`,
  },
  {
    id: "anti-burst",
    strength: ({ enemy, me }) => (enemy.assassins >= THRESHOLDS.assassins && me.durability <= 2 ? 0.7 : 0),
    matches: (item) => item.flags.stasis || item.flags.spellShield || item.flags.lifeline,
    reason: ({ enemy }) => `${enemy.assassins} zabójców u wroga – przedmiot obronny przeciw burstowi (Stasis / tarcza / Lifeline).`,
  },
];
