import type { ChampionProfile, GankLane, GankTarget, JunglePlan, Position, Reason } from "../../shared/types";
import { smoothedWinrate, type StatsStore } from "../data/statsStore";
import type { PickContext } from "./pickEngine";
import { abilityText, inMatches, pct } from "./vocab";

/**
 * PLAN DŻUNGLI – pierwszy clear i wybór linii do ganku na podstawie draftu.
 *
 * Mapa (Summoner's Rift): niebieska drużyna ma bazę w lewym dolnym rogu, czerwona w prawym górnym.
 *  - niebieska strona: górna część dżungli = Blue buff, Gromp, Wilki; dolna = Red buff, Raptory, Krugi,
 *  - czerwona strona: górna część dżungli = Red buff, Raptory, Krugi; dolna = Blue buff, Gromp, Wilki.
 * Zasada: zaczynamy po PRZECIWNEJ stronie niż linia, którą chcemy gankować – clear kończy się tuż przy niej.
 */

type Half = "top" | "bot";
const BLUE_HALF = ["Blue buff", "Gromp", "Wilki"];
const RED_HALF = ["Red buff", "Krugi", "Raptory"];

/** Obozy w danej połowie dżungli, zaczynając od buffa. */
function campsIn(half: Half, side: "blue" | "red"): string[] {
  const blueBuffTop = side === "blue";
  return (half === "top") === blueBuffTop ? BLUE_HALF : RED_HALF;
}

/** Ścieżka kończąca się w połowie `end`: 3 obozy (szybki gank) albo pełny clear 6 obozów + krab. */
export function clearPath(style: "gank" | "farm", end: Half, side: "blue" | "red" | null): string[] {
  const start: Half = end === "top" ? "bot" : "top";
  if (!side) {
    // Bez znanej strony mapy opisujemy połowy dżungli zamiast konkretnych buffów.
    const s = start === "top" ? "górnej" : "dolnej";
    const e = end === "top" ? "górnej" : "dolnej";
    return style === "gank"
      ? [`buff w ${s} części dżungli`, `buff w ${e} części dżungli`, `mały obóz obok`]
      : [`buff + 2 obozy w ${s} części`, `buff + 2 obozy w ${e} części`, "Krab po tej stronie"];
  }
  const first = campsIn(start, side);
  const last = campsIn(end, side);
  // [buff, obóz najdalej od rzeki, obóz przy rzece] – np. Red → Krugi → Raptory albo Blue → Gromp → Wilki.
  const [buff, far, near] = last;
  // Szybki gank: oba buffy i obóz obok drugiego (np. Red → Blue → Gromp → gank top).
  if (style === "gank") return [first[0], buff, far];
  // Pełny clear: cała pierwsza połowa, potem druga od strony rzeki (np. Red → Krugi → Raptory → Wilki → Blue → Gromp).
  return [...first, near, buff, far, "Krab (scuttle)"];
}

/** Czy jungler nadaje się do wczesnych ganków, czy lepiej, żeby farmił. */
function clearStyle(me: ChampionProfile): { style: "gank" | "farm"; reason: string } {
  const cc = abilityText(me, "cc");
  const dash = abilityText(me, "dash");
  const gankPower = me.hardCC * 0.3 + (me.mobility - 1) * 0.2 + (me.crowdControl - 1) * 0.15;
  if (me.roles.includes("marksman") || (me.hardCC === 0 && me.crowdControl <= 1) || gankPower < 0.5) {
    return {
      style: "farm",
      reason: `${me.name} ma mało kontroli tłumu${cc ? "" : " (brak twardego CC)"} – lepiej zrobić pełny clear, rosnąć i gankować później, gdy ma przewagę.`,
    };
  }
  const tools = [cc && `CC: ${cc}`, dash && `doskok: ${dash}`].filter(Boolean).join(", ");
  return { style: "gank", reason: `${me.name} jest silny wcześnie w gankach${tools ? ` (${tools})` : ""} – szybki clear 3 obozów i pierwszy gank.` };
}

const LANE_POSITIONS: Record<GankLane, Position[]> = { TOP: ["TOP"], MIDDLE: ["MIDDLE"], BOTTOM: ["BOTTOM", "UTILITY"] };
const LANE_NAME: Record<GankLane, string> = { TOP: "top", MIDDLE: "mid", BOTTOM: "bot" };

/** Ocena jednej linii jako celu ganku. */
function scoreLane(
  lane: GankLane,
  allies: { c: ChampionProfile; pos: Position }[],
  enemies: { c: ChampionProfile; pos: Position }[],
  stats: StatsStore,
): GankTarget {
  const reasons: Reason[] = [];
  let s = 0;
  const myLane = allies.filter((a) => LANE_POSITIONS[lane].includes(a.pos));
  const theirLane = enemies.filter((e) => LANE_POSITIONS[lane].includes(e.pos));

  // 1. Follow-up sojuszników: twarde CC pozwala dokończyć gank.
  for (const { c } of myLane) {
    const cc = abilityText(c, "cc");
    if (cc) {
      s += 0.15;
      reasons.push({ tone: "plus", text: `${c.name} ma CC na follow-up: ${cc}.` });
    }
  }
  // 2. Wrogowie: brak ucieczki = łatwy cel, doskok = ucieknie, tank = trudny do zabicia.
  for (const { c } of theirLane) {
    const dash = abilityText(c, "dash");
    if (!dash && c.mobility === 1) {
      s += 0.2;
      reasons.push({ tone: "plus", text: `${c.name} nie ma czym uciec – łatwy cel ganku.` });
    } else if (dash) {
      s -= 0.12;
      reasons.push({ tone: "minus", text: `${c.name} może uciec: ${dash}.` });
    }
    if (c.durability === 3) {
      s -= 0.1;
      reasons.push({ tone: "minus", text: `${c.name} jest bardzo wytrzymały – gank rzadko kończy się zabójstwem.` });
    } else if (c.isCarry) {
      s += 0.1;
      reasons.push({ tone: "plus", text: `${c.name} to carry wroga – zatrzymanie go najbardziej osłabi ich drużynę.` });
    }
  }
  // 3. Stan linii ze statystyk: wygrywający matchup warto rozpędzić, przegrywający – odciążyć.
  for (const a of myLane) {
    const opp = theirLane.find((e) => e.pos === a.pos);
    if (!opp) continue;
    const wl = stats.lane(a.c.id, a.pos, opp.c.id);
    const base = stats.championWL(a.c.id, a.pos);
    if (!wl || wl.games < 8 || !base) continue;
    const delta = smoothedWinrate(wl, 30, smoothedWinrate(base, 100)) - smoothedWinrate(base, 100);
    const wr = pct(wl.wins / wl.games);
    if (delta >= 0.02) {
      s += 0.12;
      reasons.push({ tone: "plus", text: `Matchup ${a.c.name} vs ${opp.c.name} jest wygrany (${wr} wygranych ${inMatches(wl.games)}) – gank pomoże rozpędzić tę linię.` });
    } else if (delta <= -0.02) {
      s += 0.08;
      reasons.push({ tone: "info", text: `Matchup ${a.c.name} vs ${opp.c.name} jest przegrany (${wr} wygranych ${inMatches(wl.games)}) – gank odciąży linię.` });
    }
  }
  if (!theirLane.length) reasons.push({ tone: "info", text: "Przeciwnicy z tej linii nie są jeszcze znani." });

  const verdict: GankTarget["verdict"] = s >= 0.35 ? "best" : s >= 0.15 ? "good" : "weak";
  return {
    lane,
    score: Math.round(s * 100) / 100,
    verdict,
    allies: myLane.map((a) => a.c.name),
    enemies: theirLane.map((e) => e.c.name),
    reasons,
  };
}

/** Plan dla gracza w dżungli: styl clearu, ścieżka i ranking linii do ganku. */
export function junglePlan(
  me: ChampionProfile,
  ctx: PickContext,
  allyPositions: Map<number, Position>,
  side: "blue" | "red" | null,
  stats: StatsStore,
): JunglePlan {
  const allies = ctx.allies.map((c) => ({ c, pos: allyPositions.get(c.id) })).filter((a): a is { c: ChampionProfile; pos: Position } => !!a.pos);
  const enemies = ctx.enemies.map((c) => ({ c, pos: ctx.enemyPositions.get(c.id) })).filter((e): e is { c: ChampionProfile; pos: Position } => !!e.pos);

  const targets = (["TOP", "MIDDLE", "BOTTOM"] as GankLane[]).map((l) => scoreLane(l, allies, enemies, stats)).sort((a, b) => b.score - a.score);
  const { style, reason } = clearStyle(me);

  // Clear kończymy przy najlepszej linii bocznej (mid jest blisko z obu stron, więc decyduje kolejna linia).
  const endLane: GankLane = targets.find((t) => t.lane !== "MIDDLE")?.lane ?? "TOP";
  const path = clearPath(style, endLane === "TOP" ? "top" : "bot", side);

  const notes: string[] = [];
  if (!side) notes.push("Strona mapy nie jest znana – ścieżka opisana połowami dżungli (górna/dolna).");
  if (targets[0].lane === "MIDDLE") notes.push(`Mid jest dostępny z obu stron – po clearze przy ${LANE_NAME[endLane]} przejdź przez rzekę na mid.`);
  const best = targets[0];
  if (best.verdict === "weak") notes.push("Żadna linia nie jest dobrym celem wczesnego ganku – lepiej farmić i walczyć o kraba oraz smoki.");
  if (enemies.length) {
    const enemyJungler = ctx.enemies.find((c) => ctx.enemyPositions.get(c.id) === "JUNGLE");
    if (enemyJungler) notes.push(`Wrogi jungler: ${enemyJungler.name} – pilnuj, po której stronie zaczyna, i kontruj jego ganki po przeciwnej stronie.`);
  }

  return {
    champion: me.name,
    style,
    styleReason: reason,
    side,
    path,
    endsNear: endLane,
    readyAt: style === "gank" ? "ok. 2:15–2:30" : "ok. 3:15–3:30 (z krabem)",
    targets,
    notes,
  };
}
