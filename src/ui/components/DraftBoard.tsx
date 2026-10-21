import { POSITION_LABEL, type DraftSlot, type DraftState } from "../../shared/types";

type ChampIndex = Record<number, { name: string; image: string }>;

function Slot({ slot, champions }: { slot: DraftSlot; champions: ChampIndex }) {
  const champ = slot.championId ? champions[slot.championId] : undefined;
  return (
    <li className={`slot ${slot.isLocalPlayer ? "me" : ""} ${slot.locked ? "locked" : "hover"}`}>
      {champ ? <img src={champ.image} alt="" /> : <div className="empty-icon" />}
      <div>
        <div>{champ?.name ?? "—"}</div>
        <small className="muted">
          {slot.position ? POSITION_LABEL[slot.position] : ""}
          {slot.isLocalPlayer ? " · Ty" : ""}
          {champ && !slot.locked ? " · wybiera…" : ""}
        </small>
      </div>
    </li>
  );
}

export function DraftBoard({ draft, champions }: { draft: DraftState; champions: ChampIndex }) {
  return (
    <div className="card">
      <h3>Draft <small className="muted">({draft.phase})</small></h3>
      <div className="teams">
        <ul className="team ally">
          {draft.myTeam.map((s) => (
            <Slot key={s.cellId} slot={s} champions={champions} />
          ))}
        </ul>
        <ul className="team enemy">
          {draft.enemyTeam.map((s) => (
            <Slot key={s.cellId} slot={s} champions={champions} />
          ))}
        </ul>
      </div>
      {draft.bans.length > 0 && (
        <div className="bans">
          <small className="muted">Bany:</small>
          {draft.bans.map((id) => champions[id] && <img key={id} src={champions[id].image} title={champions[id].name} alt="" />)}
        </div>
      )}
    </div>
  );
}
