import type { PickScenario } from "../../shared/types";
import { CardHead, ScoreRing } from "./ui";

const KIND: Record<PickScenario["kind"], { title: string; hint: string; icon: string }> = {
  ideal: { title: "Idealnie", hint: "Najlepiej oceniona postać w tym drafcie", icon: "▲" },
  neutral: { title: "Neutralnie", hint: "Ani nie pomaga, ani nie szkodzi", icon: "■" },
  nightmare: { title: "Koszmarnie", hint: "Najgorszy wybór spośród postaci granych na tej pozycji", icon: "▼" },
};

/** Szybki podgląd: trzy postacie pasujące do draftu idealnie, neutralnie i koszmarnie – z wyjaśnieniem. */
export function ScenarioCards({ scenarios }: { scenarios: PickScenario[] }) {
  if (scenarios.length < 3) return null;
  return (
    <section className="card">
      <CardHead title="3 scenariusze" sub="Jak różne wybory pasują do tego draftu" />
      <div className="scenarios">
        {scenarios.map((s) => (
          <article key={s.kind} className={`scenario ${s.kind}`} title={KIND[s.kind].hint}>
            <div className="scenario-kind">
              <span>{KIND[s.kind].icon}</span> {KIND[s.kind].title}
            </div>
            <div className="scenario-champ">
              <div className="portrait">
                <img src={s.pick.image} alt="" />
              </div>
              <div className="scenario-name">{s.pick.name}</div>
              <ScoreRing value={s.pick.score.total} size={44} />
            </div>
            <ul>
              {s.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
