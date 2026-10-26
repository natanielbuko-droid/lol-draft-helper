import { useState } from "react";
import { POSITION_LABEL, POSITIONS, type ChampionListEntry, type Position } from "../../shared/types";
import { TierBadge } from "../components/browse";
import { CardHead } from "../components/ui";
import { href } from "../router";
import { useApi } from "../useApi";

export function ChampionsPage({ version }: { version: string }) {
  const { data, error } = useApi<ChampionListEntry[]>("/api/champions", version);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | null>(null);
  const query = q.trim().toLowerCase();
  const list = (data ?? []).filter((c) => (!query || c.name.toLowerCase().includes(query)) && (!pos || c.positions.includes(pos)));

  return (
    <main className="browse">
      <section className="card">
        <CardHead title="Postacie" sub="Wybierz postać, żeby zobaczyć build, runy, matchupy i synergie." />
        <div className="filters">
          <input type="search" placeholder="Szukaj postaci…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj postaci" autoFocus />
          <div className="chip-filter">
            <button className={!pos ? "active" : ""} onClick={() => setPos(null)}>
              Wszystkie
            </button>
            {POSITIONS.map((p) => (
              <button key={p} className={pos === p ? "active" : ""} onClick={() => setPos(pos === p ? null : p)}>
                {POSITION_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="import-error">{error}</p>}
        <div className="champ-grid">
          {list.map((c) => (
            <a key={c.championId} className="champ-tile" href={href.champion(c.championId, pos ?? c.positions[0])} title={c.name}>
              <span className="tile-img">
                <img src={c.image} alt="" loading="lazy" />
                <TierBadge tier={c.tier} size="sm" />
              </span>
              <b>{c.name}</b>
              <span className="muted small">{c.positions.map((p) => POSITION_LABEL[p]).join(" · ")}</span>
            </a>
          ))}
        </div>
        {data && !list.length && <p className="muted">Nic nie pasuje do wyszukiwania.</p>}
      </section>
    </main>
  );
}
