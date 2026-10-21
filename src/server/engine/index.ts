import type { BuildRecommendation, DraftState, PickRecommendation, TeamAnalysis } from "../../shared/types";
import type { GameData } from "../data/gameData";
import type { StatsStore } from "../data/statsStore";
import { recommendBuild } from "./buildEngine";
import { buildPickContext, recommendPicks } from "./pickEngine";

export interface Recommendations {
  picks: PickRecommendation[];
  build: BuildRecommendation | null;
  allyAnalysis: TeamAnalysis;
  enemyAnalysis: TeamAnalysis;
}

/** Jeden punkt wejścia do silnika: stan draftu -> pełen zestaw rekomendacji. */
export function computeRecommendations(draft: DraftState, data: GameData, stats: StatsStore): Recommendations {
  const ctx = buildPickContext(draft, data, stats);
  const meSlot = draft.myTeam.find((s) => s.isLocalPlayer);
  const me = draft.myChampionId ? data.champions.get(draft.myChampionId) : undefined;

  return {
    // Po zablokowaniu postaci lista picków nie jest już potrzebna.
    picks: meSlot?.locked ? [] : recommendPicks(draft, data, stats),
    build: me ? recommendBuild(me, ctx.position, ctx.enemies, data, stats) : null,
    allyAnalysis: ctx.allyAnalysis,
    enemyAnalysis: ctx.enemyAnalysis,
  };
}
