import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChampionProfile } from "../src/shared/types";
import { parseItemStats, type CatalogItem } from "../src/server/data/itemCatalog";
import { smoothedWinrate } from "../src/server/data/statsStore";
import { situationalItems } from "../src/server/engine/buildEngine";
import { compositionScore } from "../src/server/engine/pickEngine";
import { analyzeTeam } from "../src/server/engine/teamAnalysis";
import { parseSession } from "../src/server/lcu/champSelect";

// --- Dane testowe (syntetyczne – testy nie potrzebują internetu) ---

let nextId = 1;
function champ(p: Partial<ChampionProfile>): ChampionProfile {
  return {
    id: nextId++, key: "X", name: "X", image: "", roles: ["fighter"], damageType: "physical", attackType: "melee",
    damage: 2, durability: 2, crowdControl: 2, mobility: 2, utility: 1, healing: 0, hardCC: 1, isCarry: false, ...p,
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
