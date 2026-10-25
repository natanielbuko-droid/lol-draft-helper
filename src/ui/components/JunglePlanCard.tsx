import { Fragment } from "react";
import type { GankTarget, JunglePlan, Reason } from "../../shared/types";
import { CardHead } from "./ui";

const LANE_LABEL: Record<GankTarget["lane"], string> = { TOP: "Top", MIDDLE: "Mid", BOTTOM: "Bot" };
const VERDICT: Record<GankTarget["verdict"], string> = { best: "Najlepszy cel", good: "Dobry cel", weak: "Słaby cel" };
const TONE_ICON: Record<Reason["tone"], string> = { plus: "✓", minus: "✕", info: "i" };

/** Pierwszy clear i ranking linii do ganku – tylko gdy gracz gra w dżungli. */
export function JunglePlanCard({ plan }: { plan: JunglePlan }) {
  return (
    <section className="card jungle">
      <CardHead
        title="Plan dżungli"
        sub={`${plan.champion}${plan.side ? ` · ${plan.side === "blue" ? "niebieska" : "czerwona"} strona mapy` : ""}`}
        right={<span className={`style-badge ${plan.style}`}>{plan.style === "gank" ? "Wczesne ganki" : "Pełny clear"}</span>}
      />

      <div className="clear">
        <div className="section-title">
          <h3>Pierwszy clear</h3>
          <span className="muted small">gotowy do akcji {plan.readyAt}</span>
        </div>
        <div className="camp-path">
          {plan.path.map((camp, n) => (
            <Fragment key={`${camp}-${n}`}>
              {n > 0 && <span className="arrow">›</span>}
              <span className={`camp ${/Red/.test(camp) ? "red" : /Blue/.test(camp) ? "blue" : ""}`}>
                <b>{n + 1}</b> {camp}
              </span>
            </Fragment>
          ))}
          <span className="arrow">›</span>
          <span className="camp target">{plan.style === "gank" ? "gank" : "ganki / obiektywy"}: {LANE_LABEL[plan.endsNear]}</span>
        </div>
        <p className="muted small">{plan.styleReason}</p>
      </div>

      <div className="section-title">
        <h3>Gdzie gankować</h3>
      </div>
      <ol className="gank-targets">
        {plan.targets.map((t) => (
          <li key={t.lane} className={t.verdict}>
            <div className="gank-head">
              <span className="lane">{LANE_LABEL[t.lane]}</span>
              <span className={`verdict-tag ${t.verdict}`}>{VERDICT[t.verdict]}</span>
              <span className="matchup muted small">
                {t.allies.join(" + ") || "?"} <span className="vs">vs</span> {t.enemies.join(" + ") || "?"}
              </span>
            </div>
            {t.reasons.length > 0 && (
              <ul className="reasons">
                {t.reasons.slice(0, 4).map((r) => (
                  <li key={r.text} className={r.tone}>
                    <span className="tone">{TONE_ICON[r.tone]}</span>
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {plan.notes.length > 0 && (
        <ul className="notes jungle-notes">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
