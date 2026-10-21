import { spawn } from "node:child_process";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { AppState } from "../../shared/types";

export interface ApiHandlers {
  getState(): AppState;
  applyRunes(): Promise<string>;
  refreshStats(): Promise<void>;
}

/**
 * Lokalny serwer dla interfejsu:
 *  - REST:      GET /api/state, POST /api/runes/apply, POST /api/stats/reload
 *  - WebSocket: /ws – serwer "wypycha" nowy stan przy każdej zmianie w champ selekcie
 *  - statyczne pliki zbudowanego UI (dist/) w trybie produkcyjnym
 * Nasłuchuje tylko na 127.0.0.1 – nie jest dostępny z sieci.
 * `openBrowser` – po starcie otwiera interfejs w przeglądarce (flaga --open).
 */
/** Otwiera adres w domyślnej przeglądarce systemu. */
function openUrl(url: string) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

export function startApiServer(port: number, handlers: ApiHandlers, openBrowser = false) {
  const app = express();
  app.use(express.json());

  app.get("/api/state", (_req, res) => res.json(handlers.getState()));

  app.post("/api/runes/apply", async (_req, res) => {
    try {
      res.json({ ok: true, message: await handlers.applyRunes() });
    } catch (err) {
      res.status(400).json({ ok: false, message: (err as Error).message });
    }
  });

  app.post("/api/stats/reload", async (_req, res) => {
    await handlers.refreshStats();
    res.json({ ok: true });
  });

  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => socket.send(JSON.stringify(handlers.getState())));

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[api] Port ${port} jest zajęty – czy aplikacja nie jest już uruchomiona w innym oknie?`);
    } else {
      console.error("[api] Błąd serwera:", err.message);
    }
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.log(`[api] Serwer działa: ${url}`);
    if (openBrowser && fs.existsSync(dist)) openUrl(url);
  });

  return {
    broadcast(state: AppState) {
      const msg = JSON.stringify(state);
      for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(msg);
    },
    close() {
      wss.close();
      server.close();
    },
  };
}
