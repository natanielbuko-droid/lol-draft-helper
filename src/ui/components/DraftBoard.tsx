import { POSITION_LABEL, type DraftSlot, type DraftState } from "../../shared/types";
import { CardHead } from "./ui";

type ChampIndex = Record<number, { name: string; image: string }>;

const PHASE_LABEL: Record<DraftState["phase"], string> = {
  PLANNING: "Planowanie",
  BAN_PICK: "Bany i picki",
  FINALIZATION: "Finalizacja",
  NONE: "",
};

function Slot({ slot, champions, side }: { slot: DraftSlot; champions: ChampIndex; side: "ally" | "enemy" }) {
  const champ = slot.championId ? champions[slot.championId] : undefined;
  const state = !champ ? "empty" : slot.locked ? "locked" : "hover";
  return (
    <li className={`slot ${side} ${state} ${slot.isLocalPlayer ? "me" : ""}`}>
      <div className="portrait">{champ ? <img src={champ.image} alt="" /> : <span className="portrait-empty" />}</div>
      <div className="slot-text">
        <div className="slot-name">
          {champ?.name ?? (side === "enemy" ? "Ukryty wybór" : "Brak postaci")}
          {slot.isLocalPlayer && <span className="you">TY</span>}
        </div>
        <div className="slot-meta">
          {slot.position && <span className="pos">{POSITION_LABEL[slot.position]}</span>}
          {state === "hover" && <span className="picking">wybiera…</span>}
        </div>
      </div>
    </li>
  );
}

export function DraftBoard({ draft, champions }: { draft: DraftState; champions: ChampIndex }) {
  return (
    <section className="card">
      <CardHead title="Draft" sub={PHASE_LABEL[draft.phase]} />
      <div className="teams">
        <div>
          <div className="team-title ally">Twoja drużyna</div>
          <ul className="team">
            {draft.myTeam.map((s) => (
              <Slot key={s.cellId} slot={s} champions={champions} side="ally" />
            ))}
          </ul>
        </div>
        <div>
          <div className="team-title enemy">Przeciwnicy</div>
          <ul className="team">
            {draft.enemyTeam.map((s) => (
              <Slot key={s.cellId} slot={s} champions={champions} side="enemy" />
            ))}
          </ul>
        </div>
      </div>
      {draft.bans.length > 0 && (
        <div className="bans">
          <span className="label">Bany</span>
          {draft.bans.map(
            (id) =>
              champions[id] && (
                <span className="ban" key={id} title={champions[id].name}>
                  <img src={champions[id].image} alt="" />
                </span>
              ),
          )}
        </div>
      )}
    </section>
  );
}
