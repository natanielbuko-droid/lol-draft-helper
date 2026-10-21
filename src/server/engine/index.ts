import type { BuildRecommendation, DraftState, PickRecommendation, PickScenario, TeamAnalysis } from "../../shared/types";
import type { GameData } from "../data/gameData";
import type { StatsStore } from "../data/statsStore";
import { recommendBuild } from "./buildEngine";
import { buildPickContext, pickScenarios, recommendPicks } from "./pickEngine";

export interface Recommendations {
  picks: PickRecommendation[];
  scenarios: PickScenario[];
  build: BuildRecommendation | null;
  allyAnalysis: TeamAnalysis;
  enemyAnalysis: TeamAnalysis;
}

/** Jeden punkt wejścia do silnika: stan draftu -> pełen zestaw rekomendacji. */
export function computeRecommendations(draft: DraftState, data: GameData, stats: StatsStore): Recommendations {
  const ctx = buildPickContext(draft, data, stats);
  const meSlot = draft.myTeam.find((s) => s.isLocalPlayer);
  const me = draft.myChampionId ? data.champions.get(draft.myChampionId) : undefined;

  // Po zablokowaniu postaci lista picków i scenariusze nie są już potrzebne.
  const picks = meSlot?.locked ? [] : recommendPicks(draft, data, stats);
  return {
    picks,
    scenarios: pickScenarios(picks),
    build: me ? recommendBuild(me, ctx.position, ctx.enemies, data, stats) : null,
    allyAnalysis: ctx.allyAnalysis,
    enemyAnalysis: ctx.enemyAnalysis,
  };
}
