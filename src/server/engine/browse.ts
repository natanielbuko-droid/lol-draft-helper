import {
  POSITIONS,
  type Archetype,
  type ArchetypeExample,
  type ChampionDetail,
  type ChampionListEntry,
  type ChampionProfile,
  type MatchupEntry,
  type Position,
  type Tier,
  type TierEntry,
} from "../../shared/types";
import type { GameData } from "../data/gameData";
import { smoothedWinrate, type StatsStore, type WL } from "../data/statsStore";
import { ARCHETYPES } from "./archetypes";
import { recommendBuild } from "./buildEngine";
import { MIN_PICK_RATE, metaScore } from "./pickEngine";
import { heuristicPositionFit } from "./teamAnalysis";
import { abilityText } from "./vocab";

/**
 * Przeglądanie poza champ selectem: tier lista, lista postaci, strona postaci i archetypy składów.
 * Wszystko liczone z tych samych statystyk co rekomendacje w drafcie.
 */

/** Minimalna liczba wspólnych meczów, żeby pokazać matchup albo synergię. */
const MIN_PAIR = 10;
/** Udział w tier liście: S = najlepsze 10%, A = kolejne 20%, B = 30%, C = 25%, D = reszta. */
const TIER_CUTS: [number, Tier][] = [
  [0.1, "S"],
  [0.3, "A"],
  [0.6, "B"],
  [0.85, "C"],
  [1, "D"],
];

export type TierLists = Record<Position, TierEntry[]>;

/** Tier lista na każdą pozycję: postacie grane na niej wystarczająco często, posortowane po sile na patchu. */
export function tierLists(data: GameData, stats: StatsStore): TierLists {
  const out = {} as TierLists;
  for (const position of POSITIONS) {
    const positionGames = stats.totalGamesOnPosition(position);
    const avgPickRate = 1 / Math.max(1, stats.championsOnPosition(position));
    const minGames = Math.max(10, positionGames * MIN_PICK_RATE);
    const scored = [...data.champions.values()]
      .map((c) => ({ c, wl: stats.championWL(c.id, position) }))
      .filter((x): x is { c: ChampionProfile; wl: WL } => !!x.wl && x.wl.games >= minGames)
      .map(({ c, wl }) => ({ c, wl, m: metaScore(wl, positionGames, avgPickRate) }))
      .sort((a, b) => b.m.meta - a.m.meta);
    out[position] = scored.map(({ c, wl, m }, i) => ({
      championId: c.id,
      name: c.name,
      image: c.image,
      tier: TIER_CUTS.find(([cut]) => i / scored.length < cut)![1],
      rank: i + 1,
      winrate: wl.wins / wl.games,
      pickRate: m.pickRate,
      games: wl.games,
      roles: c.roles,
    }));
  }
  return out;
}

/** Pozycje postaci od najczęstszej (tylko te z co najmniej 10% jej gier). Bez statystyk – z klasy postaci. */
function positionsOf(c: ChampionProfile, stats: StatsStore): { position: Position; games: number; share: number; winrate: number }[] {
  const byPos = stats.current.champions[c.id] ?? {};
  const total = POSITIONS.reduce((s, p) => s + (byPos[p]?.games ?? 0), 0);
  const list = POSITIONS.map((position) => {
    const wl = byPos[position];
    return { position, games: wl?.games ?? 0, share: total ? (wl?.games ?? 0) / total : 0, winrate: wl?.games ? wl.wins / wl.games : 0 };
  })
    .filter((p) => p.games >= 10 && p.share >= 0.1)
    .sort((a, b) => b.games - a.games);
  if (list.length) return list;
  const best = [...POSITIONS].sort((a, b) => heuristicPositionFit(c, b) - heuristicPositionFit(c, a))[0];
  return [{ position: best, games: 0, share: 0, winrate: 0 }];
}

export function championList(data: GameData, stats: StatsStore, tiers: TierLists): ChampionListEntry[] {
  return [...data.champions.values()]
    .map((c) => {
      const positions = positionsOf(c, stats).map((p) => p.position);
      return {
        championId: c.id,
        name: c.name,
        image: c.image,
        roles: c.roles,
        positions,
        tier: tiers[positions[0]].find((t) => t.championId === c.id)?.tier ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/** Mocne i słabe strony z profilu postaci – konkretnie, z nazwami umiejętności. */
function strengthsAndWeaknesses(c: ChampionProfile): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const cc = abilityText(c, "cc");
  const dash = abilityText(c, "dash");
  const heal = abilityText(c, "heal");
  if (c.hardCC >= 2) strengths.push(`Dużo twardego CC: ${cc} – łapie i unieruchamia wrogów.`);
  else if (c.hardCC === 1) strengths.push(`Twarde CC: ${cc}.`);
  else weaknesses.push("Brak twardego CC – łapanie wrogów zostaje dla drużyny.");
  if (dash) strengths.push(`Mobilność: ${dash} – łatwiej dogonić wroga i uciec.`);
  else weaknesses.push("Brak doskoku – łatwy cel dla zabójców i postaci z CC.");
  if (c.healing >= 2) {
    strengths.push(`Leczy się${heal ? `: ${heal}` : ""} – wygrywa długie walki.`);
    weaknesses.push("Leczenie słabnie przez przedmioty z Grievous Wounds (anty-heal).");
  }
  if (c.durability >= 3) strengths.push("Bardzo wytrzymała – może przyjmować obrażenia za drużynę.");
  if (c.damage >= 3) strengths.push("Bardzo duże obrażenia.");
  if (c.utility >= 3) strengths.push("Duże wsparcie drużyny (osłony, leczenie, przyspieszenia).");
  if (c.isCarry) weaknesses.push("Krucha – w walkach potrzebuje ochrony drużyny.");
  if (c.attackType === "melee" && c.durability <= 1) weaknesses.push("Walczy wręcz przy małej wytrzymałości – musi dobrze wybrać moment wejścia.");
  return { strengths, weaknesses };
}

function matchup(data: GameData, id: number, wl: WL, base: number): MatchupEntry | null {
  const c = data.champions.get(id);
  if (!c) return null;
  return { championId: id, name: c.name, image: c.image, games: wl.games, winrate: wl.wins / wl.games, delta: smoothedWinrate(wl, 40, base) - base };
}

/** Matchupy / synergie z wystarczającą liczbą meczów, od najkorzystniejszych. */
function pairs(data: GameData, map: Record<string, WL> | undefined, base: number): MatchupEntry[] {
  return Object.entries(map ?? {})
    .filter(([, wl]) => wl.games >= MIN_PAIR)
    .map(([id, wl]) => matchup(data, Number(id), wl, base))
    .filter((m): m is MatchupEntry => !!m)
    .sort((a, b) => b.delta - a.delta);
}

export function championDetail(
  id: number,
  requested: Position | null,
  data: GameData,
  stats: StatsStore,
  tiers: TierLists,
): ChampionDetail | null {
  const c = data.champions.get(id);
  if (!c) return null;
  const positions = positionsOf(c, stats);
  const position = requested ?? positions[0].position;
  const wl = stats.championWL(id, position);
  const base = smoothedWinrate(wl, 150);
  const tierEntry = tiers[position].find((t) => t.championId === id);
  const positionGames = stats.totalGamesOnPosition(position);

  const build = recommendBuild(c, position, [], data, stats);
  // Na stronie postaci nie ma draftu – uwaga o brakujących przeciwnikach jest tu zbędna.
  build.notes = build.notes.filter((n) => !n.startsWith("Przeciwnicy jeszcze nie wybrali"));

  const lane = pairs(data, stats.current.lane[`${id}:${position}`], base);
  const synergies = pairs(data, stats.current.with[id], base);
  return {
    championId: id,
    name: c.name,
    image: c.image,
    roles: c.roles,
    damageType: c.damageType,
    attackType: c.attackType,
    ratings: { damage: c.damage, durability: c.durability, crowdControl: c.crowdControl, mobility: c.mobility, utility: c.utility },
    position,
    positions: positions.some((p) => p.position === position) ? positions : [...positions, { position, games: wl?.games ?? 0, share: 0, winrate: 0 }],
    tier: tierEntry?.tier ?? null,
    rank: tierEntry?.rank ?? null,
    ofCount: tiers[position].length,
    winrate: wl?.games ? wl.wins / wl.games : null,
    pickRate: wl?.games && positionGames ? wl.games / positionGames : null,
    games: wl?.games ?? 0,
    ...strengthsAndWeaknesses(c),
    archetypes: ARCHETYPES.filter((a) => a.champions.includes(c.key)).map((a) => ({ id: a.id, name: a.name })),
    build,
    goodAgainst: lane.filter((m) => m.delta > 0.01).slice(0, 6),
    badAgainst: lane.filter((m) => m.delta < -0.01).reverse().slice(0, 6),
    synergies: synergies.filter((m) => m.delta > 0.01).slice(0, 6),
  };
}

/** Archetypy z przykładowymi postaciami na każdą pozycję (główna pozycja postaci ze statystyk). */
export function archetypes(data: GameData, stats: StatsStore): Archetype[] {
  return ARCHETYPES.map(({ champions, ...def }) => {
    const examples: Partial<Record<Position, ArchetypeExample[]>> = {};
    for (const key of champions) {
      const c = data.championsByKey.get(key);
      if (!c) continue;
      const main = positionsOf(c, stats)[0];
      (examples[main.position] ??= []).push({
        championId: c.id,
        name: c.name,
        image: c.image,
        winrate: main.games ? main.winrate : null,
        games: main.games,
      });
    }
    for (const list of Object.values(examples)) list!.sort((a, b) => b.games - a.games);
    return { ...def, examples };
  });
}
