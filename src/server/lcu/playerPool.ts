import type { PoolEntry } from "../../shared/types";

/** Kolejki na Summoner's Rift liczone do formy gracza: normalne, rankingowe solo/flex, swiftplay. */
const RIFT_QUEUES = new Set([400, 420, 430, 440, 480, 490]);

export interface LcuMastery {
  championId: number;
  championPoints: number;
  championLevel: number;
}

/** Fragment odpowiedzi /lol-match-history/v1/products/lol/current-summoner/matches. */
export interface LcuMatchHistory {
  games?: { games?: { queueId: number; participants?: { championId: number; stats?: { win?: boolean } }[] }[] };
}

/** Ostatnie mecze gracza na Summoner's Rift (w historii klienta jest tylko jego własny uczestnik). */
export function recentGames(history: LcuMatchHistory | null): { championId: number; win: boolean }[] {
  return (history?.games?.games ?? [])
    .filter((g) => RIFT_QUEUES.has(g.queueId) && g.participants?.length)
    .map((g) => ({ championId: g.participants![0].championId, win: !!g.participants![0].stats?.win }));
}

/** Pula gracza: maestria + ostatnie mecze, połączone po postaci. */
export function buildPlayerPool(mastery: LcuMastery[], games: { championId: number; win: boolean }[]): PoolEntry[] {
  const pool = new Map<number, PoolEntry>();
  const entry = (id: number) => {
    let e = pool.get(id);
    if (!e) pool.set(id, (e = { championId: id, masteryPoints: 0, masteryLevel: 0, games: 0, wins: 0 }));
    return e;
  };
  for (const m of mastery) {
    if (m.championPoints <= 0) continue;
    const e = entry(m.championId);
    e.masteryPoints = m.championPoints;
    e.masteryLevel = m.championLevel;
  }
  for (const g of games) {
    const e = entry(g.championId);
    e.games++;
    if (g.win) e.wins++;
  }
  return [...pool.values()];
}

/**
 * Jak dobrze gracz zna postać (0..1). Maestria liczy się logarytmicznie
 * (10 tys. pkt ≈ 0,3, 50 tys. ≈ 0,7, 150 tys.+ = 1), ostatnie gry – do 10 meczów.
 */
export function comfortScore(e: PoolEntry | undefined): number {
  if (!e) return 0;
  const mastery = Math.min(1, Math.log10(1 + e.masteryPoints / 5000) / Math.log10(31));
  const recent = Math.min(1, e.games / 10);
  return Math.min(1, 0.6 * mastery + 0.4 * recent);
}
