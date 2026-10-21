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

/**
 * Od 2026 r. Riot nazywa patche numerem roku (patch notes: "26.21"), a pliki danych i mecze
 * nadal mają starą numerację ("16.21.1"). Pokazujemy numer, który gracz zna z patch notes.
 */
export function publicPatch(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  return major >= 16 && !Number.isNaN(minor) ? `${major + 10}.${minor}` : version;
}

const majorMinor = (v: string) => v.split(".").slice(0, 2).join(".");

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
  // Statystyki z innego patcha niż aktualna gra – ostrzegamy, bo zmiany balansu mogą je unieważnić.
  const statsOutdated = !!state.statsPatch && majorMinor(state.statsPatch) !== majorMinor(state.patch);
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
        <span className="pill" title={`Aktualny patch gry – postacie, przedmioty i runy (wersja danych Riot: ${state.patch})`}>
          Patch <b>{publicPatch(state.patch)}</b>
        </span>
        <span
          className={`pill ${statsOutdated ? "warn" : ""}`}
          title={
            !state.statsPatch
              ? "Bez statystyk aplikacja działa w trybie heurystycznym (analiza składu)."
              : statsOutdated
                ? `Statystyki pochodzą z poprzedniego patcha (${publicPatch(state.statsPatch)}), a gra jest już na ${publicPatch(state.patch)}. ` +
                  "Zmiany balansu z nowego patcha nie są jeszcze uwzględnione w winrate i buildach."
                : "Winrate, kontry i buildy pochodzą z rankingowych meczów graczy z tych rang."
          }
        >
          {state.statsPatch ? (
            <>
              {statsOutdated && "⚠ "}Statystyki: <b>{tiers ?? "rankingowe"}</b> · {state.statsMatches} meczów · patch {publicPatch(state.statsPatch)}
              {statsOutdated && " (poprzedni)"}
            </>
          ) : (
            "Statystyki: brak – tryb heurystyczny"
          )}
        </span>
      </div>
    </header>
  );
}
