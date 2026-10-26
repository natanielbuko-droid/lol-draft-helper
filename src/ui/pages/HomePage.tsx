import { useMemo, useState } from "react";
import { POSITION_LABEL, POSITIONS, type AppState, type ChampionListEntry, type TierEntry, type Position } from "../../shared/types";
import { ChampLink, TierBadge } from "../components/browse";
import { CardHead } from "../components/ui";
import { href, navigate } from "../router";
import { useApi } from "../useApi";

/** Co potrafi aplikacja – karty na ekranie startowym. `to` = strona dostępna od razu, bez champ selectu. */
const FEATURES: { icon: string; title: string; text: string; when: string; to?: string }[] = [
  {
    icon: "⚔",
    title: "Draft na żywo",
    text: "Ranking wszystkich postaci na Twoją pozycję: siła na patchu, kontry na wybranych wrogów, synergia z drużyną i braki w składzie.",
    when: "w champ selekcie",
  },
  {
    icon: "◆",
    title: "3 scenariusze",
    text: "Postać pasująca idealnie, neutralnie i koszmarnie do tego draftu – z konkretnym powodem i liczbami.",
    when: "w champ selekcie",
  },
  {
    icon: "⛨",
    title: "Build pod wroga",
    text: "Core, przedmioty sytuacyjne pod skład przeciwnika, runy, czary i kolejność umiejętności – plus inne warianty graczy.",
    when: "po wybraniu postaci",
  },
  {
    icon: "⇩",
    title: "Automatyczny import",
    text: "Po zablokowaniu postaci runy, czary i zestaw przedmiotów w sklepie ustawiają się same.",
    when: "po zablokowaniu postaci",
  },
  {
    icon: "★",
    title: "Twoja pula postaci",
    text: "Maestria i ostatnie mecze z klienta – postacie, którymi grasz, dostają premię i znacznik „Twoja”.",
    when: "w champ selekcie",
  },
  {
    icon: "✦",
    title: "Plan dżungli",
    text: "Pierwszy clear zależny od strony mapy i linie warte ganku na podstawie draftu.",
    when: "gdy grasz w dżungli",
  },
  {
    icon: "▤",
    title: "Tier lista",
    text: "Najmocniejsze postacie na każdej pozycji na tym patchu – od S do D, z winrate i popularnością.",
    when: "dostępne teraz",
    to: href.tier("TOP"),
  },
  {
    icon: "☰",
    title: "Postacie i buildy",
    text: "Strona każdej postaci: build, runy, łatwe i trudne matchupy, najlepsze synergie, mocne i słabe strony.",
    when: "dostępne teraz",
    to: href.champions(),
  },
  {
    icon: "⌕",
    title: "Wyszukiwarka graczy",
    text: "Ranga, ostatnie mecze z KDA i przedmiotami, najczęściej grane postacie i maestria – po Riot ID.",
    when: "dostępne teraz",
    to: href.players(),
  },
  {
    icon: "⬡",
    title: "Składy drużyn",
    text: "Archetypy: engage, poke, ochrona carry, dive i split push – jak grać, co je kontruje i kim je złożyć.",
    when: "dostępne teraz",
    to: href.comps(),
  },
];

function Search({ version }: { version: string }) {
  const { data } = useApi<ChampionListEntry[]>("/api/champions", version);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t && data ? data.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [q, data]);
  return (
    <div className="search">
      <input
        type="search"
        placeholder="Szukaj postaci – np. Jinx, Lee Sin…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) navigate(href.champion(results[0].championId, results[0].positions[0]));
        }}
        aria-label="Szukaj postaci"
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((c) => (
            <li key={c.championId}>
              <ChampLink id={c.championId} name={c.name} image={c.image} position={c.positions[0]} sub={c.positions.map((p) => POSITION_LABEL[p]).join(" · ")} />
              <TierBadge tier={c.tier} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopNow({ version }: { version: string }) {
  const { data } = useApi<Record<Position, TierEntry[]>>("/api/tierlist", version);
  if (!data || POSITIONS.every((p) => !data[p].length)) return null;
  return (
    <section className="card">
      <CardHead
        title="Najmocniejsze teraz"
        sub="Top 3 na każdej pozycji według tier listy"
        right={
          <a className="link-btn" href={href.tier("TOP")}>
            Pełna tier lista →
          </a>
        }
      />
      <div className="top-now">
        {POSITIONS.map((p) => (
          <div key={p} className="top-col">
            <a className="top-pos" href={href.tier(p)}>
              {POSITION_LABEL[p]}
            </a>
            {data[p].slice(0, 3).map((t) => (
              <div key={t.championId} className="top-row">
                <ChampLink id={t.championId} name={t.name} image={t.image} position={p} sub={`WR ${(t.winrate * 100).toFixed(1).replace(".", ",")}%`} />
                <TierBadge tier={t.tier} size="sm" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const WAITING: Record<AppState["connection"], string> = {
  connected: "Klient LoL jest połączony. Wejdź do kolejki – w champ selekcie rekomendacje pojawią się same.",
  connecting: "Szukam klienta League of Legends…",
  disconnected: "Włącz klienta League of Legends – aplikacja połączy się sama. W międzyczasie możesz przeglądać postacie i tier listę.",
  mock: "Tryb demo – symulowany champ select za chwilę się zacznie.",
};

/** Ekran startowy poza champ selectem: status, wyszukiwarka, możliwości aplikacji i najmocniejsze postacie. */
export function HomePage({ state }: { state: AppState }) {
  const version = `${state.patch}|${state.statsMatches}`;
  return (
    <main className="home">
      <section className="hero card">
        <div className="hero-text">
          <span className={`hero-status ${state.connection}`}>
            <i className="dot" /> Czekam na champ select
          </span>
          <h1>Wybierz lepszą postać, zanim zacznie się gra</h1>
          <p className="muted">{WAITING[state.connection]}</p>
        </div>
        <Search version={version} />
      </section>

      <section>
        <h2 className="section-title">Co potrafi aplikacja</h2>
        <div className="features">
          {FEATURES.map((f) => {
            const body = (
              <>
                <span className="feature-icon" aria-hidden>
                  {f.icon}
                </span>
                <b>{f.title}</b>
                <p>{f.text}</p>
                <span className={`feature-when ${f.to ? "now" : ""}`}>{f.to ? "Otwórz →" : f.when}</span>
              </>
            );
            return f.to ? (
              <a key={f.title} className="feature open" href={f.to}>
                {body}
              </a>
            ) : (
              <div key={f.title} className="feature">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <TopNow version={version} />
    </main>
  );
}
