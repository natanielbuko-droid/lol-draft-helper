import type {
  BuildRecommendation,
  ChampionProfile,
  ItemRef,
  Position,
  RuneRecommendation,
  RuneRef,
  SituationalItem,
  Skill,
  SpellRef,
  TeamAnalysis,
} from "../../shared/types";
import { cdragonAsset } from "../data/cdragon";
import type { GameData } from "../data/gameData";
import type { CatalogItem } from "../data/itemCatalog";
import { smoothedWinrate, type BuildStats, type WL } from "../data/statsStore";
import type { StatsStore } from "../data/statsStore";
import { archetypeOf, itemFit, type Archetype } from "./archetype";
import { RULES, THRESHOLDS, type RuleContext } from "./rules";
import { analyzeTeam } from "./teamAnalysis";

const toRef = (i: CatalogItem): ItemRef => ({ id: i.id, name: i.name, image: i.image, gold: i.gold });

/**
 * Najlepszy wpis statystyk: wśród `top` najczęstszych wybiera ten z najwyższym wygładzonym winrate.
 * Niski próg `minGames` pozwala korzystać z małych próbek – wygładzanie i tak tłumi przypadkowe wyniki.
 */
function bestEntry(entries: Record<string, WL> | undefined, minGames = 3, top = 5): string | null {
  if (!entries) return null;
  const list = Object.entries(entries)
    .filter(([, wl]) => wl.games >= minGames)
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, top);
  if (!list.length) return null;
  list.sort((a, b) => smoothedWinrate(b[1], 20) - smoothedWinrate(a[1], 20));
  return list[0][0];
}

// ---------------------------------------------------------------- CORE ---

function coreItems(arch: Archetype, items: Map<string, CatalogItem>, bs: BuildStats | undefined): { core: CatalogItem[]; fromStats: boolean } {
  const usable = (id: string) => {
    const it = items.get(id);
    return it && it.isCompleted && !it.isBoots ? it : undefined;
  };

  // 1) Statystyki: najlepsza kolejność 3 przedmiotów (z osi czasu meczów).
  const order = bestEntry(bs?.coreOrders);
  if (order) {
    const core = order.split(">").map(usable).filter((x): x is CatalogItem => !!x);
    if (core.length >= 3) return { core: core.slice(0, 3), fromStats: true };
  }
  // 2) Statystyki: najczęściej kupowane ukończone przedmioty.
  if (bs) {
    const core = Object.entries(bs.items)
      .sort((a, b) => b[1].games - a[1].games)
      .map(([id]) => usable(id))
      .filter((x): x is CatalogItem => !!x)
      .slice(0, 3);
    if (core.length >= 3) return { core, fromStats: true };
  }
  // 3) Heurystyka: przedmioty, których statystyki najlepiej pasują do archetypu.
  //    Pomijamy przedmioty "sytuacyjne" – te dobiera osobny moduł reguł.
  const core = [...items.values()]
    .filter((i) => i.isCompleted && !i.isBoots)
    .filter((i) => !(i.flags.antiHeal || i.flags.cleanse || i.flags.stasis || i.flags.lifeline || i.flags.spellShield))
    .map((i) => ({ i, fit: itemFit(i, arch) }))
    .sort((a, b) => b.fit - a.fit || b.i.gold - a.i.gold)
    .slice(0, 3)
    .map((x) => x.i);
  return { core, fromStats: false };
}

// --------------------------------------------------------------- BOOTS ---

function chooseBoots(arch: Archetype, enemy: TeamAnalysis, items: Map<string, CatalogItem>, bs: BuildStats | undefined) {
  const boots = [...items.values()].filter((i) => i.isBoots && i.isCompleted);
  let reason = "";
  // Sytuacyjnie: dużo CC lub magii -> buty z Tenacity/MR; dużo AD i walka wręcz -> buty z pancerzem.
  const frontliner = arch === "tank" || arch === "ad_fighter" || arch === "ap_fighter" || arch === "ad_assassin";
  let pick: CatalogItem | undefined;
  if (enemy.hardCC >= THRESHOLDS.hardCC || (enemy.magicShare >= 0.65 && frontliner)) {
    pick = boots.find((b) => b.flags.tenacity && b.flags.magicResist);
    if (pick) reason = "Buty z nieustępliwością/MR – wróg ma dużo CC lub obrażeń magicznych.";
  } else if (enemy.physicalShare >= 0.7 && frontliner) {
    pick = boots.find((b) => b.flags.armor);
    if (pick) reason = "Buty z pancerzem – wróg zadaje głównie obrażenia fizyczne.";
  }
  if (!pick && bs) {
    // Tylko pełne buty (poziom 2) z co najmniej kilku gier – podstawowe "Buty" w ekwipunku to zwykle niedokończony zakup.
    const id = Object.entries(bs.items)
      .filter(([id, wl]) => items.get(id)?.isBoots && items.get(id)?.isCompleted && wl.games >= 3)
      .sort((a, b) => b[1].games - a[1].games)[0]?.[0];
    pick = id ? items.get(id) : undefined;
  }
  pick ??= boots.map((b) => ({ b, fit: itemFit(b, arch) })).sort((a, b) => b.fit - a.fit)[0]?.b;
  return { boots: pick ?? null, reason };
}

// ---------------------------------------------------------- SITUATIONAL ---

export function situationalItems(ctx: RuleContext, items: Map<string, CatalogItem>, exclude: Set<string>): SituationalItem[] {
  const out = new Map<string, SituationalItem>();
  for (const rule of RULES) {
    const strength = rule.strength(ctx);
    if (strength <= 0) continue;
    const allowComponent = rule.allowComponent?.(ctx) ?? false;
    const candidates = [...items.values()]
      .filter((i) => !i.isBoots && !exclude.has(i.id))
      .filter((i) => i.isCompleted || (allowComponent && i.isComponent))
      .filter((i) => rule.matches(i, ctx))
      .map((i) => ({ i, fit: itemFit(i, ctx.arch) }))
      .filter((x) => x.fit > -0.25) // przedmiot musi choć trochę pasować do postaci
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 2);

    for (const { i, fit } of candidates) {
      const priority = Math.min(1, strength * (0.7 + 0.3 * fit));
      const existing = out.get(i.id);
      if (existing) {
        // Ten sam przedmiot spełnia kilka potrzeb – tym lepiej, podbijamy priorytet.
        existing.priority = Math.min(1, existing.priority + priority * 0.5);
        existing.reason += ` ${rule.reason(ctx)}`;
      } else {
        out.set(i.id, { ...toRef(i), rule: rule.id, reason: rule.reason(ctx), priority });
      }
    }
  }
  return [...out.values()].sort((a, b) => b.priority - a.priority).slice(0, 6);
}

// ------------------------------------------------------- SUMMONER SPELLS ---

function chooseSummoners(me: ChampionProfile, position: Position, enemy: TeamAnalysis, data: GameData, bs: BuildStats | undefined) {
  const byKey = new Map([...data.summoners.values()].map((s) => [s.key, s]));
  const fromStats = bestEntry(bs?.summoners);
  if (fromStats) {
    const spells = fromStats.split("+").map((k) => byKey.get(Number(k))).filter((s) => !!s);
    if (spells.length === 2) return { spells, reason: "Najskuteczniejsza para czarów na tym patchu (statystyki)." };
  }

  // Heurystyka: Flash + czar zależny od pozycji, korygowany przez skład wroga.
  let second = { TOP: "SummonerTeleport", JUNGLE: "SummonerSmite", MIDDLE: "SummonerDot", BOTTOM: "SummonerHeal", UTILITY: "SummonerDot" }[position];
  let reason = "Standardowy zestaw dla tej pozycji.";
  if (position === "BOTTOM" && enemy.hardCC >= THRESHOLDS.hardCC + 2) {
    second = "SummonerBoost"; // Cleanse
    reason = "Wróg ma bardzo dużo twardego CC – Cleanse zamiast Heal.";
  } else if (position === "UTILITY" && (enemy.assassins >= 1 || enemy.carries.length >= 2)) {
    second = "SummonerExhaust";
    reason = "Exhaust neutralizuje zabójców / carry przeciwnika.";
  } else if (position === "MIDDLE" && enemy.assassins >= THRESHOLDS.assassins && me.isCarry) {
    second = "SummonerBarrier";
    reason = "Barrier chroni przed burstem zabójców.";
  } else if (position === "TOP" && enemy.healing >= THRESHOLDS.heavyHealing) {
    second = "SummonerDot";
    reason = "Ignite (z Grievous Wounds) na leczącego się przeciwnika.";
  }
  const spells = ["SummonerFlash", second].map((id) => data.summoners.get(id)).filter((s) => !!s);
  return { spells, reason };
}

// ----------------------------------------------------------------- RUNES ---

const RUNE_HEURISTIC: Record<Archetype, [string, string[], string]> = {
  marksman: ["Precision", ["LethalTempo", "PressTheAttack", "FleetFootwork"], "Inspiration"],
  ad_assassin: ["Domination", ["Electrocute", "HailOfBlades"], "Sorcery"],
  ad_fighter: ["Precision", ["Conqueror"], "Resolve"],
  ap_mage: ["Sorcery", ["ArcaneComet", "SummonAery"], "Inspiration"],
  ap_assassin: ["Domination", ["Electrocute", "DarkHarvest"], "Sorcery"],
  ap_fighter: ["Precision", ["Conqueror"], "Resolve"],
  tank: ["Resolve", ["GraspOfTheUndying", "Aftershock"], "Inspiration"],
  enchanter: ["Sorcery", ["SummonAery"], "Resolve"],
};

/** Preferowane odłamki (atak / elastyczny / obrona) – ID z plików klienta; niedostępny zastępuje pierwszy w rzędzie. */
const SHARD_PREFERENCE: Record<Archetype, [number, number, number]> = {
  marksman: [5005, 5008, 5011],
  ad_assassin: [5008, 5008, 5011],
  ad_fighter: [5008, 5008, 5011],
  ap_mage: [5008, 5008, 5011],
  ap_assassin: [5008, 5008, 5011],
  ap_fighter: [5008, 5008, 5011],
  tank: [5007, 5008, 5011],
  enchanter: [5007, 5008, 5011],
};

/** Składa pełną stronę run (9 run) z nazwami i ikonami. Zwraca null, gdy któraś runa nie istnieje w bieżącym patchu. */
function runePage(
  perkIds: number[],
  primaryStyleId: number,
  subStyleId: number,
  data: GameData,
  source: "stats" | "heuristic",
): RuneRecommendation | null {
  const pt = data.perkStyles.find((s) => s.id === primaryStyleId);
  const st = data.perkStyles.find((s) => s.id === subStyleId);
  const perks = perkIds.map((id) => data.perks.get(id));
  if (!pt || !st || perkIds.length !== 9 || perks.some((p) => !p)) return null;
  const all = perks as RuneRef[];
  const tree = (s: typeof pt): RuneRef => ({ id: s.id, name: s.name, image: cdragonAsset(s.iconPath) });
  return {
    primaryTree: tree(pt),
    secondaryTree: tree(st),
    primary: all.slice(0, 4),
    secondary: all.slice(4, 6),
    shards: all.slice(6, 9),
    perkIds,
    primaryStyleId,
    subStyleId,
    source,
  };
}

function chooseRunes(arch: Archetype, position: Position, data: GameData, bs: BuildStats | undefined): RuneRecommendation | null {
  // Ze statystyk: "primaryStyle|subStyle|perk,perk,..." – najczęstsza skuteczna strona run.
  const fromStats = bestEntry(bs?.runes);
  if (fromStats) {
    const [primary, sub, perks] = fromStats.split("|");
    const page = runePage(perks.split(",").map(Number), Number(primary), Number(sub), data, "stats");
    if (page) return page;
  }

  // Heurystyka: drzewo i kamień węgielny wg archetypu, pozostałe rzędy – pierwsza runa w rzędzie.
  // Gdy runę usunięto w nowym patchu – bierzemy pierwszą dostępną, więc strona zawsze jest poprawna.
  let [primaryKey, keystones, secondaryKey] = RUNE_HEURISTIC[arch];
  if (position === "UTILITY" && arch === "tank") keystones = ["Aftershock", "Guardian"];
  const trees = data.runeTrees;
  const ddPrimary = trees.find((t) => t.key === primaryKey) ?? trees[0];
  const ddSecondary = trees.find((t) => t.key === secondaryKey && t.id !== ddPrimary?.id) ?? trees.find((t) => t.id !== ddPrimary?.id);
  const pt = data.perkStyles.find((s) => s.id === ddPrimary?.id);
  const st = data.perkStyles.find((s) => s.id === ddSecondary?.id);
  if (!ddPrimary || !pt || !st) return null;

  const slot0 = ddPrimary.slots[0].runes;
  const keystone = keystones.map((k) => slot0.find((r) => r.key === k)).find((r) => !!r) ?? slot0[0];
  const regularRows = (s: typeof pt) => s.slots.filter((x) => x.type !== "kKeyStone" && x.type !== "kStatMod");
  const shards = pt.slots
    .filter((x) => x.type === "kStatMod")
    .map((row, i) => (row.perks.includes(SHARD_PREFERENCE[arch][i]) ? SHARD_PREFERENCE[arch][i] : row.perks[0]));
  const perkIds = [
    keystone.id,
    ...regularRows(pt).slice(0, 3).map((r) => r.perks[0]),
    ...regularRows(st).slice(0, 2).map((r) => r.perks[0]),
    ...shards,
  ];
  return runePage(perkIds, pt.id, st.id, data, "heuristic");
}

// ---------------------------------------------------------- SKILL ORDER ---

/**
 * Rozpisuje kolejność maksowania na poziomy 1–18: najpierw po jednym punkcie w każdą umiejętność,
 * R na 6/11/16, potem maksowanie w podanej kolejności. Umiejętność może mieć najwyżej
 * floor((poziom+1)/2) punktów (zasada gry: 5. poziom umiejętności dopiero na 9. poziomie postaci).
 */
export function skillLevels(max: Skill[]): Skill[] {
  const points: Record<Skill, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const levels: Skill[] = [];
  for (let lvl = 1; lvl <= 18; lvl++) {
    const cap = Math.floor((lvl + 1) / 2);
    const skill: Skill = [6, 11, 16].includes(lvl)
      ? "R"
      : lvl <= 3
        ? max[lvl - 1]
        : (max.find((s) => points[s] < 5 && points[s] < cap) ?? max.find((s) => points[s] < 5) ?? max[0]);
    points[skill]++;
    levels.push(skill);
  }
  return levels;
}

// ----------------------------------------------------------- FULL BUILD ---

/** Dwa kolejne przedmioty po core – razem z core i butami pełny build na 6 slotów. */
function lateItems(arch: Archetype, items: Map<string, CatalogItem>, bs: BuildStats | undefined, exclude: Set<string>): CatalogItem[] {
  const usable = (i: CatalogItem | undefined): i is CatalogItem => !!i && i.isCompleted && !i.isBoots && !exclude.has(i.id);
  if (bs) {
    const fromStats = Object.entries(bs.items)
      .filter(([, wl]) => wl.games >= 3)
      .sort((a, b) => b[1].games - a[1].games)
      .map(([id]) => items.get(id))
      .filter(usable)
      .slice(0, 2);
    if (fromStats.length === 2) return fromStats;
  }
  return [...items.values()]
    .filter(usable)
    .filter((i) => !(i.flags.antiHeal || i.flags.cleanse || i.flags.stasis || i.flags.lifeline || i.flags.spellShield))
    .map((i) => ({ i, fit: itemFit(i, arch) }))
    .sort((a, b) => b.fit - a.fit || b.i.gold - a.i.gold)
    .slice(0, 2)
    .map((x) => x.i);
}

/** Przedmioty startowe – tylko ze statystyk (crawler z osiami czasu meczów). */
function starterItems(data: GameData, bs: BuildStats | undefined): ItemRef[] {
  const key = bestEntry(bs?.starters);
  if (!key) return [];
  const refs = key.split("+").map((id) => data.itemRefs.get(id));
  return refs.every((r) => !!r) ? (refs as ItemRef[]) : [];
}

// ------------------------------------------------------------ PUBLIC API ---

export function recommendBuild(
  me: ChampionProfile,
  position: Position,
  enemies: ChampionProfile[],
  data: GameData,
  stats: StatsStore,
): BuildRecommendation {
  const arch = archetypeOf(me);
  const enemy = analyzeTeam(enemies);
  const bs = stats.build(me.id, position);
  const notes: string[] = [];

  const { core, fromStats } = coreItems(arch, data.items, bs);
  const { boots, reason: bootsReason } = chooseBoots(arch, enemy, data.items, bs);
  const late = lateItems(arch, data.items, bs, new Set(core.map((i) => i.id)));
  const situational = situationalItems({ me, arch, enemy }, data.items, new Set([...core, ...late].map((i) => i.id)));
  const { spells, reason: summonerReason } = chooseSummoners(me, position, enemy, data, bs);
  const runes = chooseRunes(arch, position, data, bs);

  const skill = bestEntry(bs?.skillOrders);
  const max = (skill ? skill.split("") : ["Q", "W", "E"]) as Skill[];
  const skillOrder = { max, levels: skillLevels(max), source: skill ? ("stats" as const) : ("heuristic" as const) };

  if (!fromStats) notes.push("Brak statystyk dla tej postaci na tej pozycji – build dobrany na podstawie statystyk przedmiotów.");
  if (bootsReason) notes.push(bootsReason);
  if (!enemies.length) notes.push("Przeciwnicy jeszcze nie wybrali postaci – przedmioty sytuacyjne pojawią się po ich pickach.");
  notes.push(...enemy.notes.map((n) => `Wróg: ${n}`));

  return {
    championId: me.id,
    championName: me.name,
    position,
    starters: starterItems(data, bs),
    core: core.map(toRef),
    boots: boots ? toRef(boots) : null,
    late: late.map(toRef),
    situational,
    summonerSpells: spells.map((s): SpellRef => ({ id: s.id, name: s.name, image: s.image })),
    summonerReason,
    runes,
    skillOrder,
    source: fromStats ? "stats" : "heuristic",
    notes,
  };
}
