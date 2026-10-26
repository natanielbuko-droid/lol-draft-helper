import { useEffect, useMemo, useState } from "react";
import {
  POSITION_LABEL,
  type PlayerChampionStat,
  type PlayerMatch,
  type PlayerProfile,
  type PlayerRank,
  type PlayerSearchMode,
} from "../../shared/types";
import { ChampLink } from "../components/browse";
import { CardHead, pct, plural } from "../components/ui";
import { href, navigate } from "../router";

/** Serwery do wyboru w wyszukiwarce (kod Riot -> nazwa znana graczom). */
const SERVERS: [string, string][] = [
  ["eun1", "EUNE"],
  ["euw1", "EUW"],
  ["na1", "NA"],
  ["kr", "KR"],
  ["tr1", "TR"],
  ["br1", "BR"],
  ["jp1", "JP"],
  ["la1", "LAN"],
  ["la2", "LAS"],
  ["oc1", "OCE"],
  ["me1", "ME"],
];
const serverName = (code: string) => SERVERS.find(([c]) => c === code)?.[1] ?? code.toUpperCase();

const TIER_PL: Record<string, string> = {
  IRON: "Żelazo",
  BRONZE: "Brąz",
  SILVER: "Srebro",
  GOLD: "Złoto",
  PLATINUM: "Platyna",
  EMERALD: "Szmaragd",
  DIAMOND: "Diament",
  MASTER: "Master",
  GRANDMASTER: "Grandmaster",
  CHALLENGER: "Challenger",
};

// Ostatnie wyszukiwania – tylko wygoda w tej przeglądarce/oknie, więc localStorage.
const RECENT_KEY = "draftHelper.recentPlayers";
type Recent = { riotId: string; platform: string };
function loadRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}
function saveRecent(entry: Recent) {
  try {
    const list = [entry, ...loadRecent().filter((r) => r.riotId.toLowerCase() !== entry.riotId.toLowerCase() || r.platform !== entry.platform)];
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* prywatne okno / zablokowany zapis – bez historii */
  }
}

function SearchForm({ initial, platform: initialPlatform }: { initial?: string; platform: string }) {
  const [riotId, setRiotId] = useState(initial ?? "");
  const [platform, setPlatform] = useState(initialPlatform);
  useEffect(() => setRiotId(initial ?? ""), [initial]);
  useEffect(() => setPlatform(initialPlatform), [initialPlatform]);
  return (
    <form
      className="player-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (riotId.trim()) navigate(href.player(platform, riotId.trim()));
      }}
    >
      <input
        type="search"
        placeholder="Riot ID, np. Nick#EUNE"
        value={riotId}
        onChange={(e) => setRiotId(e.target.value)}
        aria-label="Riot ID gracza"
      />
      <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Serwer">
        {SERVERS.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <button type="submit">Szukaj</button>
    </form>
  );
}

function OffNotice() {
  return (
    <section className="card">
      <CardHead title="Wyszukiwarka graczy – wkrótce" />
      <p className="muted">
        Profile graczy (ranga, ostatnie mecze, najczęściej grane postacie) pochodzą z oficjalnego API Riot Games i wymagają klucza, którego nie wolno
        dołączać do aplikacji. Czekamy na zatwierdzenie klucza produkcyjnego przez Riot – wtedy wyszukiwarka zacznie działać u wszystkich, bez
        żadnych ustawień.
      </p>
      <p className="muted small">
        Wersja z kodu źródłowego: wpisz własny klucz deweloperski do pliku <code>.env</code> (<code>RIOT_API_KEY=…</code>) – wyszukiwarka włączy się
        od razu.
      </p>
    </section>
  );
}

/** Ekran wyszukiwarki: formularz + ostatnie wyszukiwania. */
export function PlayersPage({ mode, defaultPlatform }: { mode: PlayerSearchMode; defaultPlatform: string }) {
  const recent = useMemo(loadRecent, []);
  if (mode === "off") return <main className="browse"><OffNotice /></main>;
  return (
    <main className="browse">
      <section className="card">
        <CardHead title="Wyszukiwarka graczy" sub="Ranga, ostatnie mecze i najczęściej grane postacie – po Riot ID (nick#tag)." />
        <SearchForm platform={defaultPlatform} />
        {recent.length > 0 && (
          <div className="recent">
            <span className="muted small">Ostatnio szukani:</span>
            {recent.map((r) => (
              <a key={`${r.platform}:${r.riotId}`} className="chip link-chip" href={href.player(r.platform, r.riotId)}>
                {r.riotId} <span className="muted">{serverName(r.platform)}</span>
              </a>
            ))}
          </div>
        )}
        <p className="muted small">
          Wpisz Riot ID razem z tagiem (część po „#”). Sam nick też zadziała, jeśli gracz ma domyślny tag serwera (np. #EUNE).
        </p>
      </section>
    </main>
  );
}

function Rank({ rank, label }: { rank?: PlayerRank; label: string }) {
  if (!rank)
    return (
      <div className="rank-card unranked">
        <span className="muted small">{label}</span>
        <b>Bez rangi</b>
      </div>
    );
  const games = rank.wins + rank.losses;
  return (
    <div className={`rank-card tier-${rank.tier.toLowerCase()}`}>
      <span className="muted small">{label}</span>
      <b>
        {TIER_PL[rank.tier] ?? rank.tier} {rank.division}
      </b>
      <span>
        {rank.lp} LP · {rank.wins}W {rank.losses}P
      </span>
      <span className={rank.wins / games >= 0.5 ? "pos-text" : "neg-text"}>{pct(rank.wins / games)} wygranych</span>
    </div>
  );
}

const kda = (k: number, d: number, a: number) => (d === 0 ? "∞" : ((k + a) / d).toFixed(2).replace(".", ","));
const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function ago(ts: number): string {
  const h = (Date.now() - ts) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min temu`;
  if (h < 24) return `${Math.round(h)} godz. temu`;
  const d = Math.round(h / 24);
  return d === 1 ? "wczoraj" : `${d} dni temu`;
}

function MatchRow({ m }: { m: PlayerMatch }) {
  const cls = m.remake ? "remake" : m.win ? "win" : "loss";
  return (
    <li className={`match ${cls}`}>
      <div className="match-meta">
        <b>{m.remake ? "Remake" : m.win ? "Wygrana" : "Przegrana"}</b>
        <span className="muted small">{m.queue}</span>
        <span className="muted small">
          {minutes(m.durationSec)} · {ago(m.endedAt)}
        </span>
      </div>
      <ChampLink id={m.championId} name={m.championName} image={m.championImage} position={m.position} sub={m.position ? POSITION_LABEL[m.position] : undefined} />
      <div className="match-kda">
        <b>
          {m.kills} / <span className="neg-text">{m.deaths}</span> / {m.assists}
        </b>
        <span className="muted small">KDA {kda(m.kills, m.deaths, m.assists)}</span>
      </div>
      <div className="match-cs">
        <b>{m.cs} CS</b>
        <span className="muted small">{m.durationSec ? ((m.cs / m.durationSec) * 60).toFixed(1).replace(".", ",") : "0"}/min</span>
      </div>
      <div className="match-items">
        {m.items.map((it, i) => (
          <img key={`${it.id}-${i}`} src={it.image} alt="" title={it.name} />
        ))}
      </div>
    </li>
  );
}

/** Statystyki postaci z wczytanych meczów (bez remake'ów). */
function championStats(matches: PlayerMatch[]): PlayerChampionStat[] {
  const map = new Map<number, PlayerChampionStat>();
  for (const m of matches) {
    if (m.remake) continue;
    let s = map.get(m.championId);
    if (!s) map.set(m.championId, (s = { championId: m.championId, name: m.championName, image: m.championImage, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }));
    s.games++;
    if (m.win) s.wins++;
    s.kills += m.kills;
    s.deaths += m.deaths;
    s.assists += m.assists;
  }
  return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

/** Profil konta: ranga, maestria, postacie z ostatnich gier i lista meczów. */
export function PlayerPage({ platform, riotId, mode }: { platform: string; riotId: string; mode: PlayerSearchMode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (mode === "off") return;
    let cancelled = false;
    setProfile(null);
    setError(null);
    fetch(`/api/player?riotId=${encodeURIComponent(riotId)}&platform=${platform}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error((body as { message: string }).message);
        return body as PlayerProfile;
      })
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        saveRecent({ riotId: `${p.gameName}#${p.tagLine}`, platform });
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [platform, riotId, mode]);

  const loadMore = async () => {
    if (!profile) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/player/matches?puuid=${profile.puuid}&platform=${platform}&start=${profile.matches.length}`);
      const body = await res.json();
      if (!res.ok) throw new Error((body as { message: string }).message);
      const more = body as { matches: PlayerMatch[]; hasMore: boolean };
      setProfile({ ...profile, matches: [...profile.matches, ...more.matches], hasMore: more.hasMore });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (mode === "off") return <main className="browse"><OffNotice /></main>;

  const champs = profile ? championStats(profile.matches) : [];
  const counted = profile ? profile.matches.filter((m) => !m.remake) : [];
  const wins = counted.filter((m) => m.win).length;
  return (
    <main className="browse">
      <section className="card">
        <SearchForm initial={riotId} platform={platform} />
      </section>
      {error && <div className="card import-error">{error}</div>}
      {!profile && !error && (
        <div className="card muted">
          Szukam {riotId} na {serverName(platform)}… Przy kluczu deweloperskim i działającym crawlerze może to potrwać do minuty.
        </div>
      )}
      {profile && (
        <>
          <section className="card player-hero">
            <img className="player-icon" src={profile.iconUrl} alt="" />
            <div>
              <h1>
                {profile.gameName} <span className="muted">#{profile.tagLine}</span>
              </h1>
              <span className="muted">
                {serverName(profile.platform)} · poziom {profile.level}
              </span>
            </div>
            <div className="ranks">
              <Rank rank={profile.ranks.find((r) => r.queue === "solo")} label="Solo/Duo" />
              <Rank rank={profile.ranks.find((r) => r.queue === "flex")} label="Flex" />
            </div>
          </section>

          <div className="grid player-layout">
            <div className="col">
              <section className="card">
                <CardHead
                  title="Ostatnie gry"
                  sub={counted.length ? `${wins}W ${counted.length - wins}P · ${pct(wins / counted.length)} wygranych w ${plural(counted.length, "grze", "grach", "grach")}` : "Brak gier"}
                />
                <ul className="player-champs">
                  {champs.slice(0, 7).map((c) => (
                    <li key={c.championId}>
                      <ChampLink id={c.championId} name={c.name} image={c.image} sub={plural(c.games, "gra", "gry", "gier")} />
                      <span className={c.wins / c.games >= 0.5 ? "pos-text" : "neg-text"}>{pct(c.wins / c.games)}</span>
                      <span className="muted small">KDA {kda(c.kills, c.deaths, c.assists)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card">
                <CardHead title="Najwyższa maestria" />
                <ul className="player-champs">
                  {profile.mastery.map((m) => (
                    <li key={m.championId}>
                      <ChampLink id={m.championId} name={m.name} image={m.image} sub={`poziom ${m.level}`} />
                      <span>{Math.round(m.points / 1000)} tys. pkt</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <section className="card">
              <CardHead title="Historia meczów" sub="Kliknij postać, żeby zobaczyć jej build i kontry" />
              <ul className="matches">
                {profile.matches.map((m) => (
                  <MatchRow key={m.id} m={m} />
                ))}
              </ul>
              {profile.hasMore && (
                <button className="secondary wide" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Wczytuję…" : "Wczytaj kolejne 10 gier"}
                </button>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
