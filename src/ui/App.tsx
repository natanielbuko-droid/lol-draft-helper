import { BuildPanel } from "./components/BuildPanel";
import { DraftBoard } from "./components/DraftBoard";
import { Header } from "./components/Header";
import { ChampSelectTabs } from "./components/ChampSelectTabs";
import { TeamPanel } from "./components/TeamPanel";
import { useAppState } from "./useAppState";

/** Fazy klienta LoL po champ selekcie -> komunikat dla gracza. */
const PHASE_BANNER: Record<string, string> = {
  GameStart: "Gra się ładuje",
  InProgress: "Trwa gra",
  Reconnect: "Trwa gra",
  WaitingForStats: "Koniec gry",
  PreEndOfGame: "Koniec gry",
  EndOfGame: "Koniec gry",
};

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 32 32" aria-hidden>
        <path d="M16 2l12 7v14l-12 7-12-7V9z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="currentColor" opacity=".35" />
      </svg>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

/**
 * Struktura UI:
 *   Header          – status połączenia z klientem LoL, patch, źródło statystyk
 *   DraftBoard      – obie drużyny i bany
 *   TeamPanel       – analiza składów (AD/AP, CC, leczenie, tanki, zabójcy)
 *   ScenarioCards   – idealny / neutralny / koszmarny wybór
 *   PickSuggestions – pełny ranking picków z powodami i porównaniem
 *   BuildPanel      – przedmioty, sytuacyjne, runy, czary, umiejętności + alternatywy
 */
export function App() {
  const { state, online } = useAppState();

  if (!online || !state) {
    return (
      <div className="app">
        <Empty title="Łączenie z aplikacją…">
          Uruchom aplikację plikiem <code>start.bat</code> (albo <code>demo.bat</code>, żeby zobaczyć tryb demo).
        </Empty>
      </div>
    );
  }

  const { draft } = state;
  const champion = state.build ? state.champions[state.build.championId] : undefined;
  return (
    <div className="app">
      <Header state={state} />
      {!draft ? (
        <Empty title="Czekam na wybór postaci">
          Rekomendacje pojawią się same, gdy wejdziesz do champ selectu. Faza klienta: <b>{state.gameflowPhase}</b>.
        </Empty>
      ) : state.gameflowPhase !== "ChampSelect" ? (
        // Po champ selekcie (gra, ekran końcowy, lobby) – na pierwszym planie build z ostatniego draftu.
        <>
          <div className="banner">
            <b>{PHASE_BANNER[state.gameflowPhase] ?? "Champ select zakończony"}</b> – poniżej Twój build z ostatniego wyboru postaci.
          </div>
          <main className="grid in-game">
            <div className="col">
              {state.build ? <BuildPanel build={state.build} champion={champion} /> : <div className="card muted">Nie wybrano postaci w ostatnim champ selekcie.</div>}
            </div>
            <div className="col">
              <TeamPanel ally={state.allyAnalysis} enemy={state.enemyAnalysis} />
              <DraftBoard draft={draft} champions={state.champions} />
            </div>
          </main>
        </>
      ) : (
        <main className="grid">
          <div className="col">
            <DraftBoard draft={draft} champions={state.champions} />
            <TeamPanel ally={state.allyAnalysis} enemy={state.enemyAnalysis} />
          </div>
          <ChampSelectTabs state={state} />
        </main>
      )}
      {/* Informacja wymagana przez zasady Riot Games dla aplikacji fanowskich */}
      <footer className="legal">
        LoL Draft Helper isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially
        involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or
        registered trademarks of Riot Games, Inc.
      </footer>
    </div>
  );
}
