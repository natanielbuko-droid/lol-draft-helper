import { useEffect, useState } from "react";
import type { AppState } from "../../shared/types";
import { BuildPanel } from "./BuildPanel";
import { PickSuggestions } from "./PickSuggestions";
import { ScenarioCards } from "./ScenarioCards";

type Tab = "picks" | "build";

/**
 * Prawa kolumna w champ selekcie: zakładki "Picki" i "Build" zamiast jednej długiej kolumny.
 * Gdy gracz najedzie na postać (pojawi się build), aplikacja sama przełącza na "Build".
 */
export function ChampSelectTabs({ state }: { state: AppState }) {
  const [tab, setTab] = useState<Tab>("picks");
  const buildFor = state.build?.championId ?? null;
  const hasPicks = state.picks.length > 0;

  // Nowa postać w buildzie -> pokaż build; brak picków (postać zablokowana) -> też build.
  useEffect(() => {
    if (buildFor !== null) setTab("build");
  }, [buildFor]);
  useEffect(() => {
    if (!hasPicks && buildFor !== null) setTab("build");
    if (buildFor === null) setTab("picks");
  }, [hasPicks, buildFor]);

  const champion = state.build ? state.champions[state.build.championId] : undefined;
  return (
    <div className="col">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "picks"} className={tab === "picks" ? "active" : ""} disabled={!hasPicks} onClick={() => setTab("picks")}>
          Picki {hasPicks && <span className="count">{state.picks.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === "build"} className={tab === "build" ? "active" : ""} disabled={!state.build} onClick={() => setTab("build")}>
          {state.build ? `Build: ${state.build.championName}` : "Build"}
        </button>
      </div>
      {tab === "picks" && hasPicks ? (
        <>
          <ScenarioCards scenarios={state.scenarios} />
          <PickSuggestions picks={state.picks} />
        </>
      ) : state.build ? (
        <BuildPanel build={state.build} champion={champion} />
      ) : (
        <div className="card hint-card">Najedź na postać w kliencie (hover), aby zobaczyć jej build.</div>
      )}
    </div>
  );
}
