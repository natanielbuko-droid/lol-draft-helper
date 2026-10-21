import type { AppState } from "../../shared/types";

const CONNECTION_LABEL: Record<AppState["connection"], string> = {
  connected: "Połączono z klientem LoL",
  connecting: "Szukam klienta LoL…",
  disconnected: "Klient LoL wyłączony",
  mock: "Tryb demo (symulacja)",
};

const TIER_NAME: Record<string, string> = {
  CHALLENGER: "Challenger",
  GRANDMASTER: "Grandmaster",
  MASTER: "Master",
  DIAMOND: "Diament",
  EMERALD: "Szmaragd",
  PLATINUM: "Platyna",
  GOLD: "Złoto",
  SILVER: "Srebro",
  BRONZE: "Brąz",
  IRON: "Żelazo",
};

export function Header({ state }: { state: AppState }) {
  const tiers = state.statsTiers?.map((t) => TIER_NAME[t] ?? t).join(" + ");
  return (
    <header className="header">
      <h1>LoL Draft Helper</h1>
      <span className={`pill ${state.connection}`}>● {CONNECTION_LABEL[state.connection]}</span>
      <span className="pill">Patch {state.patch}</span>
      <span
        className="pill"
        title={
          state.statsPatch
            ? "Winrate, kontry i buildy pochodzą z rankingowych meczów graczy z tych rang."
            : "Bez statystyk aplikacja działa w trybie heurystycznym (analiza składu)."
        }
      >
        {state.statsPatch
          ? `Statystyki: ${tiers ? `${tiers} · ` : ""}patch ${state.statsPatch} · ${state.statsMatches} meczów`
          : "Statystyki: brak – tryb heurystyczny"}
      </span>
    </header>
  );
}
