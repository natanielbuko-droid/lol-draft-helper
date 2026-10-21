import type { Position } from "../shared/types";
import { POSITIONS } from "../shared/types";
import type { StatsFile, WL } from "../server/data/statsStore";
import type { MatchDto, MatchParticipant, TimelineDto } from "./riotApi";

/** "16.21.567.1234" -> "16.21" */
export const patchOf = (gameVersion: string) => gameVersion.split(".").slice(0, 2).join(".");

/** Porównanie patchy liczbowo ("16.9" < "16.10"). */
export function comparePatch(a: string, b: string): number {
  const [a1, a2] = a.split(".").map(Number);
  const [b1, b2] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
}

function bump(map: Record<string, WL>, key: string | number, win: boolean) {
  const wl = (map[key] ??= { games: 0, wins: 0 });
  wl.games++;
  if (win) wl.wins++;
}

const SKILL = ["", "Q", "W", "E"];

/** Kolejność maksowania umiejętności z osi czasu (która pierwsza osiągnęła 5 punktów). */
function skillMaxOrder(timeline: TimelineDto, participantId: number): string | null {
  const counts = [0, 0, 0, 0, 0];
  const order: number[] = [];
  for (const f of timeline.info.frames)
    for (const e of f.events)
      if (e.type === "SKILL_LEVEL_UP" && e.participantId === participantId && e.skillSlot && e.skillSlot <= 3) {
        if (++counts[e.skillSlot] === 5) order.push(e.skillSlot);
      }
  for (const s of [1, 2, 3].sort((a, b) => counts[b] - counts[a])) if (!order.includes(s)) order.push(s);
  return counts[1] + counts[2] + counts[3] >= 6 ? order.map((s) => SKILL[s]).join("") : null;
}

/** Pierwsze 3 ukończone przedmioty w kolejności zakupu. */
function coreOrder(timeline: TimelineDto, participantId: number, isCore: (id: string) => boolean): string | null {
  const seq: string[] = [];
  for (const f of timeline.info.frames)
    for (const e of f.events)
      if (e.type === "ITEM_PURCHASED" && e.participantId === participantId && e.itemId) {
        const id = String(e.itemId);
        if (isCore(id) && !seq.includes(id)) seq.push(id);
      }
  return seq.length >= 3 ? seq.slice(0, 3).join(">") : null;
}

function runeKey(p: MatchParticipant): string | null {
  const primary = p.perks.styles.find((s) => s.description === "primaryStyle");
  const sub = p.perks.styles.find((s) => s.description === "subStyle");
  if (!primary || !sub) return null;
  const sp = p.perks.statPerks;
  const perks = [...primary.selections.map((s) => s.perk), ...sub.selections.map((s) => s.perk), sp.offense, sp.flex, sp.defense];
  return `${primary.style}|${sub.style}|${perks.join(",")}`;
}

/**
 * Dodaje jeden mecz do statystyk. Liczymy wszystko jako gry/wygrane,
 * a winrate (z wygładzaniem) wyliczamy dopiero w aplikacji.
 */
export function addMatch(stats: StatsFile, match: MatchDto, timeline: TimelineDto | null, isCoreItem: (id: string) => boolean): boolean {
  const ps = match.info.participants.filter((p) => POSITIONS.includes(p.teamPosition as Position));
  if (ps.length !== 10) return false; // remake / niepełne dane
  stats.matches++;

  for (const p of ps) {
    const pos = p.teamPosition as Position;
    const champ = String(p.championId);
    const byPos = (stats.champions[champ] ??= {});
    const wl = (byPos[pos] ??= { games: 0, wins: 0 });
    wl.games++;
    if (p.win) wl.wins++;

    const allies = ps.filter((o) => o.teamId === p.teamId && o !== p);
    const enemies = ps.filter((o) => o.teamId !== p.teamId);
    for (const a of allies) bump((stats.with[champ] ??= {}), a.championId, p.win);
    for (const e of enemies) bump((stats.vs[champ] ??= {}), e.championId, p.win);
    const laneOpp = enemies.find((e) => e.teamPosition === p.teamPosition);
    if (laneOpp) bump((stats.lane[`${champ}:${pos}`] ??= {}), laneOpp.championId, p.win);

    const b = (stats.builds[`${champ}:${pos}`] ??= { items: {}, coreOrders: {}, summoners: {}, runes: {}, skillOrders: {} });
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.roleBoundItem ?? 0].filter((i) => i > 0).map(String);
    for (const i of new Set(items)) bump(b.items, i, p.win);
    bump(b.summoners, [p.summoner1Id, p.summoner2Id].sort((x, y) => x - y).join("+"), p.win);
    const rk = runeKey(p);
    if (rk) bump(b.runes, rk, p.win);
    if (timeline) {
      const so = skillMaxOrder(timeline, p.participantId);
      if (so) bump(b.skillOrders, so, p.win);
      const co = coreOrder(timeline, p.participantId, isCoreItem);
      if (co) bump(b.coreOrders, co, p.win);
    }
  }
  return true;
}
