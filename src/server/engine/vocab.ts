import type { AbilityInfo, ChampionProfile, Position } from "../../shared/types";

/**
 * SŁOWNIK – wspólne zwroty do opisów w aplikacji.
 * Cel: konkretne zdania z nazwami postaci, umiejętności i liczbami zamiast ogólników.
 */

/** 0.0271 -> "2,7%" */
export const pct = (x: number) => `${(Math.abs(x) * 100).toFixed(1).replace(".", ",")}%`;

/** 0.634 -> "63%" (zaokrąglone, do udziałów w składzie) */
export const pct0 = (x: number) => `${Math.round(x * 100)}%`;

const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;

/** 1 mecz, 2–4 mecze, 5+ meczów */
export const matches = (n: number) => plural(n, "mecz", "mecze", "meczów");

/** Po przyimku "w": "w 1 meczu", "w 9 meczach". */
export const inMatches = (n: number) => (n === 1 ? "w 1 meczu" : `w ${n} meczach`);

/** ["A", "B", "C"] -> "A, B i C" */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} i ${list[list.length - 1]}`;
}

/** Umiejętności z daną cechą (bez pasywki – jej opisy częściej dają fałszywe trafienia). */
export function abilitiesWith(c: ChampionProfile, flag: "cc" | "heal" | "dash"): AbilityInfo[] {
  return c.abilities.filter((a) => a.slot !== "P" && a[flag]);
}

/** "E (Ostrze Zenitu) i R (Rozbłysk Słoneczny)" – albo "" gdy brak. */
export function abilityText(c: ChampionProfile, flag: "cc" | "heal" | "dash"): string {
  return names(abilitiesWith(c, flag).map((a) => `${a.slot} (${a.name})`));
}

/** "Vladimir (Transfuzja, Hemoplaga)" – postać z nazwami umiejętności o danej cesze. */
export function championWith(c: ChampionProfile, flag: "cc" | "heal" | "dash"): string {
  const abilities = abilitiesWith(c, flag).map((a) => a.name);
  return abilities.length ? `${c.name} (${abilities.join(", ")})` : c.name;
}

export const POSITION_NAME: Record<Position, string> = {
  TOP: "na topie",
  JUNGLE: "w dżungli",
  MIDDLE: "na midzie",
  BOTTOM: "na ADC",
  UTILITY: "na supporcie",
};

export const DAMAGE_NAME = { physical: "fizyczne", magic: "magiczne", mixed: "mieszane" } as const;
