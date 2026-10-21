import { useState } from "react";
import { POSITION_LABEL, type BuildRecommendation, type ItemRef } from "../../shared/types";

function Item({ item }: { item: ItemRef }) {
  return (
    <figure className="item" title={`${item.name} (${item.gold} g)`}>
      <img src={item.image} alt="" />
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

export function BuildPanel({ build }: { build: BuildRecommendation }) {
  const [msg, setMsg] = useState<string | null>(null);

  const applyRunes = async () => {
    const res = await fetch("/api/runes/apply", { method: "POST" });
    setMsg(((await res.json()) as { message: string }).message);
  };

  return (
    <div className="card">
      <h3>
        Build: {build.championName} <small className="muted">({POSITION_LABEL[build.position]} · źródło: {build.source === "stats" ? "statystyki" : "heurystyka"})</small>
      </h3>

      <h4>Core</h4>
      <div className="items">
        {build.core.map((i) => (
          <Item key={i.id} item={i} />
        ))}
        {build.boots && <Item item={build.boots} />}
      </div>

      <h4>Sytuacyjne (pod skład wroga)</h4>
      {build.situational.length === 0 ? (
        <p className="muted">Brak szczególnych zagrożeń – trzymaj się core buildu.</p>
      ) : (
        <ul className="situational">
          {build.situational.map((i) => (
            <li key={i.id}>
              <Item item={i} />
              <div>
                <span className={`tag ${i.rule}`}>{i.rule}</span>
                <p>{i.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <div>
          <h4>Czary</h4>
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
        {build.runes && (
          <div>
            <h4>Runy</h4>
            <div className="rune">
              <img src={build.runes.keystoneImage} alt="" />
              <div>
                <b>{build.runes.keystone}</b>
                <div className="muted">
                  {build.runes.primaryTree} + {build.runes.secondaryTree}
                </div>
              </div>
            </div>
            {build.runes.perkIds.length === 9 && (
              <button onClick={applyRunes}>Zapisz runy w kliencie</button>
            )}
            {msg && <small className="muted">{msg}</small>}
          </div>
        )}
        <div>
          <h4>Umiejętności</h4>
          <b>{build.skillOrder.order}</b>
        </div>
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
