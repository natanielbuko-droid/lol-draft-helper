import type { ChampionProfile, DraftState, PickRecommendation, PickScenario, Position, ScoreBreakdown, TeamAnalysis } from "../../shared/types";
import { POSITIONS } from "../../shared/types";
import type { GameData } from "../data/gameData";
import { smoothedWinrate, type StatsStore } from "../data/statsStore";
import { analyzeTeam, heuristicPositionFit, inferPositions } from "./teamAnalysis";

/**
 * Wagi składowych oceny. Meta (winrate + popularność) waży najwięcej, bo jest najlepiej udokumentowana danymi;
 * heurystyka składu tylko "dopasowuje" ranking, żeby nie wypychała na górę picków spoza mety.
 * Gdy brak statystyk, liczy się dopasowanie klasy do pozycji i analiza składu.
 */
export const WEIGHTS_WITH_STATS = { meta: 0.35, counter: 0.25, synergy: 0.15, composition: 0.25 };
export const WEIGHTS_NO_STATS = { meta: 0.3, counter: 0, synergy: 0, composition: 0.7 };

/** Postać musi mieć co najmniej tyle procent gier na pozycji, żeby trafić do puli (odcina picki spoza mety). */
export const MIN_PICK_RATE = 0.008;

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
/** 0.0271 -> "2,7%" – zapis zrozumiały dla gracza. */
const pct = (x: number) => `${(Math.abs(x) * 100).toFixed(1).replace(".", ",")}%`;
/** Polska odmiana: 1 mecz, 2–4 mecze, 5+ meczów (ale 12–14 meczów). */
const matches = (n: number) =>
  `${n} ${n === 1 ? "mecz" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "mecze" : "meczów"}`;

interface ScorePart {
  value: number;
  reasons: string[];
}

/**
 * Ocena dopasowania do składu (heurystyka, działa zawsze – także bez statystyk).
 * Odpowiada na pytanie: "czego brakuje mojej drużynie i jak wygląda wróg?"
 */
export function compositionScore(c: ChampionProfile, allies: TeamAnalysis, enemies: TeamAnalysis, allyCount: number): ScorePart {
  let s = 0;
  const reasons: string[] = [];

  if (allyCount >= 2) {
    // 1. Balans obrażeń AD/AP – wróg nie może kupić tylko pancerza.
    //    Płynna skala: im bardziej drużyna "przechylona", tym większa premia za drugi typ obrażeń.
    const sameTypeShare = c.damageType === "physical" ? allies.physicalShare : c.damageType === "magic" ? allies.magicShare : 0.5;
    const balance = (0.5 - sameTypeShare) * 1.2; // np. drużyna 80% AP, kandydat AD -> +0.36
    s += balance;
    const other = c.damageType === "magic" ? "AD" : "AP";
    if (balance >= 0.15) reasons.push(`Drużyna ma głównie ${other} – ta postać wyrównuje obrażenia`);
    if (balance <= -0.15) reasons.push(`Kolejne obrażenia ${other === "AD" ? "AP" : "AD"} – skład łatwiej skontrować`);
    // 2. Frontline.
    if (allies.frontline === 0) {
      if (c.durability === 3) (s += 0.4), reasons.push("Brak frontline'u – to wytrzymała postać");
      else if (c.durability === 1) s -= 0.15;
    }
    // 3. Twarde CC.
    if (allies.hardCC < allyCount && (c.hardCC >= 2 || c.crowdControl === 3)) {
      (s += 0.25), reasons.push("Drużynie brakuje twardego CC");
    }
  }
  // 4. Ochrona hyper-carry sojuszników (peel).
  if (allies.carries.length > 0 && c.utility === 3 && c.roles.includes("support")) {
    (s += 0.25), reasons.push(`Może chronić carry: ${allies.carries.join(", ")}`);
  }
  if (allies.carries.length >= 2 && c.isCarry) s -= 0.1;

  // 5. Odpowiedź na skład wroga.
  if (enemies.assassins >= 2 && c.isCarry && c.mobility === 1) {
    (s -= 0.2), reasons.push("Łatwy cel dla zabójców przeciwnika");
  }
  if (enemies.carries.length >= 2 && c.hardCC >= 2) {
    (s += 0.15), reasons.push(`Twarde CC na wrogie carry (${enemies.carries.join(", ")})`);
  }
  if (enemies.frontline >= 2 && c.isCarry && c.attackType === "ranged" && c.damageType !== "magic") {
    (s += 0.1), reasons.push("Ciągłe obrażenia z dystansu dobre na tanków wroga");
  }
  if (enemies.divers >= 2) {
    // Wróg "wskakuje" na tylną linię: liczy się ucieczka, wytrzymałość lub CC do samoobrony.
    if (c.mobility === 3) (s += 0.15), reasons.push(`Mobilność pozwala uciec przed ${enemies.divers} diverami wroga`);
    else if (c.hardCC >= 2 && c.attackType === "ranged") (s += 0.1), reasons.push("CC do samoobrony przed diverami wroga");
    else if (c.durability === 1 && c.mobility === 1) (s -= 0.15), reasons.push("Miękka i statyczna – łatwy cel dla diverów wroga");
  }
  if (enemies.melee >= 2 && c.attackType === "ranged" && c.hardCC >= 1) {
    (s += 0.1), reasons.push(`Wróg ma ${enemies.melee} postacie walczące wręcz – kiting i CC z dystansu`);
  }
  if (enemies.champions.length >= 3 && enemies.avgDurability <= 1.8 && c.damage === 3) {
    (s += 0.1), reasons.push("Miękki skład wroga – postać z dużym burstem");
  }
  if (enemies.hardCC >= 6 && c.mobility === 3) {
    (s += 0.05), reasons.push("Mobilność pomaga unikać CC wroga");
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
}

/** Pełna ocena jednej postaci: Meta + Counter + Synergy + Composition. */
export function scoreChampion(c: ChampionProfile, ctx: PickContext, stats: StatsStore): { score: ScoreBreakdown; reasons: string[] } {
  const reasons: string[] = [];
  const W = stats.hasData ? WEIGHTS_WITH_STATS : WEIGHTS_NO_STATS;

  // --- META: siła na patchu = wygładzony winrate + popularność na tej pozycji ---
  // Sam winrate z małej próbki (np. 34 gry po 70%) to głównie szczęście; popularność mówi,
  // czy postać faktycznie jest grana na tej pozycji przez dobrych graczy.
  const base = stats.championWL(c.id, ctx.position);
  const baseWr = smoothedWinrate(base, 150);
  const games = base?.games ?? 0;
  const pickRate = ctx.positionGames ? games / ctx.positionGames : 0;
  let meta: number;
  if (stats.hasData) {
    const wrScore = clamp((baseWr - 0.5) / 0.04);
    const popScore = pickRate > 0 ? clamp(Math.log2(pickRate / ctx.avgPickRate) / 2) : -1;
    meta = 0.6 * wrScore + 0.4 * popScore;
    // Winrate i popularność UI pokazuje w osobnej linii – tu tylko ostrzeżenie o rzadkim picku.
    if (popScore <= -0.6 && games > 0) reasons.push(`Rzadki wybór (${pct(pickRate)} gier na tej pozycji, ${matches(games)}) – ocena mniej pewna`);
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
    if (delta >= 0.02) reasons.push(`Dobra przeciw ${e.name} – wygrywa o ${pct(delta)} częściej niż zwykle`);
    if (delta <= -0.02) reasons.push(`Trudny przeciwnik: ${e.name} – wygrywa o ${pct(delta)} rzadziej niż zwykle`);
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
    if (delta >= 0.02) reasons.push(`Dobrze współgra z ${a.name} – wygrywa o ${pct(delta)} częściej`);
  }
  const synergy = synN ? clamp(synSum / synN / 0.04) : 0;

  // --- COMPOSITION: heurystyka składu (zawsze dostępna) ---
  const comp = compositionScore(c, ctx.allyAnalysis, ctx.enemyAnalysis, ctx.allies.length);
  reasons.push(...comp.reasons);

  const weighted = W.meta * meta + W.counter * counter + W.synergy * synergy + W.composition * comp.value;
  const total = Math.round(50 + 50 * clamp(weighted));
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
    },
    reasons,
  };
}

/** Ustala pozycję gracza: z klienta, a w blind picku – pierwszą niezajętą przez sojuszników. */
export function resolveMyPosition(draft: DraftState, allies: ChampionProfile[], stats: StatsStore): Position {
  if (draft.myPosition) return draft.myPosition;
  const taken = [...inferPositions(allies, stats).values()];
  return POSITIONS.find((p) => !taken.includes(p)) ?? "MIDDLE";
}

export function buildPickContext(draft: DraftState, data: GameData, stats: StatsStore): PickContext {
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
  };
}

/** Ile czołowych propozycji służy za punkt odniesienia w porównaniach ("najlepsza z listy", średni winrate). */
export const COMPARE_GROUP = 10;

/**
 * Główna funkcja: pełna lista picków dla gracza (wszystkie sensowne postacie na tej pozycji, od najlepszej).
 * 1) buduje pulę postaci grywalnych na danej pozycji, 2) ocenia każdą, 3) sortuje.
 */
export function recommendPicks(draft: DraftState, data: GameData, stats: StatsStore, limit = Infinity): PickRecommendation[] {
  const ctx = buildPickContext(draft, data, stats);
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
  const pool = byStats.length >= 15 ? byStats : [...new Set([...byStats, ...byClass])];

  const picks = pool
    .map((c): PickRecommendation => {
      const { score, reasons } = scoreChampion(c, ctx, stats);
      return { championId: c.id, name: c.name, image: c.image, score, reasons, comparison: [] };
    })
    .sort((a, b) => b.score.total - a.score.total || b.score.confidence - a.score.confidence)
    .slice(0, limit);
  compareWithOthers(picks, picks.slice(0, COMPARE_GROUP));
  return picks;
}

type Component = "meta" | "counter" | "synergy" | "composition";
const COMPONENTS: Component[] = ["meta", "counter", "synergy", "composition"];
const COMPONENT_LABEL: Record<Component, string> = {
  meta: "siła na patchu",
  counter: "radzenie sobie z wybranymi wrogami",
  synergy: "współpraca z Twoją drużyną",
  composition: "dopasowanie do składu",
};

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
      if (ahead.length) out.push(`Przewaga nad ${next.name}: ${ahead.slice(0, 2).map(([k]) => COMPONENT_LABEL[k]).join(", ")}.`);
    } else {
      const best = picks[0];
      const better = COMPONENTS.filter((k) => p.score[k] - best.score[k] > 0.1);
      if (better.length) out.push(`Lepsza niż ${best.name} w kategoriach: ${better.map((k) => COMPONENT_LABEL[k]).join(", ")} – ale w sumie wypada słabiej.`);
    }

    // 2. Winrate na tle pozostałych propozycji.
    const otherWr = others.map((o) => o.score.winrate).filter((w): w is number => w !== null);
    if (p.score.winrate !== null && otherWr.length) {
      const avg = mean(otherWr);
      const d = p.score.winrate - avg;
      if (d >= 0.015) out.push(`Wygrywa częściej niż pozostałe propozycje: ${pct(p.score.winrate)} wobec średnio ${pct(avg)}.`);
      else if (d <= -0.03) out.push(`Wygrywa rzadziej niż pozostałe propozycje (${pct(p.score.winrate)} wobec średnio ${pct(avg)}) – jest wysoko dzięki innym zaletom.`);
    }

    // 3. W czym jest najlepsza z czołówki listy.
    for (const k of COMPONENTS) {
      const second = Math.max(...others.map((o) => o.score[k]));
      if (inGroup && p.score[k] > 0.2 && p.score[k] - second > 0.1) out.push(`Najlepsza z czołówki w kategorii: ${COMPONENT_LABEL[k]}.`);
    }

    // 4. Popularność – najczęściej grana z czołowych propozycji.
    const pr = p.score.pickRate;
    if (inGroup && pr !== null && pr > 0 && others.every((o) => (o.score.pickRate ?? 0) < pr)) {
      out.push(`Najczęściej wybierana z proponowanych postaci (${pct(pr)} gier na tej pozycji).`);
    }

    p.comparison = out.slice(0, 3);
  });
}

// ------------------------------------------------------------ SCENARIUSZE ---

/** Powody, które mówią o słabości postaci (reszta to zalety). */
const NEGATIVE_REASON = /^(Trudny przeciwnik|Kolejne obrażenia|Łatwy cel|Miękka i statyczna|Rzadki wybór)/;

const POSITIVE_LABEL: Record<Component, (p: PickRecommendation) => string> = {
  meta: (p) => `Mocna na tym patchu${p.score.winrate !== null ? ` – wygrywa ${pct(p.score.winrate)} gier` : ""}.`,
  counter: () => "Dobrze radzi sobie z wybranymi wrogami.",
  synergy: () => "Dobrze współgra z Twoją drużyną.",
  composition: () => "Uzupełnia braki w składzie drużyny.",
};
const NEGATIVE_LABEL: Record<Component, (p: PickRecommendation) => string> = {
  meta: (p) => `Słaba na tym patchu${p.score.winrate !== null ? ` – wygrywa tylko ${pct(p.score.winrate)} gier` : ""}.`,
  counter: () => "Ma problemy z wybranymi wrogami.",
  synergy: () => "Słabo współgra z Twoją drużyną.",
  composition: () => "Pogłębia słabości składu zamiast je łatać.",
};

/**
 * Trzy scenariusze z pełnej listy picków:
 *  - idealnie   – najwyżej oceniona postać,
 *  - neutralnie – postać z oceną najbliższą 50 (ani pomaga, ani szkodzi),
 *  - koszmarnie – najniżej oceniona z postaci faktycznie granych na tej pozycji.
 * Każdy dostaje krótkie podsumowanie: co przemawia za nim / przeciw niemu.
 */
export function pickScenarios(picks: PickRecommendation[]): PickScenario[] {
  if (picks.length < 3) return [];
  const ideal = picks[0];
  const nightmare = picks[picks.length - 1];
  const neutral = picks
    .slice(1, -1)
    .reduce((best, p) => (Math.abs(p.score.total - 50) < Math.abs(best.score.total - 50) ? p : best));

  const strengths = (p: PickRecommendation) =>
    COMPONENTS.filter((k) => p.score[k] > 0.15)
      .sort((a, b) => p.score[b] - p.score[a])
      .map((k) => POSITIVE_LABEL[k](p));
  const weaknesses = (p: PickRecommendation) =>
    COMPONENTS.filter((k) => p.score[k] < -0.15)
      .sort((a, b) => p.score[a] - p.score[b])
      .map((k) => NEGATIVE_LABEL[k](p));
  const goodReasons = (p: PickRecommendation) => p.reasons.filter((r) => !NEGATIVE_REASON.test(r));
  const badReasons = (p: PickRecommendation) => p.reasons.filter((r) => NEGATIVE_REASON.test(r));

  const idealSummary = [...strengths(ideal).slice(0, 2), ...goodReasons(ideal).slice(0, 2)];
  const nightmareSummary = [...weaknesses(nightmare).slice(0, 2), ...badReasons(nightmare).slice(0, 2)];
  const neutralSummary = [
    "Nie wyróżnia się ani na plus, ani na minus w tym drafcie.",
    ...strengths(neutral).slice(0, 1).map((s) => `Plus: ${s}`),
    ...weaknesses(neutral).slice(0, 1).map((s) => `Minus: ${s}`),
  ];

  return [
    { kind: "ideal", pick: ideal, summary: idealSummary.length ? idealSummary : ["Najwyżej oceniona postać w tym drafcie."] },
    { kind: "neutral", pick: neutral, summary: neutralSummary },
    {
      kind: "nightmare",
      pick: nightmare,
      summary: nightmareSummary.length ? nightmareSummary : ["Najniżej oceniona z granych na tej pozycji – inne opcje są po prostu lepsze."],
    },
  ];
}
