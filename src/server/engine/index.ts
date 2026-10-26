import type { BuildRecommendation, DraftState, JunglePlan, PickRecommendation, PickScenario, PoolEntry, Position, TeamAnalysis } from "../../shared/types";
import type { GameData } from "../data/gameData";
import type { StatsStore } from "../data/statsStore";
import { recommendBuild } from "./buildEngine";
import { junglePlan } from "./jungleEngine";
import { buildPickContext, pickScenarios, recommendPicks } from "./pickEngine";
import { inferPositions } from "./teamAnalysis";

export interface Recommendations {
  picks: PickRecommendation[];
  scenarios: PickScenario[];
  jungle: JunglePlan | null;
  build: BuildRecommendation | null;
  allyAnalysis: TeamAnalysis;
  enemyAnalysis: TeamAnalysis;
}

/** Jeden punkt wejścia do silnika: stan draftu -> pełen zestaw rekomendacji. */
export function computeRecommendations(
  draft: DraftState,
  data: GameData,
  stats: StatsStore,
  pool: Map<number, PoolEntry> = new Map(),
): Recommendations {
  const ctx = buildPickContext(draft, data, stats, pool);
  const meSlot = draft.myTeam.find((s) => s.isLocalPlayer);
  const me = draft.myChampionId ? data.champions.get(draft.myChampionId) : undefined;

  // Po zablokowaniu postaci lista picków i scenariusze nie są już potrzebne.
  const picks = meSlot?.locked ? [] : recommendPicks(draft, data, stats, pool);
  return {
    picks,
    scenarios: pickScenarios(picks),
    jungle: me && ctx.position === "JUNGLE" ? junglePlan(me, ctx, allyPositions(draft, data, stats), draft.mySide, stats) : null,
    build: me ? recommendBuild(me, ctx.position, ctx.enemies, data, stats) : null,
    allyAnalysis: ctx.allyAnalysis,
    enemyAnalysis: ctx.enemyAnalysis,
  };
}

/** Pozycje sojuszników: z klienta (assignedPosition), a gdy brak – zgadywane ze statystyk. */
function allyPositions(draft: DraftState, data: GameData, stats: StatsStore): Map<number, Position> {
  const known = new Map<number, Position>();
  const unknown = [];
  for (const s of draft.myTeam) {
    if (s.isLocalPlayer || !s.championId) continue;
    const c = data.champions.get(s.championId);
    if (!c) continue;
    if (s.position) known.set(c.id, s.position);
    else unknown.push(c);
  }
  const taken = [...known.values(), ...(draft.myPosition ? [draft.myPosition] : [])];
  for (const [id, pos] of inferPositions(unknown, stats, taken)) known.set(id, pos);
  return known;
}
