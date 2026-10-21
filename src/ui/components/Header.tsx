import type { AppState } from "../../shared/types";

const CONNECTION_LABEL: Record<AppState["connection"], string> = {
  connected: "Połączono z klientem LoL",
  connecting: "Szukam klienta LoL…",
  disconnected: "Klient LoL wyłączony",
  mock: "Tryb demo",
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

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2l12 7v14l-12 7-12-7V9z" fill="#091428" stroke="currentColor" strokeWidth="2" />
      <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="#0ac8b9" />
    </svg>
  );
}

export function Header({ state }: { state: AppState }) {
  const tiers = state.statsTiers?.map((t) => TIER_NAME[t] ?? t).join(" + ");
  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">LoL Draft Helper</div>
          <div className="brand-sub">asystent wyboru postaci i buildów</div>
        </div>
      </div>
      <div className="header-pills">
        <span className={`pill status ${state.connection}`}>
          <i className="dot" /> {CONNECTION_LABEL[state.connection]}
        </span>
        <span className="pill" title="Wersja danych gry (postacie, przedmioty, runy)">
          Patch <b>{state.patch}</b>
        </span>
        <span
          className="pill"
          title={
            state.statsPatch
              ? "Winrate, kontry i buildy pochodzą z rankingowych meczów graczy z tych rang."
              : "Bez statystyk aplikacja działa w trybie heurystycznym (analiza składu)."
          }
        >
          {state.statsPatch ? (
            <>
              Statystyki: <b>{tiers ?? "rankingowe"}</b> · {state.statsMatches} meczów · patch {state.statsPatch}
            </>
          ) : (
            "Statystyki: brak – tryb heurystyczny"
          )}
        </span>
      </div>
    </header>
  );
}
