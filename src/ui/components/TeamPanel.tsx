import type { TeamAnalysis } from "../../shared/types";

function Team({ title, t }: { title: string; t: TeamAnalysis }) {
  return (
    <div className="team-analysis">
      <h4>{title}</h4>
      <div className="dmg" title="Rozkład obrażeń AD/AP">
        <div className="ad" style={{ width: `${t.physicalShare * 100}%` }}>AD {Math.round(t.physicalShare * 100)}%</div>
        <div className="ap" style={{ width: `${t.magicShare * 100}%` }}>AP {Math.round(t.magicShare * 100)}%</div>
      </div>
      <dl>
        <dt>Twarde CC</dt>
        <dd>{t.hardCC}</dd>
        <dt>Leczenie</dt>
        <dd>{t.healing}</dd>
        <dt>Frontline</dt>
        <dd>{t.frontline}</dd>
        <dt>Zabójcy</dt>
        <dd>{t.assassins}</dd>
      </dl>
      <ul className="notes">
        {t.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function TeamPanel({ ally, enemy }: { ally: TeamAnalysis | null; enemy: TeamAnalysis | null }) {
  if (!ally || !enemy) return null;
  return (
    <div className="card teams-analysis">
      {ally.champions.length > 0 && <Team title="Twoja drużyna" t={ally} />}
      {enemy.champions.length > 0 && <Team title="Przeciwnicy" t={enemy} />}
    </div>
  );
}
