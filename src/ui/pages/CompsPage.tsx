import { useEffect } from "react";
import { POSITION_LABEL, POSITIONS, type Archetype } from "../../shared/types";
import { CardHead, pct } from "../components/ui";
import { href } from "../router";
import { useApi } from "../useApi";

/** Archetypy składów: plan gry, mocne i słabe strony, co z czym wygrywa i przykładowe postacie na każdą pozycję. */
export function CompsPage({ version }: { version: string }) {
  const { data, error } = useApi<Archetype[]>("/api/archetypes", version);
  const name = (id: string) => data?.find((a) => a.id === id)?.name ?? id;

  // Link z strony postaci ("#/comps#engage") przewija do wybranego archetypu.
  useEffect(() => {
    const target = location.hash.split("#")[2];
    if (data && target) document.getElementById(`arch-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  return (
    <main className="browse">
      <section className="card">
        <CardHead
          title="Składy drużyn"
          sub="Pięć klasycznych planów gry. Dobry skład ma jeden wyraźny plan – w champ selekcie dobieraj postacie, które go wspierają."
        />
        <div className="arch-triangle">
          <span>Zwykle wygrywa:</span>
          {data?.map((a) => (
            <span key={a.id} className="muted small">
              <b>{a.name}</b> → {a.strongAgainst.map(name).join(", ")}
            </span>
          ))}
        </div>
      </section>
      {error && <p className="import-error">{error}</p>}
      <div className="arch-list">
        {data?.map((a) => (
          <section key={a.id} id={`arch-${a.id}`} className="card arch">
            <CardHead title={a.name} sub={a.tagline} />
            <p>{a.description}</p>
            <div className="arch-win">
              <span>Jak wygrać</span>
              {a.winCondition}
            </div>
            <div className="arch-cols">
              <ul className="reasons">
                {a.strengths.map((s) => (
                  <li key={s} className="plus">
                    <span className="tone">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
              <ul className="reasons">
                {a.weaknesses.map((s) => (
                  <li key={s} className="minus">
                    <span className="tone">✕</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="arch-vs">
              <span className="chip">
                Mocny przeciw: <b>{a.strongAgainst.map(name).join(", ")}</b>
              </span>
              <span className="chip">
                Słaby przeciw: <b>{a.weakAgainst.map(name).join(", ")}</b>
              </span>
            </div>
            <div className="arch-examples">
              {POSITIONS.filter((p) => a.examples[p]?.length).map((p) => (
                <div key={p} className="arch-pos">
                  <span className="arch-pos-label">{POSITION_LABEL[p]}</span>
                  <div className="arch-champs">
                    {a.examples[p]!.map((c) => (
                      <a
                        key={c.championId}
                        href={href.champion(c.championId, p)}
                        title={`${c.name}${c.winrate !== null ? ` – winrate ${pct(c.winrate)} w ${c.games} meczach` : ""}`}
                      >
                        <img src={c.image} alt={c.name} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
