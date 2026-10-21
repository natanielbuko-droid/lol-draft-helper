import { useState } from "react";
import { POSITION_LABEL, type BuildRecommendation, type ItemRef, type RuneRef } from "../../shared/types";

function Item({ item, step }: { item: ItemRef; step?: number }) {
  return (
    <figure className="item" title={`${item.name} (${item.gold} złota)`}>
      {step !== undefined && <span className="step">{step}</span>}
      <img src={item.image} alt="" />
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

function Rune({ rune, big = false }: { rune: RuneRef; big?: boolean }) {
  return (
    <div className={`rune-slot ${big ? "big" : ""}`} title={rune.name}>
      <img src={rune.image} alt="" />
      <span>{rune.name}</span>
    </div>
  );
}

const SKILL_HINT = "Na każdym poziomie postaci rozwijasz jedną umiejętność. R (ult) – na poziomach 6, 11 i 16.";

export function BuildPanel({ build }: { build: BuildRecommendation }) {
  const [msg, setMsg] = useState<string | null>(null);
  const { runes, skillOrder } = build;

  const applyRunes = async () => {
    const res = await fetch("/api/runes/apply", { method: "POST" });
    setMsg(((await res.json()) as { message: string }).message);
  };

  // Pełny build w kolejności zakupu: core (3) -> buty -> kolejne przedmioty.
  const fullBuild = [...build.core, ...(build.boots ? [build.boots] : []), ...build.late];

  return (
    <div className="card">
      <h3>
        Build: {build.championName}{" "}
        <small className="muted">
          ({POSITION_LABEL[build.position]} · {build.source === "stats" ? "na podstawie meczów graczy" : "dobrany automatycznie – mało danych"})
        </small>
      </h3>

      {build.starters.length > 0 && (
        <>
          <h4>Na start</h4>
          <div className="items">
            {build.starters.map((i, n) => (
              <Item key={`${i.id}-${n}`} item={i} />
            ))}
          </div>
        </>
      )}

      <h4>Pełny build (kupuj w tej kolejności)</h4>
      <div className="items">
        {fullBuild.map((i, n) => (
          <Item key={i.id} item={i} step={n + 1} />
        ))}
      </div>

      <h4>Sytuacyjne – zamień, gdy pasuje do wroga</h4>
      {build.situational.length === 0 ? (
        <p className="muted">Brak szczególnych zagrożeń – trzymaj się powyższego buildu.</p>
      ) : (
        <ul className="situational">
          {build.situational.map((i) => (
            <li key={i.id}>
              <Item item={i} />
              <p>{i.reason}</p>
            </li>
          ))}
        </ul>
      )}

      {runes && (
        <>
          <h4>
            Runy{" "}
            <small className="muted">({runes.source === "stats" ? "najczęściej wygrywająca strona" : "dobrane automatycznie"})</small>
          </h4>
          <div className="runes">
            <div className="rune-tree">
              <div className="tree-name">
                <img src={runes.primaryTree.image} alt="" /> {runes.primaryTree.name}
              </div>
              {runes.primary.map((r, n) => (
                <Rune key={r.id} rune={r} big={n === 0} />
              ))}
            </div>
            <div className="rune-tree">
              <div className="tree-name">
                <img src={runes.secondaryTree.image} alt="" /> {runes.secondaryTree.name}
              </div>
              {runes.secondary.map((r) => (
                <Rune key={r.id} rune={r} />
              ))}
              <div className="tree-name shards-title">Odłamki</div>
              {runes.shards.map((r, n) => (
                <Rune key={`${r.id}-${n}`} rune={r} />
              ))}
            </div>
          </div>
          <button onClick={applyRunes}>Zapisz runy w kliencie LoL</button>
          {msg && <small className="muted"> {msg}</small>}
        </>
      )}

      <div className="row">
        <div>
          <h4>Czary przywoływacza</h4>
          <div className="items">
            {build.summonerSpells.map((s) => (
              <figure className="item" key={s.id} title={s.name}>
                <img src={s.image} alt="" />
                <figcaption>{s.name}</figcaption>
              </figure>
            ))}
          </div>
          <small className="muted">{build.summonerReason}</small>
        </div>
      </div>

      <h4 title={SKILL_HINT}>
        Umiejętności: maksuj {skillOrder.max.join(" → ")}{" "}
        <small className="muted">({skillOrder.source === "stats" ? "ze statystyk" : "ogólna reguła"})</small>
      </h4>
      <div className="skills" title={SKILL_HINT}>
        {(["Q", "W", "E", "R"] as const).map((s) => (
          <div key={s} className="skill-row">
            <b>{s}</b>
            {skillOrder.levels.map((lvl, n) => (
              <span key={n} className={lvl === s ? `on ${s}` : ""}>
                {lvl === s ? n + 1 : ""}
              </span>
            ))}
          </div>
        ))}
      </div>

      {build.notes.length > 0 && (
        <ul className="notes">
          {build.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
