import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChampionProfile, PickRecommendation } from "../src/shared/types";
import { DASH, HARD_CC } from "../src/server/data/championProfile";
import { parseItemStats, type CatalogItem } from "../src/server/data/itemCatalog";
import { smoothedWinrate } from "../src/server/data/statsStore";
import { situationalItems, skillLevels } from "../src/server/engine/buildEngine";
import { compareWithOthers, compositionScore, personalPart, pickScenarios } from "../src/server/engine/pickEngine";
import { buildPlayerPool, comfortScore, recentGames } from "../src/server/lcu/playerPool";
import { analyzeTeam } from "../src/server/engine/teamAnalysis";
import { clearPath } from "../src/server/engine/jungleEngine";
import { orderSpells } from "../src/server/clientImport";
import { parseRiotId, ranksOf, toPlayerMatch } from "../src/server/players";
import { parseSession } from "../src/server/lcu/champSelect";

// --- Dane testowe (syntetyczne – testy nie potrzebują internetu) ---

let nextId = 1;
function champ(p: Partial<ChampionProfile>): ChampionProfile {
  return {
    id: nextId++, key: "X", name: "X", image: "", roles: ["fighter"], damageType: "physical", attackType: "melee",
    damage: 2, durability: 2, crowdControl: 2, mobility: 2, utility: 1, healing: 0, hardCC: 1, isCarry: false, abilities: [], ...p,
  };
}

function item(id: string, stats: Record<string, number>, flags: Partial<CatalogItem["flags"]> = {}): CatalogItem {
  return {
    id, name: id, image: "", gold: 3000, tags: [], stats, isBoots: false, isCompleted: true, isComponent: false,
    flags: {
      antiHeal: false, armor: "Armor" in stats, magicResist: "Magic Resist" in stats, percentArmorPen: false,
      percentMagicPen: false, tenacity: false, cleanse: false, stasis: false, spellShield: false, lifeline: false,
      antiShield: false, ...flags,
    },
  };
}

const marksman = champ({ name: "ADC", roles: ["marksman"], attackType: "ranged", damage: 3, durability: 1, isCarry: true });
const healer = (n: string) => champ({ name: n, healing: 3 });

const catalog = new Map<string, CatalogItem>([
  ["antiheal-ad", item("antiheal-ad", { "Attack Damage": 35, "Critical Strike Chance": 25 }, { antiHeal: true })],
  ["antiheal-ap", item("antiheal-ap", { "Ability Power": 35 }, { antiHeal: true })],
  ["crit", item("crit", { "Attack Damage": 60, "Critical Strike Chance": 25 })],
]);

// --- Testy ---

test("parseItemStats czyta statystyki z opisu Data Dragon", () => {
  const desc = "<mainText><stats><attention>35</attention> Attack Damage<br><attention>30%</attention> Armor Penetration</stats></mainText>";
  assert.deepEqual(parseItemStats(desc), { "Attack Damage": 35, "Armor Penetration%": 30 });
});

test("wygładzony winrate przyciąga małe próbki do 50%", () => {
  assert.equal(smoothedWinrate({ games: 3, wins: 3 }, 30), (3 + 15) / 33);
  assert.ok(smoothedWinrate({ games: 3000, wins: 1650 }, 30) > 0.54);
});

test("analiza drużyny liczy udział obrażeń AD/AP", () => {
  const t = analyzeTeam([champ({ damageType: "physical" }), champ({ damageType: "magic" })]);
  assert.equal(t.physicalShare, 0.5);
});

test("anti-heal pojawia się, gdy wróg dużo się leczy – i pasuje do typu postaci", () => {
  const enemy = analyzeTeam([healer("A"), healer("B"), champ({})]);
  const items = situationalItems({ me: marksman, arch: "marksman", enemy }, catalog, new Set());
  assert.equal(items[0]?.id, "antiheal-ad");
  assert.ok(!items.some((i) => i.id === "antiheal-ap"), "strzelec nie powinien dostać przedmiotu AP");
});

test("brak anti-heal, gdy wróg się nie leczy", () => {
  const enemy = analyzeTeam([champ({}), champ({})]);
  const items = situationalItems({ me: marksman, arch: "marksman", enemy }, catalog, new Set());
  assert.ok(!items.some((i) => i.rule === "anti-heal"));
});

test("skład pełen AD premiuje postać magiczną", () => {
  const allies = analyzeTeam([champ({}), champ({}), champ({})]);
  const enemies = analyzeTeam([]);
  const mage = compositionScore(champ({ damageType: "magic", roles: ["mage"] }), allies, enemies, 3);
  const bruiser = compositionScore(champ({ damageType: "physical" }), allies, enemies, 3);
  assert.ok(mage.value > bruiser.value);
});

test("parseSession rozpoznaje gracza, pozycje i zablokowane picki", () => {
  const draft = parseSession({
    localPlayerCellId: 1,
    myTeam: [
      { cellId: 0, championId: 10, assignedPosition: "top" },
      { cellId: 1, championId: 0, championPickIntent: 22, assignedPosition: "bottom" },
    ],
    theirTeam: [{ cellId: 5, championId: 30, assignedPosition: "" }],
    actions: [[{ actorCellId: 0, championId: 10, completed: true, isInProgress: false, type: "pick" }]],
    bans: { myTeamBans: [7], theirTeamBans: [] },
    timer: { phase: "BAN_PICK" },
  });
  assert.equal(draft.myPosition, "BOTTOM");
  assert.equal(draft.myChampionId, 22);
  assert.equal(draft.myTeam[0].locked, true);
  assert.deepEqual(draft.bans, [7]);
});

test("kolejność umiejętności rozpisana na poziomy 1–18 według zasad gry", () => {
  assert.equal(skillLevels(["Q", "W", "E"]).join(""), "QWEQQRQWQWRWWEEREE");
  const levels = skillLevels(["E", "Q", "W"]);
  assert.equal(levels.filter((s) => s === "R").length, 3);
  for (const s of ["Q", "W", "E"]) assert.equal(levels.filter((x) => x === s).length, 5);
});

test("porównanie z innymi propozycjami wyjaśnia przewagę #1 i mocne strony pozostałych", () => {
  const pick = (name: string, total: number, s: Partial<PickRecommendation["score"]>): PickRecommendation => ({
    championId: nextId++, name, image: "", reasons: [], comparison: [],
    score: { meta: 0, counter: 0, synergy: 0, composition: 0, total, confidence: 1, games: 100, winrate: 0.5, pickRate: 0.02, ...s },
  });
  const picks = [
    pick("A", 66, { meta: 0.8, counter: 0.1, winrate: 0.55, pickRate: 0.06 }),
    pick("B", 60, { meta: 0.2, counter: 0.6, winrate: 0.5 }),
    pick("C", 55, { meta: 0.1, counter: 0.0, winrate: 0.49 }),
  ];
  compareWithOthers(picks);
  assert.ok(picks[0].comparison.some((c) => c.startsWith("Przewaga nad #2 (B)") && c.includes("winrate (55,0% wobec 50,0%)")));
  assert.ok(picks[0].comparison.some((c) => c.startsWith("Wygrywa częściej niż czołówka")));
  assert.ok(picks[0].comparison.length <= 3, "najwyżej 3 zdania porównania na postać");
  assert.ok(picks[1].comparison.some((c) => c.startsWith("Względem #1 (A) lepsze") && c.includes("matchupy z wybranymi wrogami")));
});

test("3 scenariusze: idealnie = najlepsza, koszmarnie = najgorsza, neutralnie = ocena najbliższa 50", () => {
  const pick = (name: string, total: number, s: Partial<PickRecommendation["score"]> = {}, reasons: PickRecommendation["reasons"] = []): PickRecommendation => ({
    championId: nextId++, name, image: "", reasons, comparison: [],
    score: { meta: 0, counter: 0, synergy: 0, composition: 0, total, confidence: 1, games: 100, winrate: 0.5, pickRate: 0.02, ...s },
  });
  const picks = [
    pick("Top", 70, { meta: 0.7, winrate: 0.56 }),
    pick("Dobra", 60),
    pick("Środek", 51),
    pick("Słaba", 44),
    pick("Dno", 35, { meta: -0.6, winrate: 0.44 }, [
      { text: "vs X (rywal na linii): 41,0% wygranych w 20 meczach – zwykle 50,0%.", tone: "minus" },
      { text: "2. najczęściej wybierana postać na ADC (9,0% gier).", tone: "info" },
    ]),
  ];
  const [ideal, neutral, nightmare] = pickScenarios(picks);
  assert.equal(ideal.kind, "ideal");
  assert.equal(ideal.pick.name, "Top");
  assert.equal(neutral.pick.name, "Środek");
  assert.equal(nightmare.pick.name, "Dno");
  // Bez konkretnych powodów – zapasowy opis kategorii; z powodami – same wady (bez neutralnych informacji).
  assert.ok(ideal.summary.some((l) => l.startsWith("Mocna strona: siła na patchu")));
  assert.deepEqual(nightmare.summary, ["vs X (rywal na linii): 41,0% wygranych w 20 meczach – zwykle 50,0%."]);
  assert.deepEqual(pickScenarios(picks.slice(0, 2)), [], "za mało kandydatów = brak scenariuszy");
});

test("plan dżungli: ścieżka kończy się przy linii do ganku i zależy od strony mapy", () => {
  // Niebieska strona: górna połowa = Blue/Gromp/Wilki, dolna = Red/Krugi/Raptory.
  assert.deepEqual(clearPath("gank", "top", "blue"), ["Red buff", "Blue buff", "Gromp"]);
  assert.deepEqual(clearPath("gank", "bot", "blue"), ["Blue buff", "Red buff", "Krugi"]);
  assert.deepEqual(clearPath("farm", "top", "blue"), ["Red buff", "Krugi", "Raptory", "Wilki", "Blue buff", "Gromp", "Krab (scuttle)"]);
  // Czerwona strona: górna połowa = Red/Krugi/Raptory.
  assert.deepEqual(clearPath("gank", "top", "red"), ["Blue buff", "Red buff", "Krugi"]);
  assert.equal(clearPath("gank", "top", null).length, 3);
});

test("import: Flash zostaje na klawiszu gracza (D albo F)", () => {
  assert.deepEqual(orderSpells([4, 7], { spell1Id: 4, spell2Id: 14 }), [4, 7]); // Flash na D
  assert.deepEqual(orderSpells([4, 7], { spell1Id: 14, spell2Id: 4 }), [7, 4]); // Flash na F
  assert.deepEqual(orderSpells([7, 4], null), [4, 7]); // brak danych – Flash na D
  assert.deepEqual(orderSpells([11, 14], { spell1Id: 4, spell2Id: 11 }), [11, 14]); // bez Flasha – bez zmian
});

test("pula gracza: maestria + ostatnie mecze, premia i powód z liczbami", () => {
  const games = recentGames({
    games: {
      games: [
        { queueId: 420, participants: [{ championId: 222, stats: { win: true } }] },
        { queueId: 420, participants: [{ championId: 222, stats: { win: false } }] },
        { queueId: 450, participants: [{ championId: 222, stats: { win: true } }] }, // ARAM – nie liczymy
      ],
    },
  });
  assert.equal(games.length, 2);
  const pool = buildPlayerPool([{ championId: 222, championPoints: 182_000, championLevel: 12 }, { championId: 1, championPoints: 0, championLevel: 0 }], games);
  assert.deepEqual(pool, [{ championId: 222, masteryPoints: 182_000, masteryLevel: 12, games: 2, wins: 1 }]);
  assert.ok(comfortScore(pool[0]) > 0.6);
  assert.equal(comfortScore(undefined), 0);
  const part = personalPart(pool[0]);
  assert.ok(part.points > 6 && part.points <= 10);
  assert.equal(part.reasons[0].text, "Twoja postać: 182 tys. pkt maestrii (poziom 12), 50% wygranych w ostatnich 2 grach.");
  assert.equal(personalPart(undefined).points, 0);
});

test("opisy umiejętności: CC i doskoki bez fałszywych trafień", () => {
  const tristanaW = "Tristana fires at the ground to propel her to a distant location, dealing damage and slowing surrounding units.";
  const tristanaR = "Tristana loads a massive cannonball into her weapon and fires it at an enemy unit. This deals Magic Damage and knocks the target back.";
  assert.equal(HARD_CC.test(tristanaW), false, "strzał w ziemię to nie CC");
  assert.equal(DASH.test(tristanaW), true, "Rakietowy Skok to doskok");
  assert.equal(HARD_CC.test(tristanaR), true, "odrzut z wyrazami w środku");
  assert.equal(HARD_CC.test("Alistar smashes the ground, dealing damage to nearby enemies and tossing them into the air."), true);
  assert.equal(HARD_CC.test("Fizz hops into the air, landing gracefully upon his spear and becoming untargetable."), false);
  assert.equal(DASH.test("Braum propels ice from his shield, slowing the first enemy hit."), false);
});

test("wyszukiwarka graczy: Riot ID, rangi i mecz z perspektywy gracza", () => {
  assert.deepEqual(parseRiotId("  Nick Z Spacją#EUNE ", "eun1"), ["Nick Z Spacją", "EUNE"]);
  assert.deepEqual(parseRiotId("Sam#Nick#TAG", "eun1"), ["Sam#Nick", "TAG"], "tag to część po ostatnim #");
  assert.deepEqual(parseRiotId("BezTagu", "euw1"), ["BezTagu", "EUW"], "domyślny tag serwera");
  assert.throws(() => parseRiotId("#TAG", "eun1"));

  const ranks = ranksOf([
    { queueType: "RANKED_FLEX_SR", tier: "GOLD", rank: "II", leaguePoints: 40, wins: 5, losses: 3 },
    { queueType: "RANKED_SOLO_5x5", tier: "MASTER", rank: "I", leaguePoints: 300, wins: 60, losses: 50 },
    { queueType: "CHERRY", tier: "", rank: "", leaguePoints: 0, wins: 1, losses: 1 },
  ]);
  assert.deepEqual(ranks.map((r) => `${r.queue}:${r.tier}${r.division}`), ["solo:MASTER", "flex:GOLDII"], "Master+ bez dywizji, Arena pominięta");

  const data = {
    champions: new Map([[222, { id: 222, name: "Jinx", image: "jinx.png" }]]),
    itemRefs: new Map([["3031", { id: "3031", name: "Ostrze Nieskończoności", image: "ie.png", gold: 3450 }]]),
  } as never;
  const p = (puuid: string, win: boolean) => ({
    puuid, championId: 222, win, teamPosition: "BOTTOM", kills: 7, deaths: 2, assists: 5, totalMinionsKilled: 180, neutralMinionsKilled: 12,
    item0: 3031, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
  });
  const dto = { metadata: { matchId: "EUN1_1" }, info: { gameVersion: "16.21", gameCreation: 0, queueId: 420, gameDuration: 1800, participants: [p("a", false), p("me", true)] } } as never;
  const m = toPlayerMatch(dto, "me", data)!;
  assert.equal(m.win, true);
  assert.equal(m.queue, "Rankingowa solo/duo");
  assert.equal(m.cs, 192, "CS = stwory + potwory z dżungli");
  assert.deepEqual(m.items.map((i) => i.name), ["Ostrze Nieskończoności"], "puste sloty pominięte");
  assert.equal(m.remake, false);
  assert.equal(toPlayerMatch(dto, "ktoś-inny", data), null);
});
