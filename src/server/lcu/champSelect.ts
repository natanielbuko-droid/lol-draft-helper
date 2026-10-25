import type { DraftPhase, DraftSlot, DraftState, Position } from "../../shared/types";

/** Fragment odpowiedzi GET /lol-champ-select/v1/session, którego potrzebujemy. */
export interface LcuSession {
  localPlayerCellId: number;
  myTeam: LcuPlayer[];
  theirTeam: LcuPlayer[];
  actions: LcuAction[][];
  bans?: { myTeamBans: number[]; theirTeamBans: number[] };
  timer?: { phase: string };
}

export interface LcuPlayer {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  assignedPosition: string; // "top" | "jungle" | "middle" | "bottom" | "utility" | "" (blind pick)
  team?: number; // 1 = niebieska strona, 2 = czerwona
}

export interface LcuAction {
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress: boolean;
  type: string; // "pick" | "ban" | "ten_bans_reveal"
}

const POSITION_MAP: Record<string, Position> = {
  top: "TOP",
  jungle: "JUNGLE",
  middle: "MIDDLE",
  bottom: "BOTTOM",
  utility: "UTILITY",
};

/** Zamienia surową sesję z klienta na prosty, czytelny stan draftu. */
export function parseSession(session: LcuSession, pickableChampionIds: number[] = []): DraftState {
  const actions = session.actions.flat();
  const lockedCells = new Set(actions.filter((a) => a.type === "pick" && a.completed).map((a) => a.actorCellId));

  const toSlot = (p: LcuPlayer, ally: boolean): DraftSlot => {
    // Sojusznikom pokazujemy też "intencję" (hover z fazy planowania); przeciwnikom tylko faktyczny pick.
    const hovered = ally ? p.championId || p.championPickIntent || 0 : p.championId;
    return {
      cellId: p.cellId,
      championId: hovered || null,
      locked: lockedCells.has(p.cellId),
      position: POSITION_MAP[p.assignedPosition] ?? null,
      isLocalPlayer: p.cellId === session.localPlayerCellId,
    };
  };

  const myTeam = session.myTeam.map((p) => toSlot(p, true));
  const enemyTeam = session.theirTeam.map((p) => toSlot(p, false));
  const me = myTeam.find((s) => s.isLocalPlayer);

  const bans = [
    ...(session.bans?.myTeamBans ?? []),
    ...(session.bans?.theirTeamBans ?? []),
    ...actions.filter((a) => a.type === "ban" && a.completed).map((a) => a.championId),
  ].filter((id) => id > 0);

  const timerPhase = session.timer?.phase ?? "";
  const phase: DraftPhase = ["PLANNING", "BAN_PICK", "FINALIZATION"].includes(timerPhase) ? (timerPhase as DraftPhase) : "NONE";

  return {
    phase,
    myTeam,
    enemyTeam,
    bans: [...new Set(bans)],
    localCellId: session.localPlayerCellId,
    myPosition: me?.position ?? null,
    myChampionId: me?.championId ?? null,
    pickableChampionIds,
    mySide: session.myTeam[0]?.team === 1 ? "blue" : session.myTeam[0]?.team === 2 ? "red" : null,
  };
}
