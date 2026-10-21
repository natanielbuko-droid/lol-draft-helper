import { BuildPanel } from "./components/BuildPanel";
import { DraftBoard } from "./components/DraftBoard";
import { Header } from "./components/Header";
import { PickSuggestions } from "./components/PickSuggestions";
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

/**
 * Struktura UI:
 *   Header          – status połączenia z klientem LoL, patch, źródło statystyk
 *   DraftBoard      – obie drużyny i bany
 *   PickSuggestions – ranking picków z rozbiciem punktacji
 *   BuildPanel      – przedmioty core/sytuacyjne, runy, czary, kolejność umiejętności
 *   TeamPanel       – analiza składów (AD/AP, CC, leczenie, frontline)
 */
export function App() {
  const { state, online } = useAppState();

  if (!online || !state) {
    return (
      <div className="center">
        <h2>Łączenie z serwerem aplikacji…</h2>
        <p className="muted">Uruchom serwer poleceniem <code>npm run dev</code> lub <code>npm run dev:mock</code>.</p>
      </div>
    );
  }

  const { draft } = state;
  return (
    <div className="app">
      <Header state={state} />
      {!draft ? (
        <div className="center">
          <h2>Czekam na champ select</h2>
          <p className="muted">
            Faza klienta: <b>{state.gameflowPhase}</b>. Rekomendacje pojawią się automatycznie, gdy wejdziesz do wyboru postaci.
          </p>
        </div>
      ) : state.gameflowPhase !== "ChampSelect" ? (
        // Po champ selekcie (gra, ekran końcowy, lobby) – na pierwszym planie build z ostatniego draftu.
        <>
          <div className="banner">
            {PHASE_BANNER[state.gameflowPhase] ?? "Champ select zakończony"} – poniżej Twój build z ostatniego wyboru postaci.
          </div>
          <main className="grid in-game">
            <section className="col">
              {state.build ? <BuildPanel build={state.build} /> : <div className="card muted">Nie wybrano postaci w ostatnim champ selekcie.</div>}
            </section>
            <section className="col">
              <TeamPanel ally={state.allyAnalysis} enemy={state.enemyAnalysis} />
              <DraftBoard draft={draft} champions={state.champions} />
            </section>
          </main>
        </>
      ) : (
        <main className="grid">
          <section className="col">
            <DraftBoard draft={draft} champions={state.champions} />
            <TeamPanel ally={state.allyAnalysis} enemy={state.enemyAnalysis} />
          </section>
          <section className="col">
            {state.picks.length > 0 && <PickSuggestions picks={state.picks} />}
            {state.build ? <BuildPanel build={state.build} /> : <div className="card muted">Najedź na postać (hover), aby zobaczyć build.</div>}
          </section>
        </main>
      )}
      {/* Informacja wymagana przez zasady Riot Games dla aplikacji fanowskich */}
      <footer className="legal muted">
        LoL Draft Helper isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially
        involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or
        registered trademarks of Riot Games, Inc.
      </footer>
    </div>
  );
}
