import { EventEmitter } from "node:events";
import type { ConnectionStatus } from "../../shared/types";
import type { GameData } from "../data/gameData";
import type { DraftSource } from "./lcuClient";
import type { LcuAction, LcuPlayer, LcuSession } from "./champSelect";

/**
 * Symulator klienta LoL – odtwarza przykładowy champ select krok po kroku.
 * Pozwala testować aplikację bez uruchamiania gry (`npm run dev:mock`).
 * Nazwy postaci to tylko dane testowe – ich ID są pobierane z aktualnego Data Dragon.
 */
const ALLIES: [string, string][] = [
  ["Ornn", "top"],
  ["LeeSin", "jungle"],
  ["Ahri", "middle"],
  ["", "bottom"], // to my – postać wybiera gracz
  ["Thresh", "utility"],
];
const ENEMIES = ["Darius", "Warwick", "Vladimir", "Samira", "Soraka"];
const BANS = ["Yasuo", "Zed", "Kaisa", "Morgana"];
const MY_PICK = "Jinx";
/** Ile kroków symulacji trwa "gra" po champ selekcie, zanim zacznie się kolejny draft. */
const IN_GAME_TICKS = 4;
const LOCAL_CELL = 3;

// Kolejność zdarzeń: [ile sojuszników zablokowało, ilu wrogów, czy hoveruję, czy zablokowałem]
const TIMELINE: [number, number, boolean, boolean][] = [
  [0, 0, false, false],
  [1, 0, false, false],
  [1, 2, false, false],
  [3, 2, false, false],
  [3, 4, false, false],
  [3, 4, false, false], // moja tura – widać rekomendacje picków
  [3, 4, true, false], // hover – widać build
  [4, 4, true, true],
  [4, 5, true, true],
  [4, 5, true, true],
  [4, 5, true, true],
];

export class MockLcu extends EventEmitter implements DraftSource {
  private step = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private data: GameData,
    private stepMs = 2500,
  ) {
    super();
  }

  start(): void {
    this.emit("status", "mock" satisfies ConnectionStatus);
    this.emit("phase", "ChampSelect");
    this.tick();
    this.timer = setInterval(() => this.tick(), this.stepMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getPickableChampionIds(): Promise<number[]> {
    return [];
  }

  async applyRunePage(): Promise<void> {
    console.log("[mock] Strona run zostałaby zapisana w kliencie.");
  }

  private id(key: string): number {
    return this.data.championsByKey.get(key)?.id ?? 0;
  }

  private tick(): void {
    if (this.step < TIMELINE.length) {
      if (this.step === 0) this.emit("phase", "ChampSelect");
      const [alliesLocked, enemiesLocked, hover, lockedMe] = TIMELINE[this.step];
      this.emit("session", this.buildSession(alliesLocked, enemiesLocked, hover, lockedMe));
    } else if (this.step === TIMELINE.length) {
      // Po champ selekcie symulujemy grę – aplikacja powinna dalej pokazywać build.
      this.emit("session", null);
      this.emit("phase", "InProgress");
    }
    this.step = (this.step + 1) % (TIMELINE.length + IN_GAME_TICKS);
  }

  private buildSession(alliesLocked: number, enemiesLocked: number, hover: boolean, lockedMe: boolean): LcuSession {
    const others = ALLIES.map((a, i) => ({ i, key: a[0] })).filter((a) => a.i !== LOCAL_CELL);
    const lockedAllyCells = new Set(others.slice(0, Math.min(alliesLocked, 4)).map((a) => a.i));

    const myTeam: LcuPlayer[] = ALLIES.map(([key, pos], i) => {
      const isMe = i === LOCAL_CELL;
      const champ = isMe ? (hover ? this.id(MY_PICK) : 0) : lockedAllyCells.has(i) ? this.id(key) : 0;
      return { cellId: i, championId: champ, championPickIntent: isMe ? 0 : this.id(key), assignedPosition: pos };
    });
    const theirTeam: LcuPlayer[] = ENEMIES.map((key, i) => ({
      cellId: 5 + i,
      championId: i < enemiesLocked ? this.id(key) : 0,
      assignedPosition: "",
    }));

    const actions: LcuAction[] = [
      ...myTeam.map((p) => ({
        actorCellId: p.cellId,
        championId: p.championId,
        type: "pick",
        completed: p.cellId === LOCAL_CELL ? lockedMe : lockedAllyCells.has(p.cellId),
        isInProgress: p.cellId === LOCAL_CELL && !lockedMe && enemiesLocked >= 4,
      })),
      ...theirTeam.map((p) => ({ actorCellId: p.cellId, championId: p.championId, type: "pick", completed: p.championId > 0, isInProgress: false })),
    ];

    const done = alliesLocked >= 4 && enemiesLocked >= 5;
    return {
      localPlayerCellId: LOCAL_CELL,
      myTeam,
      theirTeam,
      actions: [actions],
      bans: { myTeamBans: BANS.slice(0, 2).map((k) => this.id(k)), theirTeamBans: BANS.slice(2).map((k) => this.id(k)) },
      timer: { phase: alliesLocked === 0 && enemiesLocked === 0 ? "PLANNING" : done ? "FINALIZATION" : "BAN_PICK" },
    };
  }
}
