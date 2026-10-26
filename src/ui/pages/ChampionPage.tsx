import { POSITION_LABEL, type ChampionDetail, type MatchupEntry, type Position } from "../../shared/types";
import { BuildPanel } from "../components/BuildPanel";
import { ChampLink, ROLE_NAME, TierBadge } from "../components/browse";
import { CardHead, pct, plural } from "../components/ui";
import { href } from "../router";
import { useApi } from "../useApi";

const DAMAGE: Record<ChampionDetail["damageType"], string> = { physical: "obrażenia fizyczne", magic: "obrażenia magiczne", mixed: "obrażenia mieszane" };
const RATINGS: { key: keyof ChampionDetail["ratings"]; label: string }[] = [
  { key: "damage", label: "Obrażenia" },
  { key: "durability", label: "Wytrzymałość" },
  { key: "crowdControl", label: "Kontrola (CC)" },
  { key: "mobility", label: "Mobilność" },
  { key: "utility", label: "Wsparcie" },
];

function MatchupList({ title, hint, items, tone, position }: { title: string; hint: string; items: MatchupEntry[]; tone: "pos" | "neg"; position?: Position }) {
  return (
    <div className="matchups">
      <h3 className={`${tone}-text`}>{title}</h3>
      <p className="muted small">{hint}</p>
      {items.length ? (
        <ul>
          {items.map((m) => (
            <li key={m.championId}>
              <ChampLink id={m.championId} name={m.name} image={m.image} position={position} sub={plural(m.games, "mecz", "mecze", "meczów")} />
              <b className={m.winrate >= 0.5 ? "pos-text" : "neg-text"}>{pct(m.winrate)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Za mało wspólnych meczów w statystykach.</p>
      )}
    </div>
  );
}

export function ChampionPage({ id, position, version }: { id: number; position: Position | null; version: string }) {
  const url = `/api/champion/${id}${position ? `?position=${position}` : ""}`;
  const { data: d, error } = useApi<ChampionDetail>(url, version);

  if (error) return <main className="browse"><div className="card">{error} <a href={href.champions()}>Wróć do listy postaci</a></div></main>;
  if (!d) return <main className="browse"><div className="card muted">Ładowanie…</div></main>;

  const lanePos = d.position;
  return (
    <main className="browse">
      <a className="back" href={href.champions()}>
        ← Wszystkie postacie
      </a>
      <section className="card champ-hero">
        <img className="hero-portrait" src={d.image} alt="" />
        <div className="hero-main">
          <div className="hero-title">
            <h1>{d.name}</h1>
            <TierBadge tier={d.tier} size="lg" />
          </div>
          <div className="muted">
            {d.roles.map((r) => ROLE_NAME[r] ?? r).join(" · ")} · {DAMAGE[d.damageType]} · {d.attackType === "melee" ? "walczy wręcz" : "walczy z dystansu"}
          </div>
          <div className="tabs pos-tabs small-tabs">
            {d.positions.map((p) => (
              <a key={p.position} className={`tab-link ${p.position === d.position ? "active" : ""}`} href={href.champion(d.championId, p.position)}>
                {POSITION_LABEL[p.position]}
                {p.share > 0 && <span className="count">{Math.round(p.share * 100)}%</span>}
              </a>
            ))}
          </div>
        </div>
        <div className="hero-stats">
          {d.rank && (
            <div>
              <span className="muted small">Miejsce ({POSITION_LABEL[d.position]})</span>
              <b>
                #{d.rank} <span className="muted">z {d.ofCount}</span>
              </b>
            </div>
          )}
          <div>
            <span className="muted small">Winrate</span>
            <b className={d.winrate !== null && d.winrate >= 0.5 ? "pos-text" : "neg-text"}>{d.winrate !== null ? pct(d.winrate) : "–"}</b>
          </div>
          <div>
            <span className="muted small">Popularność</span>
            <b>{d.pickRate !== null ? pct(d.pickRate) : "–"}</b>
          </div>
          <div>
            <span className="muted small">Mecze</span>
            <b>{d.games}</b>
          </div>
        </div>
      </section>

      <div className="grid champ-grid-layout">
        <div className="col">
          <section className="card">
            <CardHead title="Mocne i słabe strony" sub="Z umiejętności i ocen postaci w kliencie LoL" />
            <div className="ratings">
              {RATINGS.map((r) => (
                <div key={r.key} className="rating" title={`${r.label}: ${d.ratings[r.key]}/3`}>
                  <span>{r.label}</span>
                  <span className="pips">
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={n <= d.ratings[r.key] ? "on" : ""} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <ul className="reasons">
              {d.strengths.map((s) => (
                <li key={s} className="plus">
                  <span className="tone">✓</span>
                  {s}
                </li>
              ))}
              {d.weaknesses.map((s) => (
                <li key={s} className="minus">
                  <span className="tone">✕</span>
                  {s}
                </li>
              ))}
            </ul>
            {d.archetypes.length > 0 && (
              <div className="arch-chips">
                <span className="muted small">Pasuje do składów:</span>
                {d.archetypes.map((a) => (
                  <a key={a.id} className="chip link-chip" href={`${href.comps()}#${a.id}`}>
                    {a.name}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <CardHead title={`Matchupy na linii (${POSITION_LABEL[lanePos]})`} sub="Winrate przeciw rywalowi z tej samej linii" />
            <div className="matchup-cols">
              <MatchupList title="Łatwe" hint="wygrywa częściej niż zwykle" items={d.goodAgainst} tone="pos" />
              <MatchupList title="Trudne" hint="wygrywa rzadziej niż zwykle" items={d.badAgainst} tone="neg" />
            </div>
          </section>

          <section className="card">
            <CardHead title="Najlepsze synergie" sub="Sojusznicy, z którymi ta postać wygrywa częściej niż zwykle" />
            <MatchupList title="" hint="" items={d.synergies} tone="pos" />
          </section>
        </div>
        <div className="col">
          <BuildPanel build={d.build} champion={{ name: d.name, image: d.image }} readOnly />
        </div>
      </div>
    </main>
  );
}
