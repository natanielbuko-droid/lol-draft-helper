import type { AbilityInfo, ChampionProfile } from "../../shared/types";
import type { CDragonChampion } from "./cdragon";
import type { DDragonChampion } from "./ddragon";
import { img } from "./ddragon";

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ");

// Frazy, które zawierają słowo "heal", ale oznaczają osłabianie leczenia przeciwnika.
const ANTI_HEAL = /grievous wounds|reduc\w* (?:\w+ )?heal\w*|wounds/gi;
const HEALING = /\bheal(?:s|ing|ed)?\b|restores? .{0,25}health|omnivamp|life ?steal|physical vamp|drains?\b/i;
// Ucieczka: doskok/skok/teleport, ale też nietykalność i niewidzialność (np. Kałuża Krwi Vladimira).
const DASH = /\bdash(?:es|ing)?\b|\bleaps?\b|\bblinks?\b|\bjumps?\b|\blunges?\b|\bteleports?\b|\buntargetable\b|\binvisib|\bcamouflage/i;
const HARD_CC =
  /\bstun|knock(?:s|ed|ing)? (?:up|back|aside)|airborne|suppress|\bcharm|\btaunt|\bfear|\bflee|\bsleep|\broot|\bsnare|immobiliz|\bpulls?\b|\bground(?:s|ed)?\b/i;

/**
 * Buduje profil postaci wyłącznie z danych pobranych z sieci.
 * Gdy wyjdzie nowa postać, profil powstanie automatycznie przy kolejnym odświeżeniu patcha.
 */
export function buildChampionProfile(
  dd: DDragonChampion,
  cd: CDragonChampion | undefined,
  displayName: string | undefined,
  version: string,
  abilityNames?: { passive: string; spells: string[] },
): ChampionProfile {
  const id = Number(dd.key);
  const roles = cd?.roles?.length ? cd.roles : dd.tags.map((t) => t.toLowerCase());
  const ps = cd?.playstyleInfo ?? { damage: 2, durability: 2, crowdControl: 2, mobility: 2, utility: 2 };

  const damageType: ChampionProfile["damageType"] = cd
    ? cd.tacticalInfo.damageType === "kMagic"
      ? "magic"
      : cd.tacticalInfo.damageType === "kMixed"
        ? "mixed"
        : "physical"
    : roles.includes("mage")
      ? "magic"
      : "physical";

  // Analiza opisów umiejętności: ile z nich leczy, ile ma twarde CC.
  const texts = cd ? [cd.passive.description, ...cd.spells.map((s) => s.description)].map(stripTags) : [];
  const healingSpells = texts.filter((t) => HEALING.test(t.replace(ANTI_HEAL, ""))).length;
  const hardCC = texts.filter((t) => HARD_CC.test(t)).length;

  // Pasywka + Q/W/E/R z nazwą w języku UI i cechami wykrytymi z opisu.
  const slots: AbilityInfo["slot"][] = ["P", "Q", "W", "E", "R"];
  const cdNames = cd ? [cd.passive.name, ...cd.spells.map((s) => s.name)] : [];
  const localNames = abilityNames ? [abilityNames.passive, ...abilityNames.spells] : [];
  const abilities: AbilityInfo[] = texts.map((t, i) => ({
    slot: slots[i],
    name: localNames[i] ?? cdNames[i] ?? slots[i],
    cc: HARD_CC.test(t),
    heal: HEALING.test(t.replace(ANTI_HEAL, "")),
    dash: DASH.test(t),
  }));

  return {
    id,
    key: dd.id,
    name: displayName ?? dd.name,
    image: img.champion(version, dd.image.full),
    roles,
    damageType,
    attackType: cd?.tacticalInfo.attackType === "melee" ? "melee" : cd ? "ranged" : roles.includes("marksman") ? "ranged" : "melee",
    damage: ps.damage,
    durability: ps.durability,
    crowdControl: ps.crowdControl,
    mobility: ps.mobility,
    utility: ps.utility,
    healing: Math.min(3, healingSpells),
    hardCC,
    isCarry: ps.damage === 3 && ps.durability === 1,
    abilities,
  };
}
