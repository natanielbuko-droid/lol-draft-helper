import { EventEmitter } from "node:events";
import https from "node:https";
import WebSocket from "ws";
import type { ConnectionStatus } from "../../shared/types";
import { findLcuCredentials, type LcuCredentials } from "./credentials";
import type { LcuSession } from "./champSelect";

/**
 * Wspólny interfejs źródła draftu – prawdziwy klient LoL albo symulator (MockLcu).
 * Zdarzenia: "status" (ConnectionStatus), "phase" (string), "session" (LcuSession | null).
 */
export interface DraftSource extends EventEmitter {
  start(): void;
  stop(): void;
  getPickableChampionIds(): Promise<number[]>;
  applyRunePage(page: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] }): Promise<void>;
}

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
    const own = pages.find((p) => p.name === page.name && p.isDeletable);
    if (own) await this.request("DELETE", `/lol-perks/v1/pages/${own.id}`);
    await this.request("POST", "/lol-perks/v1/pages", { ...page, current: true });
  }
}
