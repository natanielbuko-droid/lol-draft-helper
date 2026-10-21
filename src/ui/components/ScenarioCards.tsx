import type { PickScenario } from "../../shared/types";

const KIND: Record<PickScenario["kind"], { title: string; hint: string }> = {
  ideal: { title: "Idealnie", hint: "Najlepiej oceniona postać w tym drafcie" },
  neutral: { title: "Neutralnie", hint: "Ani nie pomaga, ani nie szkodzi" },
  nightmare: { title: "Koszmarnie", hint: "Najgorszy wybór spośród postaci granych na tej pozycji" },
};

/** Szybki podgląd: trzy postacie pasujące do draftu idealnie, neutralnie i koszmarnie – z wyjaśnieniem. */
export function ScenarioCards({ scenarios }: { scenarios: PickScenario[] }) {
  if (scenarios.length < 3) return null;
  return (
    <div className="card">
      <h3>
        3 scenariusze <small className="muted">– jak różne wybory pasują do tego draftu</small>
      </h3>
      <div className="scenarios">
        {scenarios.map((s) => (
          <div key={s.kind} className={`scenario ${s.kind}`} title={KIND[s.kind].hint}>
            <div className="scenario-head">
              <span className="scenario-kind">{KIND[s.kind].title}</span>
              <span className="scenario-score">{s.pick.score.total}/100</span>
            </div>
            <div className="scenario-champ">
              <img src={s.pick.image} alt="" />
              <b>{s.pick.name}</b>
            </div>
            <ul>
              {s.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
