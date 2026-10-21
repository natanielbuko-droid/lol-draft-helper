import type { TeamAnalysis } from "../../shared/types";
import { CardHead } from "./ui";

function Team({ title, side, t }: { title: string; side: "ally" | "enemy"; t: TeamAnalysis }) {
  const ad = Math.round(t.physicalShare * 100);
  const tiles = [
    { label: "Twarde CC", value: t.hardCC, hint: t.who.cc.join(", ") },
    { label: "Leczenie", value: t.healing, hint: t.who.healers.join(", ") },
    { label: "Tanki", value: t.frontline, hint: t.who.tanks.join(", ") },
    { label: "Zabójcy", value: t.assassins, hint: t.who.assassins.join(", ") },
  ];
  return (
    <div className="team-analysis">
      <div className={`team-title ${side}`}>{title}</div>
      <div className="dmg-bar" title="Rozkład obrażeń: fizyczne (AD) / magiczne (AP)">
        <div className="ad" style={{ width: `${ad}%` }} />
        <div className="ap" style={{ width: `${100 - ad}%` }} />
      </div>
      <div className="dmg-legend">
        <span className="ad-label">AD {ad}%</span>
        <span className="ap-label">AP {100 - ad}%</span>
      </div>
      <div className="tiles">
        {tiles.map((x) => (
          <div className="tile" key={x.label} title={x.hint || "brak"}>
            <b>{x.value}</b>
            <span>{x.label}</span>
          </div>
        ))}
      </div>
      <ul className="notes">
        {t.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function TeamPanel({ ally, enemy }: { ally: TeamAnalysis | null; enemy: TeamAnalysis | null }) {
  if (!ally || !enemy || (!ally.champions.length && !enemy.champions.length)) return null;
  return (
    <section className="card">
      <CardHead title="Analiza składów" sub="Najedź na kafelek, żeby zobaczyć, kto za to odpowiada" />
      <div className="teams-analysis">
        {ally.champions.length > 0 && <Team title="Twoja drużyna" side="ally" t={ally} />}
        {enemy.champions.length > 0 && <Team title="Przeciwnicy" side="enemy" t={enemy} />}
      </div>
    </section>
  );
}
