import { useState } from "react";
import { POSITION_LABEL, POSITIONS, type Position, type TierEntry } from "../../shared/types";
import { ChampLink, ROLE_NAME, TierBadge, WinrateBar } from "../components/browse";
import { CardHead, pct } from "../components/ui";
import { href } from "../router";
import { useApi } from "../useApi";

type SortKey = "rank" | "winrate" | "pickRate" | "games";

const COLUMNS: { key: SortKey; label: string; hint: string }[] = [
  { key: "rank", label: "Tier", hint: "Siła na patchu: winrate wygładzony liczbą meczów + popularność na tej pozycji" },
  { key: "winrate", label: "Winrate", hint: "Odsetek wygranych na tej pozycji" },
  { key: "pickRate", label: "Popularność", hint: "Jak często postać jest wybierana na tę pozycję" },
  { key: "games", label: "Mecze", hint: "Ile meczów stoi za statystyką" },
];

export function TierListPage({ position, version }: { position: Position; version: string }) {
  const { data, error } = useApi<Record<Position, TierEntry[]>>("/api/tierlist", version);
  const [sort, setSort] = useState<SortKey>("rank");
  const list = [...(data?.[position] ?? [])].sort((a, b) => (sort === "rank" ? a.rank - b.rank : b[sort] - a[sort]));

  return (
    <main className="browse">
      <section className="card">
        <CardHead
          title="Tier lista"
          sub="Najmocniejsze postacie na tym patchu – z rankingowych meczów graczy Master i Grandmaster. Kliknij postać, żeby zobaczyć build i kontry."
        />
        <div className="tabs pos-tabs">
          {POSITIONS.map((p) => (
            <a key={p} className={`tab-link ${p === position ? "active" : ""}`} href={href.tier(p)}>
              {POSITION_LABEL[p]}
              {data && <span className="count">{data[p].length}</span>}
            </a>
          ))}
        </div>
        {error && <p className="import-error">{error}</p>}
        {data && !list.length && <p className="muted">Brak statystyk dla tej pozycji.</p>}
        {list.length > 0 && (
          <div className="table-wrap">
            <table className="tier-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Postać</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} title={c.hint} className={sort === c.key ? "sorted" : ""} onClick={() => setSort(c.key)}>
                      {c.label}
                      {sort === c.key && " ▾"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.championId} className={`tier-row t-${t.tier}`}>
                    <td className="num muted">{t.rank}</td>
                    <td>
                      <ChampLink id={t.championId} name={t.name} image={t.image} position={position} sub={t.roles.map((r) => ROLE_NAME[r] ?? r).join(" · ")} />
                    </td>
                    <td>
                      <TierBadge tier={t.tier} />
                    </td>
                    <td className="wr-cell">
                      <b className={t.winrate >= 0.5 ? "pos-text" : "neg-text"}>{pct(t.winrate)}</b>
                      <WinrateBar value={t.winrate} />
                    </td>
                    <td>{pct(t.pickRate)}</td>
                    <td className="muted">{t.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
