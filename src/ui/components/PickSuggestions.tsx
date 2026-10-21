import type { PickRecommendation, ScoreBreakdown } from "../../shared/types";

/** Pasek od -1 do 1 (środek = 0). */
function Bar({ label, value }: { label: string; value: number }) {
  const width = Math.abs(value) * 50;
  return (
    <div className="bar" title={`${label}: ${value.toFixed(2)}`}>
      <span>{label}</span>
      <div className="track">
        <div className={`fill ${value >= 0 ? "pos" : "neg"}`} style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
      </div>
    </div>
  );
}

function Breakdown({ s }: { s: ScoreBreakdown }) {
  return (
    <div className="breakdown">
      <Bar label="Meta" value={s.meta} />
      <Bar label="Counter" value={s.counter} />
      <Bar label="Synergia" value={s.synergy} />
      <Bar label="Skład" value={s.composition} />
    </div>
  );
}

export function PickSuggestions({ picks }: { picks: PickRecommendation[] }) {
  return (
    <div className="card">
      <h3>Rekomendowane picki</h3>
      <ol className="picks">
        {picks.map((p) => (
          <li key={p.championId}>
            <img src={p.image} alt="" />
            <div className="pick-body">
              <div className="pick-title">
                <b>{p.name}</b>
                <span className="score">{p.score.total}</span>
                <small className="muted">pewność {Math.round(p.score.confidence * 100)}%</small>
              </div>
              <Breakdown s={p.score} />
              {p.reasons.length > 0 && (
                <ul className="reasons">
                  {p.reasons.slice(0, 4).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
