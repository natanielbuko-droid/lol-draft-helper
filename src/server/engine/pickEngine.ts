import type {
  ChampionProfile,
  DraftState,
  PickRecommendation,
  PickScenario,
  PoolEntry,
  Position,
  Reason,
  ScoreBreakdown,
  TeamAnalysis,
} from "../../shared/types";
import { POSITIONS } from "../../shared/types";
import type { GameData } from "../data/gameData";
import { smoothedWinrate, type StatsStore, type WL } from "../data/statsStore";
import { comfortScore } from "../lcu/playerPool";
import { analyzeTeam, heuristicPositionFit, inferPositions } from "./teamAnalysis";
import { abilityText, DAMAGE_NAME, inMatches, matches, names, pct, pct0, POSITION_NAME } from "./vocab";

/**
 * Wagi składowych oceny. Meta (winrate + popularność) waży najwięcej, bo jest najlepiej udokumentowana danymi;
 * heurystyka składu tylko "dopasowuje" ranking, żeby nie wypychała na górę picków spoza mety.
 * Gdy brak statystyk, liczy się dopasowanie klasy do pozycji i analiza składu.
 */
export const WEIGHTS_WITH_STATS = { meta: 0.35, counter: 0.25, synergy: 0.15, composition: 0.25 };
export const WEIGHTS_NO_STATS = { meta: 0.3, counter: 0, synergy: 0, composition: 0.7 };

/** Postać musi mieć co najmniej tyle procent gier na pozycji, żeby trafić do puli (odcina picki spoza mety). */
export const MIN_PICK_RATE = 0.008;

/** Matchup/synergię opisujemy liczbami dopiero od tylu wspólnych meczów – mniej to anegdota, nie statystyka. */
const MIN_PAIR_GAMES = 8;

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const plus = (text: string): Reason => ({ text, tone: "plus" });
const minus = (text: string): Reason => ({ text, tone: "minus" });
const info = (text: string): Reason => ({ text, tone: "info" });

interface ScorePart {
  value: number;
  reasons: Reason[];
}

/**
 * Ocena dopasowania do składu (heurystyka, działa zawsze – także bez statystyk).
 * Odpowiada na pytanie: "czego brakuje mojej drużynie i jak wygląda wróg?"
 * Każdy powód mówi KTO i CZYM – z nazwami postaci i umiejętności.
 */
export function compositionScore(c: ChampionProfile, allies: TeamAnalysis, enemies: TeamAnalysis, allyCount: number): ScorePart {
  let s = 0;
  const reasons: Reason[] = [];
  const cc = abilityText(c, "cc");
  const dash = abilityText(c, "dash");

  if (allyCount >= 2) {
    // 1. Balans obrażeń AD/AP – wróg nie może kupić tylko pancerza.
    //    Płynna skala: im bardziej drużyna "przechylona", tym większa premia za drugi typ obrażeń.
    const sameTypeShare = c.damageType === "physical" ? allies.physicalShare : c.damageType === "magic" ? allies.magicShare : 0.5;
    const balance = (0.5 - sameTypeShare) * 1.2; // np. drużyna 80% AP, kandydat AD -> +0.36
    s += balance;
    if (balance >= 0.15) {
      const magicTeam = c.damageType !== "magic";
      const list = magicTeam ? allies.who.magic : allies.who.physical;
      reasons.push(
        plus(
          `Twoja drużyna zadaje głównie obrażenia ${magicTeam ? "magiczne" : "fizyczne"} (${pct0(magicTeam ? allies.magicShare : allies.physicalShare)}` +
            `${list.length ? `: ${names(list)}` : ""}) – ${c.name} dodaje ${DAMAGE_NAME[c.damageType]}, ` +
            `więc wróg nie obroni się samym kupowaniem ${magicTeam ? "odporności na magię" : "pancerza"}.`,
        ),
      );
    }
    if (balance <= -0.15) {
      const magic = c.damageType === "magic";
      const list = magic ? allies.who.magic : allies.who.physical;
      reasons.push(
        minus(
          `Kolejne obrażenia ${magic ? "magiczne" : "fizyczne"} – drużyna ma ich już ${pct0(sameTypeShare)}${list.length ? ` (${names(list)})` : ""}, ` +
            `więc wrogowi wystarczy ${magic ? "odporność na magię" : "pancerz"}.`,
        ),
      );
    }
    // 2. Frontline.
    if (allies.frontline === 0) {
      if (c.durability === 3) {
        s += 0.4;
        reasons.push(plus(`Brak tanka w drużynie (${names(allies.champions)}) – ${c.name} wytrzyma walkę na froncie i przyjmie obrażenia za resztę.`));
      } else if (c.durability === 1) {
        s -= 0.15;
        reasons.push(minus("Drużyna nie ma tanka, a ta postać też jest bardzo miękka – nie będzie komu zaczynać walk."));
      }
    }
    // 3. Twarde CC.
    if (allies.hardCC < allyCount && (c.hardCC >= 2 || c.crowdControl === 3)) {
      s += 0.25;
      reasons.push(plus(cc ? `Drużynie brakuje twardego CC – ${c.name} unieruchamia przez ${cc}.` : `Drużynie brakuje twardego CC – ${c.name} ma dużo kontroli tłumu.`));
    }
  }
  // 4. Ochrona hyper-carry sojuszników (peel).
  if (allies.carries.length > 0 && c.utility === 3 && c.roles.includes("support")) {
    s += 0.25;
    reasons.push(plus(`Osłoni carry drużyny (${names(allies.carries)})${cc ? ` – CC na nurkujących wrogów: ${cc}` : ""}.`));
  }
  if (allies.carries.length >= 2 && c.isCarry) {
    s -= 0.1;
    reasons.push(minus(`Drużyna ma już miękkie carry (${names(allies.carries)}) – trzecie trudno będzie ochronić.`));
  }

  // 5. Odpowiedź na skład wroga.
  if (enemies.assassins >= 2 && c.isCarry && c.mobility === 1) {
    s -= 0.2;
    reasons.push(minus(`Zabójcy wroga (${names(enemies.who.assassins)}) łatwo dopadną tę postać – nie ma ucieczki.`));
  }
  if (enemies.carries.length >= 2 && c.hardCC >= 2) {
    s += 0.15;
    reasons.push(plus(`Wrogie carry (${names(enemies.carries)}) – złapie je twardym CC${cc ? `: ${cc}` : ""}.`));
  }
  if (enemies.frontline >= 2 && c.isCarry && c.attackType === "ranged" && c.damageType !== "magic") {
    s += 0.1;
    reasons.push(plus(`Tanki wroga (${names(enemies.who.tanks)}) – stałe obrażenia z dystansu dobrze je topią.`));
  }
  if (enemies.divers >= 2) {
    // Wróg "wskakuje" na tylną linię: liczy się ucieczka, wytrzymałość lub CC do samoobrony.
    const d = names(enemies.who.divers);
    if (c.mobility === 3) {
      s += 0.15;
      reasons.push(plus(dash ? `Diverzy wroga (${d}) – ucieknie im dzięki doskokowi: ${dash}.` : `Diverzy wroga (${d}) – ta postać jest na tyle mobilna, że im ucieknie.`));
    } else if (c.hardCC >= 2 && c.attackType === "ranged") {
      s += 0.1;
      reasons.push(plus(`Diverzy wroga (${d}) – obroni się, unieruchamiając ich${cc ? `: ${cc}` : ""}.`));
    } else if (c.durability === 1 && c.mobility === 1) {
      s -= 0.15;
      reasons.push(minus(`Diverzy wroga (${d}) łatwo dopadną tę postać – jest miękka i nie ma doskoku.`));
    }
  }
  if (enemies.melee >= 2 && c.attackType === "ranged" && c.hardCC >= 1) {
    s += 0.1;
    reasons.push(plus(`Wróg walczy wręcz (${names(enemies.who.melee)}) – walcząc z dystansu, może trzymać ich z dala${cc ? `: ${cc}` : ""}.`));
  }
  if (enemies.champions.length >= 3 && enemies.avgDurability <= 1.8 && c.damage === 3 && enemies.who.squishy.length) {
    s += 0.1;
    reasons.push(plus(`Miękkie postacie wroga (${names(enemies.who.squishy)}) – duże obrażenia tej postaci szybko je zabiją.`));
  }
  if (enemies.hardCC >= 6 && c.mobility === 3) {
    s += 0.05;
    reasons.push(plus(`Dużo CC u wroga (${names(enemies.who.cc.slice(0, 3))}) – ${dash ? `doskok ${dash}` : "mobilność"} pomaga go unikać.`));
  }
  return { value: clamp(s), reasons };
}

export interface PickContext {
  position: Position;
  allies: ChampionProfile[];
  enemies: ChampionProfile[];
  enemyPositions: Map<number, Position>;
  allyAnalysis: TeamAnalysis;
  enemyAnalysis: TeamAnalysis;
  /** Wszystkie gry na tej pozycji w statystykach i średni udział jednej postaci (do oceny popularności). */
  positionGames: number;
  avgPickRate: number;
  /** Pula postaci gracza (maestria + ostatnie mecze); pusta = brak danych z klienta. */
  pool: Map<number, PoolEntry>;
}

/** Ile punktów oceny (0–100) daje najwyższe doświadczenie gracza na postaci. */
export const COMFORT_POINTS = 10;

/** Doświadczenie gracza na postaci: premia do oceny i konkretny powód z jego liczbami. */
export function personalPart(e: PoolEntry | undefined): { comfort: number; points: number; reasons: Reason[] } {
  if (!e) return { comfort: 0, points: 0, reasons: [] };
  const comfort = comfortScore(e);
  let points = COMFORT_POINTS * comfort;
  const reasons: Reason[] = [];
  const parts: string[] = [];
  if (e.masteryPoints > 0) parts.push(`${thousands(e.masteryPoints)} pkt maestrii (poziom ${e.masteryLevel})`);
  if (e.games > 0) parts.push(`${pct0(e.wins / e.games)} wygranych w ostatnich ${e.games} ${e.games === 1 ? "grze" : "grach"}`);
  // Forma z ostatnich gier (wygładzona – 5 meczów to jeszcze mało): ±3 punkty.
  if (e.games >= 5) points += Math.max(-3, Math.min(3, ((e.wins + 5) / (e.games + 10) - 0.5) * 30));
  if (comfort >= 0.25) {
    const tone = e.games >= 5 && e.wins / e.games < 0.4 ? info : plus;
    reasons.push(tone(`Twoja postać: ${parts.join(", ")}.`));
  } else if (parts.length) {
    reasons.push(info(`Grasz nią rzadko: ${parts.join(", ")}.`));
  }
  return { comfort, points, reasons };
}

const thousands = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} tys.` : `${n}`);

/**
 * Siła postaci na patchu (-1..1): wygładzony winrate + popularność na tej pozycji.
 * Wspólna dla rankingu picków i tier listy. Sam winrate z małej próbki (np. 34 gry po 70%) to głównie szczęście;
 * popularność mówi, czy postać faktycznie jest grana na tej pozycji przez dobrych graczy.
 */
export function metaScore(wl: WL | undefined, positionGames: number, avgPickRate: number) {
  const baseWr = smoothedWinrate(wl, 150);
  const games = wl?.games ?? 0;
  const pickRate = positionGames ? games / positionGames : 0;
  const wrScore = clamp((baseWr - 0.5) / 0.04);
  const popScore = pickRate > 0 ? clamp(Math.log2(pickRate / avgPickRate) / 2) : -1;
  return { meta: 0.6 * wrScore + 0.4 * popScore, baseWr, pickRate, popScore, games };
}

/** Pełna ocena jednej postaci: Meta + Counter + Synergy + Composition. */
export function scoreChampion(c: ChampionProfile, ctx: PickContext, stats: StatsStore): { score: ScoreBreakdown; reasons: Reason[] } {
  const W = stats.hasData ? WEIGHTS_WITH_STATS : WEIGHTS_NO_STATS;
  const counterReasons: Reason[] = [];
  const synergyReasons: Reason[] = [];
  const metaReasons: Reason[] = [];

  // --- META: siła na patchu = wygładzony winrate + popularność na tej pozycji ---
  const base = stats.championWL(c.id, ctx.position);
  const m = metaScore(base, ctx.positionGames, ctx.avgPickRate);
  const { baseWr, games, pickRate } = m;
  const rawBase = games ? base!.wins / games : baseWr;
  let meta: number;
  if (stats.hasData) {
    meta = m.meta;
    if (m.popScore <= -0.6 && games > 0) {
      metaReasons.push(info(`Rzadko grana ${POSITION_NAME[ctx.position]} (${pct(pickRate)} gier, ${matches(games)}) – ocena mniej pewna.`));
    }
  } else {
    // Bez statystyk "meta" zastępuje dopasowanie klasy postaci do pozycji (np. strzelec na ADC).
    meta = clamp((heuristicPositionFit(c, ctx.position) - 0.6) * 2);
  }

  // --- COUNTER: jak radzi sobie przeciw wybranym wrogom (przeciwnik z linii liczy się podwójnie) ---
  let counterSum = 0;
  let counterW = 0;
  let matchupGames = 0;
  for (const e of ctx.enemies) {
    const sameLane = ctx.enemyPositions.get(e.id) === ctx.position;
    const wl = (sameLane ? stats.lane(c.id, ctx.position, e.id) : undefined) ?? stats.vs(c.id, e.id);
    if (!wl) continue;
    // Wygładzamy w stronę własnego winrate postaci (nie 50%): mała próbka = brak efektu, a nie fałszywy plus/minus.
    const delta = smoothedWinrate(wl, 40, baseWr) - baseWr;
    const w = sameLane ? 2 : 1;
    counterSum += delta * w;
    counterW += w;
    matchupGames += wl.games;
    if (wl.games >= MIN_PAIR_GAMES && Math.abs(delta) >= 0.02) {
      const text = `vs ${e.name}${sameLane ? " (rywal na linii)" : ""}: ${pct(wl.wins / wl.games)} wygranych ${inMatches(wl.games)} – zwykle ${pct(rawBase)}.`;
      (sameLane ? counterReasons.unshift.bind(counterReasons) : counterReasons.push.bind(counterReasons))(delta > 0 ? plus(text) : minus(text));
    }
  }
  const counter = counterW ? clamp(counterSum / counterW / 0.04) : 0;

  // --- SYNERGY: jak wygrywa razem z wybranymi sojusznikami ---
  let synSum = 0;
  let synN = 0;
  for (const a of ctx.allies) {
    const wl = stats.with(c.id, a.id);
    if (!wl) continue;
    const delta = smoothedWinrate(wl, 40, baseWr) - baseWr; // jak wyżej: w stronę własnego winrate postaci
    synSum += delta;
    synN++;
    if (wl.games >= MIN_PAIR_GAMES && delta >= 0.02) {
      synergyReasons.push(plus(`W drużynie z: ${a.name} – ${pct(wl.wins / wl.games)} wygranych ${inMatches(wl.games)} (zwykle ${pct(rawBase)}).`));
    } else if (wl.games >= MIN_PAIR_GAMES && delta <= -0.03) {
      synergyReasons.push(minus(`W drużynie z: ${a.name} – tylko ${pct(wl.wins / wl.games)} wygranych ${inMatches(wl.games)} (zwykle ${pct(rawBase)}).`));
    }
  }
  const synergy = synN ? clamp(synSum / synN / 0.04) : 0;

  // --- COMPOSITION: heurystyka składu (zawsze dostępna) ---
  const comp = compositionScore(c, ctx.allyAnalysis, ctx.enemyAnalysis, ctx.allies.length);

  const weighted = W.meta * meta + W.counter * counter + W.synergy * synergy + W.composition * comp.value;
  // Postać, którą gracz dobrze zna, wygrywa mu częściej niż „idealny” pick, którym nie grał – premia do 10 punktów.
  const mine = personalPart(ctx.pool.get(c.id));
  const total = Math.max(0, Math.min(100, Math.round(50 + 50 * clamp(weighted) + mine.points)));
  // Pewność: ile meczów stoi za oceną (gry postaci na pozycji, a gdy są wrogowie – także matchupy).
  const confidence = !stats.hasData
    ? 0.15
    : ctx.enemies.length
      ? clamp(0.6 * Math.min(1, games / 150) + 0.4 * Math.min(1, matchupGames / 100), 0, 1)
      : clamp(Math.min(1, games / 150), 0, 1);

  return {
    score: {
      meta,
      counter,
      synergy,
      composition: comp.value,
      total,
      confidence,
      games,
      winrate: games ? base!.wins / games : null,
      pickRate: stats.hasData ? pickRate : null,
      personal: mine.comfort,
    },
    // Najpierw doświadczenie gracza, potem to, co dotyczy tego draftu (wrogowie, skład, sojusznicy), na końcu meta.
    reasons: [...mine.reasons, ...counterReasons, ...comp.reasons, ...synergyReasons, ...metaReasons],
  };
}

/** Ustala pozycję gracza: z klienta, a w blind picku – pierwszą niezajętą przez sojuszników. */
export function resolveMyPosition(draft: DraftState, allies: ChampionProfile[], stats: StatsStore): Position {
  if (draft.myPosition) return draft.myPosition;
  const taken = [...inferPositions(allies, stats).values()];
  return POSITIONS.find((p) => !taken.includes(p)) ?? "MIDDLE";
}

export function buildPickContext(draft: DraftState, data: GameData, stats: StatsStore, pool: Map<number, PoolEntry> = new Map()): PickContext {
  const profile = (id: number | null) => (id ? data.champions.get(id) : undefined);
  const allies = draft.myTeam.filter((s) => !s.isLocalPlayer).map((s) => profile(s.championId)).filter((c): c is ChampionProfile => !!c);
  const enemies = draft.enemyTeam.map((s) => profile(s.championId)).filter((c): c is ChampionProfile => !!c);
  const position = resolveMyPosition(draft, allies, stats);
  const positionGames = stats.totalGamesOnPosition(position);
  return {
    position,
    allies,
    enemies,
    enemyPositions: inferPositions(enemies, stats),
    allyAnalysis: analyzeTeam(allies),
    enemyAnalysis: analyzeTeam(enemies),
    positionGames,
    avgPickRate: 1 / Math.max(1, stats.championsOnPosition(position)),
    pool,
  };
}

/** Ile czołowych propozycji służy za punkt odniesienia w porównaniach ("najlepsza z listy", średni winrate). */
export const COMPARE_GROUP = 10;

/**
 * Główna funkcja: pełna lista picków dla gracza (wszystkie sensowne postacie na tej pozycji, od najlepszej).
 * 1) buduje pulę postaci grywalnych na danej pozycji, 2) ocenia każdą, 3) sortuje.
 */
export function recommendPicks(
  draft: DraftState,
  data: GameData,
  stats: StatsStore,
  pool: Map<number, PoolEntry> = new Map(),
  limit = Infinity,
): PickRecommendation[] {
  const ctx = buildPickContext(draft, data, stats, pool);
  const unavailable = new Set<number>([
    ...draft.bans,
    ...draft.enemyTeam.map((s) => s.championId ?? 0),
    ...draft.myTeam.filter((s) => !s.isLocalPlayer).map((s) => s.championId ?? 0),
  ]);
  const pickable = new Set(draft.pickableChampionIds);
  const minGames = Math.max(10, ctx.positionGames * MIN_PICK_RATE);

  const available = [...data.champions.values()].filter((c) => !unavailable.has(c.id) && (!pickable.size || pickable.has(c.id)));
  const byStats = available.filter((c) => stats.positionGames(c.id, ctx.position) >= minGames);
  const byClass = available.filter((c) => heuristicPositionFit(c, ctx.position) >= 0.45);
  // Mała próbka meczów (np. pierwszy crawl) = za mało postaci ze statystykami -> dokładamy pulę z heurystyki.
  const candidates = byStats.length >= 15 ? byStats : [...new Set([...byStats, ...byClass])];
  // Postacie, które gracz dobrze zna, dokładamy nawet poniżej progu popularności – o ile w ogóle grają tę pozycję.
  const comfortPicks = available.filter(
    (c) => comfortScore(pool.get(c.id)) >= 0.4 && (stats.positionGames(c.id, ctx.position) >= 5 || heuristicPositionFit(c, ctx.position) >= 0.45),
  );

  const picks = [...new Set([...candidates, ...comfortPicks])]
    .map((c): PickRecommendation => {
      const { score, reasons } = scoreChampion(c, ctx, stats);
      const mine = pool.get(c.id);
      return { championId: c.id, name: c.name, image: c.image, score, reasons, comparison: [], ...(mine ? { mine } : {}) };
    })
    .sort((a, b) => b.score.total - a.score.total || b.score.confidence - a.score.confidence)
    .slice(0, limit);
  addMetaContext(picks, ctx.position);
  compareWithOthers(picks, picks.slice(0, COMPARE_GROUP));
  return picks;
}

/**
 * Kontekst mety względem CAŁEJ puli: miejsce w popularności i percentyl winrate na tej pozycji
 * ("2. najczęściej wybierana na ADC", "winrate wyższy niż u 85% postaci na ADC").
 */
function addMetaContext(picks: PickRecommendation[], position: Position): void {
  const withData = picks.filter((p) => p.score.games >= 30 && p.score.winrate !== null);
  const byPopularity = [...picks].filter((p) => (p.score.pickRate ?? 0) > 0).sort((a, b) => b.score.pickRate! - a.score.pickRate!);
  for (const p of picks) {
    const rank = byPopularity.indexOf(p) + 1;
    if (rank >= 1 && rank <= 3) {
      p.reasons.push(info(`${rank}. najczęściej wybierana postać ${POSITION_NAME[position]} (${pct(p.score.pickRate!)} gier).`));
    }
    if (p.score.winrate === null || p.score.games < 30 || withData.length < 8) continue;
    const below = withData.filter((o) => o !== p && o.score.winrate! < p.score.winrate!).length / (withData.length - 1);
    if (below >= 0.999) p.reasons.push(plus(`Najwyższy winrate wśród postaci ${POSITION_NAME[position]}.`));
    else if (below >= 0.8) p.reasons.push(plus(`Winrate wyższy niż u ${pct0(below)} postaci ${POSITION_NAME[position]}.`));
    else if (below <= 0.001) p.reasons.push(minus(`Najniższy winrate wśród postaci ${POSITION_NAME[position]}.`));
    else if (below <= 0.2) p.reasons.push(minus(`Winrate niższy niż u ${pct0(1 - below)} postaci ${POSITION_NAME[position]}.`));
  }
}

type Component = "meta" | "counter" | "synergy" | "composition";
const COMPONENTS: Component[] = ["meta", "counter", "synergy", "composition"];
const COMPONENT_LABEL: Record<Component, string> = {
  meta: "siła na patchu",
  counter: "radzenie sobie z wybranymi wrogami",
  synergy: "współpraca z Twoją drużyną",
  composition: "dopasowanie do składu",
};

/** Konkretny opis przewagi w danej kategorii – z liczbami, gdy są. */
function advantage(k: Component, p: PickRecommendation, other: PickRecommendation): string {
  switch (k) {
    case "meta": {
      // Przewaga w "sile na patchu" może wynikać z winrate albo z popularności – mówimy, z czego naprawdę.
      const [w1, w2, r1, r2] = [p.score.winrate, other.score.winrate, p.score.pickRate, other.score.pickRate];
      if (w1 !== null && w2 !== null && w1 > w2) return `winrate (${pct(w1)} wobec ${pct(w2)})`;
      if (r1 !== null && r2 !== null && r1 > r2) return `popularność (${pct(r1)} wobec ${pct(r2)} gier na pozycji)`;
      return "siła na tym patchu";
    }
    case "counter":
      return "matchupy z wybranymi wrogami";
    case "synergy":
      return "wyniki z Twoimi sojusznikami";
    case "composition":
      return "dopasowanie do składu";
  }
}

/**
 * Wyjaśnia każdą propozycję NA TLE pozostałych – żeby gracz wiedział nie tylko,
 * że postać jest dobra, ale dlaczego lepsza (albo w czym gorsza) od innych opcji.
 * Punktem odniesienia jest `group` (czołówka listy), żeby "najlepsza z listy" znaczyło coś
 * także przy pełnej liście kilkudziesięciu postaci.
 */
export function compareWithOthers(picks: PickRecommendation[], group: PickRecommendation[] = picks): void {
  if (picks.length < 2 || group.length < 2) return;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  picks.forEach((p, i) => {
    const inGroup = group.includes(p);
    const others = group.filter((o) => o !== p);
    const out: string[] = [];

    // 1. Pozycja w rankingu: #1 względem #2, pozostali względem #1.
    if (i === 0) {
      const next = picks[1];
      const ahead = COMPONENTS.map((k) => [k, p.score[k] - next.score[k]] as const)
        .filter(([, d]) => d > 0.1)
        .sort((a, b) => b[1] - a[1]);
      if (ahead.length) out.push(`Przewaga nad #2 (${next.name}): ${ahead.slice(0, 2).map(([k]) => advantage(k, p, next)).join(", ")}.`);
    } else {
      const best = picks[0];
      const better = COMPONENTS.filter((k) => p.score[k] - best.score[k] > 0.1);
      if (better.length) out.push(`Względem #1 (${best.name}) lepsze: ${better.map((k) => advantage(k, p, best)).join(", ")} – ale w sumie wypada słabiej.`);
    }

    // 2. Winrate na tle pozostałych propozycji.
    const otherWr = others.map((o) => o.score.winrate).filter((w): w is number => w !== null);
    if (p.score.winrate !== null && otherWr.length) {
      const avg = mean(otherWr);
      const d = p.score.winrate - avg;
      if (d >= 0.015) out.push(`Wygrywa częściej niż czołówka listy: ${pct(p.score.winrate)} wobec średnio ${pct(avg)}.`);
      else if (d <= -0.03) out.push(`Wygrywa rzadziej niż czołówka (${pct(p.score.winrate)} wobec średnio ${pct(avg)}) – jest wysoko dzięki innym zaletom.`);
    }

    // 3. W czym jest najlepsza z czołówki listy.
    for (const k of COMPONENTS) {
      const second = Math.max(...others.map((o) => o.score[k]));
      if (inGroup && p.score[k] > 0.2 && p.score[k] - second > 0.1) out.push(`Najlepsza z czołówki w kategorii: ${COMPONENT_LABEL[k]}.`);
    }

    // 4. Popularność – najczęściej grana z czołowych propozycji.
    const pr = p.score.pickRate;
    if (inGroup && pr !== null && pr > 0 && others.every((o) => (o.score.pickRate ?? 0) < pr)) {
      out.push(`Najczęściej wybierana z czołówki (${pct(pr)} gier na tej pozycji).`);
    }

    p.comparison = out.slice(0, 3);
  });
}

// ------------------------------------------------------------ SCENARIUSZE ---

/**
 * Trzy scenariusze z pełnej listy picków:
 *  - idealnie   – najwyżej oceniona postać,
 *  - neutralnie – postać z oceną najbliższą 50 (ani pomaga, ani szkodzi),
 *  - koszmarnie – najniżej oceniona z postaci faktycznie granych na tej pozycji.
 * Podsumowanie korzysta z konkretnych powodów (z nazwami i liczbami), a ogólne opisy są tylko zapasem.
 */
export function pickScenarios(picks: PickRecommendation[]): PickScenario[] {
  if (picks.length < 3) return [];
  const ideal = picks[0];
  const nightmare = picks[picks.length - 1];
  const neutral = picks
    .slice(1, -1)
    .reduce((best, p) => (Math.abs(p.score.total - 50) < Math.abs(best.score.total - 50) ? p : best));

  const pros = (p: PickRecommendation) => p.reasons.filter((r) => r.tone === "plus").map((r) => r.text);
  const cons = (p: PickRecommendation) => p.reasons.filter((r) => r.tone === "minus").map((r) => r.text);
  const fallback = (p: PickRecommendation, sign: 1 | -1) =>
    COMPONENTS.filter((k) => sign * p.score[k] > 0.15).map((k) => `${sign > 0 ? "Mocna strona" : "Słaba strona"}: ${COMPONENT_LABEL[k]}.`);

  const idealSummary = pros(ideal).slice(0, 3);
  const nightmareSummary = cons(nightmare).slice(0, 3);
  const neutralSummary = [
    "Nie wyróżnia się ani na plus, ani na minus w tym drafcie.",
    ...pros(neutral).slice(0, 1).map((s) => `Plus: ${s}`),
    ...cons(neutral).slice(0, 1).map((s) => `Minus: ${s}`),
  ];

  return [
    { kind: "ideal", pick: ideal, summary: idealSummary.length ? idealSummary : fallback(ideal, 1).slice(0, 2) },
    { kind: "neutral", pick: neutral, summary: neutralSummary },
    {
      kind: "nightmare",
      pick: nightmare,
      summary: nightmareSummary.length
        ? nightmareSummary
        : [...fallback(nightmare, -1).slice(0, 2), "Najniżej oceniona z granych na tej pozycji – inne opcje są po prostu lepsze."],
    },
  ];
}
