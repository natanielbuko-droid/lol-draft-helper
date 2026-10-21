import type { AppState } from "../../shared/types";

const CONNECTION_LABEL: Record<AppState["connection"], string> = {
  connected: "Połączono z klientem LoL",
  connecting: "Szukam klienta LoL…",
  disconnected: "Klient LoL wyłączony",
  mock: "Tryb demo (symulacja)",
};

export function Header({ state }: { state: AppState }) {
  return (
    <header className="header">
      <h1>LoL Draft Helper</h1>
      <span className={`pill ${state.connection}`}>● {CONNECTION_LABEL[state.connection]}</span>
      <span className="pill">Patch {state.patch}</span>
      <span className="pill" title="Bez statystyk aplikacja działa w trybie heurystycznym (analiza składu).">
        {state.statsPatch ? `Statystyki: ${state.statsPatch} (${state.statsMatches} meczów)` : "Statystyki: brak – tryb heurystyczny"}
      </span>
    </header>
  );
}
