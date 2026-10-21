import type { ChampionProfile, Position, TeamAnalysis } from "../../shared/types";
import { POSITIONS } from "../../shared/types";
import type { StatsStore } from "../data/statsStore";
import { abilitiesWith, championWith, names } from "./vocab";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Analiza składu drużyny: rozkład obrażeń, CC, leczenie, frontline.
 * Działa na profilach postaci, więc nie potrzebuje statystyk – wystarczą dane z patcha.
 */
export function analyzeTeam(champs: ChampionProfile[]): TeamAnalysis {
  let physW = 0;
  let totalW = 0;
  for (const c of champs) {
    const w = c.damage; // postać zadająca więcej obrażeń "waży" więcej
    physW += w * (c.damageType === "physical" ? 1 : c.damageType === "mixed" ? 0.5 : 0);
    totalW += w;
  }
  const physicalShare = totalW ? physW / totalW : 0.5;
  const sum = (f: (c: ChampionProfile) => number) => champs.reduce((s, c) => s + f(c), 0);

  const pick = (f: (c: ChampionProfile) => boolean) => champs.filter(f);
  const isTank = (c: ChampionProfile) => c.durability === 3 || c.roles[0] === "tank";
  const isDiver = (c: ChampionProfile) => c.attackType === "melee" && c.damage >= 2 && (c.roles.includes("fighter") || c.roles.includes("assassin"));
  // Kto leczy / ma CC – od najsilniejszego, z nazwami umiejętności ("Vladimir (Transfuzja, Hemoplaga)").
  const healers = pick((c) => c.healing >= 1 && abilitiesWith(c, "heal").length > 0).sort((a, b) => b.healing - a.healing);
  const ccChamps = pick((c) => abilitiesWith(c, "cc").length > 0).sort((a, b) => b.hardCC - a.hardCC);

  const analysis: TeamAnalysis = {
    champions: champs.map((c) => c.name),
    physicalShare,
    magicShare: 1 - physicalShare,
    totalCC: sum((c) => c.crowdControl),
    hardCC: sum((c) => c.hardCC),
    healing: sum((c) => c.healing),
    frontline: pick(isTank).length,
    avgDurability: champs.length ? sum((c) => c.durability) / champs.length : 0,
    assassins: pick((c) => c.roles.includes("assassin")).length,
    divers: pick(isDiver).length,
    melee: pick((c) => c.attackType === "melee").length,
    carries: pick((c) => c.isCarry).map((c) => c.name),
    who: {
      physical: pick((c) => c.damageType === "physical" && c.damage >= 2).map((c) => c.name),
      magic: pick((c) => c.damageType === "magic" && c.damage >= 2).map((c) => c.name),
      healers: healers.map((c) => championWith(c, "heal")),
      cc: ccChamps.map((c) => championWith(c, "cc")),
      tanks: pick(isTank).map((c) => c.name),
      assassins: pick((c) => c.roles.includes("assassin")).map((c) => c.name),
      divers: pick(isDiver).map((c) => c.name),
      melee: pick((c) => c.attackType === "melee").map((c) => c.name),
      squishy: pick((c) => c.durability === 1).map((c) => c.name),
    },
    notes: [],
  };

  const n = champs.length;
  const w = analysis.who;
  if (n >= 2) {
    if (physicalShare >= 0.7) analysis.notes.push(`Głównie obrażenia fizyczne (${pct(physicalShare)}): ${names(w.physical)}`);
    else if (physicalShare <= 0.3) analysis.notes.push(`Głównie obrażenia magiczne (${pct(1 - physicalShare)}): ${names(w.magic)}`);
    else analysis.notes.push(`Mieszane obrażenia – AD ${pct(physicalShare)} / AP ${pct(1 - physicalShare)}`);
    if (analysis.frontline === 0) analysis.notes.push(`Brak tanka – nikt (${names(analysis.champions)}) nie przyjmie obrażeń na froncie`);
    else analysis.notes.push(`Front: ${names(w.tanks)}`);
    if (analysis.healing >= 4) analysis.notes.push(`Dużo leczenia: ${names(w.healers.slice(0, 3))}`);
    if (analysis.hardCC >= n * 1.6) analysis.notes.push(`Dużo twardego CC: ${names(w.cc.slice(0, 3))}`);
    if (analysis.assassins >= 2) analysis.notes.push(`Zabójcy: ${names(w.assassins)} – groźni dla miękkich postaci`);
  }
  return analysis;
}

/** Jak bardzo klasa postaci pasuje do pozycji (używane, gdy brak statystyk). */
export function heuristicPositionFit(c: ChampionProfile, pos: Position): number {
  const r = new Set(c.roles);
  const main = c.roles[0];
  let fit = 0.05;
  switch (pos) {
    case "TOP":
      fit += (r.has("fighter") ? 0.5 : 0) + (r.has("tank") ? 0.3 : 0) + (c.attackType === "melee" ? 0.1 : -0.1);
      break;
    case "JUNGLE":
      fit += (r.has("fighter") ? 0.3 : 0) + (r.has("assassin") ? 0.3 : 0) + (r.has("tank") ? 0.2 : 0) + (c.mobility >= 2 ? 0.1 : 0);
      break;
    case "MIDDLE":
      fit += (main === "mage" ? 0.6 : r.has("mage") ? 0.3 : 0) + (r.has("assassin") ? 0.4 : 0);
      break;
    case "BOTTOM":
      fit += main === "marksman" ? 0.9 : r.has("marksman") ? 0.4 : 0;
      break;
    case "UTILITY":
      fit += (main === "support" ? 0.8 : r.has("support") ? 0.5 : 0) + (r.has("tank") && c.utility >= 2 ? 0.2 : 0);
      break;
  }
  return fit;
}

/**
 * Przypisuje pozycje drużynie (np. wrogom, których role nie są znane w champ selekcie).
 * Sprawdza wszystkie 120 permutacji i wybiera najbardziej prawdopodobną.
 */
export function inferPositions(champs: ChampionProfile[], stats: StatsStore, taken: Position[] = []): Map<number, Position> {
  const free = POSITIONS.filter((p) => !taken.includes(p));
  const prob = (c: ChampionProfile, p: Position) => {
    const s = stats.positionProbability(c.id, p);
    const h = heuristicPositionFit(c, p);
    return Math.log((stats.hasData && s > 0 ? 0.8 * s + 0.2 * h : h) + 1e-3);
  };

  let best: Position[] = [];
  let bestScore = -Infinity;
  const permute = (rest: Position[], chosen: Position[], score: number) => {
    if (chosen.length === Math.min(champs.length, free.length)) {
      if (score > bestScore) [bestScore, best] = [score, [...chosen]];
      return;
    }
    const c = champs[chosen.length];
    for (const p of rest) permute(rest.filter((x) => x !== p), [...chosen, p], score + prob(c, p));
  };
  permute(free, [], 0);

  const out = new Map<number, Position>();
  best.forEach((p, i) => out.set(champs[i].id, p));
  return out;
}
