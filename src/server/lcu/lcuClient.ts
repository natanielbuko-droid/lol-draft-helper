import { EventEmitter } from "node:events";
import https from "node:https";
import WebSocket from "ws";
import type { ConnectionStatus, PoolEntry } from "../../shared/types";
import { findLcuCredentials, type LcuCredentials } from "./credentials";
import type { LcuSession } from "./champSelect";
import { buildPlayerPool, recentGames, type LcuMastery, type LcuMatchHistory } from "./playerPool";

/**
 * Wspólny interfejs źródła draftu – prawdziwy klient LoL albo symulator (MockLcu).
 * Zdarzenia: "status" (ConnectionStatus), "phase" (string), "session" (LcuSession | null).
 */
export interface DraftSource extends EventEmitter {
  start(): void;
  stop(): void;
  getPickableChampionIds(): Promise<number[]>;
  applyRunePage(page: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] }): Promise<void>;
  /** Ustawia czary przywoływacza w trwającym champ selekcie. */
  applySummonerSpells(spell1Id: number, spell2Id: number): Promise<void>;
  /** Zapisuje zestaw przedmiotów widoczny w sklepie w grze (zastępuje poprzedni zestaw tej aplikacji). */
  applyItemSet(set: ItemSetInput): Promise<void>;
  /** Pula postaci gracza: maestria i ostatnie mecze (pusta, gdy klient nie odpowiada). */
  getPlayerPool(): Promise<PoolEntry[]>;
}

export interface ItemSetInput {
  title: string;
  championId: number;
  blocks: { type: string; items: string[] }[];
}

/** Prefiks nazw stron run i zestawów przedmiotów tworzonych przez aplikację – tylko takie nadpisujemy. */
export const OWN_PREFIX = "DraftHelper";

// Klient używa certyfikatu podpisanego przez Riot, którego Node nie zna.
// Wyłączamy weryfikację TYLKO dla połączeń z 127.0.0.1 (ruch nie opuszcza komputera).
const localAgent = new https.Agent({ rejectUnauthorized: false });

const WAMP_SUBSCRIBE = 5;
const WAMP_EVENT = 8;

export class LcuClient extends EventEmitter implements DraftSource {
  private creds: LcuCredentials | null = null;
  private ws: WebSocket | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private installPath: string | null) {
    super();
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  /** Pętla łączenia: co 3 s szukamy klienta, aż go znajdziemy. */
  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.emit("status", "connecting" satisfies ConnectionStatus);
    this.creds = await findLcuCredentials(this.installPath);
    if (!this.creds) return this.scheduleReconnect();

    const auth = Buffer.from(`riot:${this.creds.password}`).toString("base64");
    const ws = new WebSocket(`wss://127.0.0.1:${this.creds.port}`, {
      headers: { Authorization: `Basic ${auth}` },
      rejectUnauthorized: false,
    });
    this.ws = ws;

    ws.on("open", async () => {
      this.emit("status", "connected" satisfies ConnectionStatus);
      // Subskrypcja zdarzeń WAMP: zmiana fazy gry i każda zmiana w champ selekcie.
      ws.send(JSON.stringify([WAMP_SUBSCRIBE, "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase"]));
      ws.send(JSON.stringify([WAMP_SUBSCRIBE, "OnJsonApiEvent_lol-champ-select_v1_session"]));
      // Stan początkowy – gdy aplikację włączono w trakcie champ selectu.
      try {
        const phase = await this.request<string>("GET", "/lol-gameflow/v1/gameflow-phase");
        this.emit("phase", phase);
        if (phase === "ChampSelect") this.emit("session", await this.request<LcuSession>("GET", "/lol-champ-select/v1/session"));
      } catch {
        /* klient jeszcze się uruchamia */
      }
    });

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[0] !== WAMP_EVENT) return;
      const payload = msg[2] as { uri: string; eventType: "Create" | "Update" | "Delete"; data: unknown };
      if (payload.uri === "/lol-gameflow/v1/gameflow-phase") {
        this.emit("phase", payload.data as string);
      } else if (payload.uri === "/lol-champ-select/v1/session") {
        this.emit("session", payload.eventType === "Delete" ? null : (payload.data as LcuSession));
      }
    });

    ws.on("close", () => {
      this.emit("status", "disconnected" satisfies ConnectionStatus);
      this.scheduleReconnect();
    });
    ws.on("error", () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.emit("status", "disconnected" satisfies ConnectionStatus);
    this.retryTimer = setTimeout(() => void this.connect(), 3000);
  }

  /** Zapytanie REST do klienta, np. GET /lol-summoner/v1/current-summoner */
  request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const creds = this.creds;
    if (!creds) return Promise.reject(new Error("Klient LoL nie jest połączony"));
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: "127.0.0.1",
          port: creds.port,
          path,
          method,
          agent: localAgent,
          headers: {
            Authorization: `Basic ${Buffer.from(`riot:${creds.password}`).toString("base64")}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            if ((res.statusCode ?? 500) >= 400) return reject(new Error(`LCU ${res.statusCode}: ${data}`));
            resolve(data ? (JSON.parse(data) as T) : (undefined as T));
          });
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getPickableChampionIds(): Promise<number[]> {
    try {
      return await this.request<number[]>("GET", "/lol-champ-select/v1/pickable-champion-ids");
    } catch {
      return [];
    }
  }

  /**
   * Zapisuje stronę run w kliencie. Nadpisuje TYLKO stronę o tej samej nazwie stworzoną wcześniej
   * przez tę aplikację – nigdy nie kasuje stron gracza.
   */
  async applyRunePage(page: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] }) {
    const pages = await this.request<{ id: number; name: string; isDeletable: boolean }[]>("GET", "/lol-perks/v1/pages");
    // Usuwamy WYŁĄCZNIE wcześniejszą stronę tej aplikacji (nazwa zaczyna się od "DraftHelper").
    const own = pages.find((p) => p.name.startsWith(OWN_PREFIX) && p.isDeletable);
    if (own) await this.request("DELETE", `/lol-perks/v1/pages/${own.id}`);
    try {
      await this.request("POST", "/lol-perks/v1/pages", { ...page, current: true });
    } catch (err) {
      if (/max|limit|full/i.test((err as Error).message)) {
        throw new Error("Brak wolnego miejsca na stronę run – usuń jedną stronę w kliencie (aplikacja nie kasuje Twoich stron).");
      }
      throw err;
    }
  }

  async getPlayerPool(): Promise<PoolEntry[]> {
    const [mastery, history] = await Promise.all([
      this.request<LcuMastery[]>("GET", "/lol-champion-mastery/v1/local-player/champion-mastery").catch(() => []),
      this.request<LcuMatchHistory>("GET", "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=49").catch(() => null),
    ]);
    return buildPlayerPool(mastery, recentGames(history));
  }

  async applySummonerSpells(spell1Id: number, spell2Id: number): Promise<void> {
    await this.request("PATCH", "/lol-champ-select/v1/session/my-selection", { spell1Id, spell2Id });
  }

  async applyItemSet(set: ItemSetInput): Promise<void> {
    const me = await this.request<{ summonerId: number }>("GET", "/lol-summoner/v1/current-summoner");
    const path = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`;
    const current = await this.request<{ accountId: number; itemSets: { title: string }[] }>("GET", path);
    const newSet = {
      title: set.title,
      type: "custom",
      map: "any",
      mode: "any",
      priority: false,
      sortrank: 0,
      startedFrom: "blank",
      preferredItemSlots: [],
      associatedChampions: [set.championId],
      associatedMaps: [11],
      uid: `draft-helper-${set.championId}`,
      blocks: set.blocks.map((b) => ({ type: b.type, items: b.items.map((id) => ({ id, count: 1 })) })),
    };
    // Zostawiamy zestawy gracza, zastępujemy tylko poprzedni zestaw tej aplikacji.
    const others = (current.itemSets ?? []).filter((s) => !s.title.startsWith(OWN_PREFIX));
    await this.request("PUT", path, { accountId: current.accountId, itemSets: [...others, newSet], timestamp: Date.now() });
  }
}
