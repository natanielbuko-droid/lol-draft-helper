import { spawn } from "node:child_process";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { AppState } from "../../shared/types";

export interface RunePageRequest {
  primaryStyleId: number;
  subStyleId: number;
  perkIds: number[];
}

export interface ApiHandlers {
  getState(): AppState;
  /** Zapisuje w kliencie podaną stronę run (albo główną stronę z buildu, gdy brak). */
  applyRunes(page?: RunePageRequest): Promise<string>;
  refreshStats(): Promise<void>;
}

/** Otwiera adres w domyślnej przeglądarce systemu. */
export function openUrl(url: string) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** Czy pod tym portem działa już LoL Draft Helper (np. uruchomiony w innym oknie)? */
async function isOurApp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const state = (await res.json()) as Partial<AppState>;
    return typeof state.patch === "string" && Array.isArray(state.picks);
  } catch {
    return false;
  }
}

/**
 * Wybiera port przed startem aplikacji:
 *  - wolny preferowany port -> używamy go,
 *  - zajęty przez działającą już aplikację -> zwracamy `alreadyRunning` (nie startujemy drugiej kopii),
 *  - zajęty przez inny program -> pierwszy wolny z kolejnych portów.
 */
export async function choosePort(preferred: number, attempts = 10): Promise<{ port: number } | { alreadyRunning: number }> {
  if (await isPortFree(preferred)) return { port: preferred };
  if (await isOurApp(preferred)) return { alreadyRunning: preferred };
  for (let p = preferred + 1; p < preferred + attempts; p++) if (await isPortFree(p)) return { port: p };
  throw new Error(`Porty ${preferred}–${preferred + attempts - 1} są zajęte. Ustaw inny port zmienną API_PORT.`);
}

/**
 * Lokalny serwer dla interfejsu:
 *  - REST:      GET /api/state, POST /api/runes/apply, POST /api/stats/reload
 *  - WebSocket: /ws – serwer "wypycha" nowy stan przy każdej zmianie w champ selekcie
 *  - statyczne pliki zbudowanego UI (dist/) w trybie produkcyjnym
 * Nasłuchuje tylko na 127.0.0.1 – nie jest dostępny z sieci.
 * `openBrowser` – po starcie otwiera interfejs w przeglądarce (flaga --open).
 */
export function startApiServer(port: number, handlers: ApiHandlers, openBrowser = false) {
  const app = express();
  app.use(express.json());

  app.get("/api/state", (_req, res) => res.json(handlers.getState()));

  app.post("/api/runes/apply", async (req, res) => {
    try {
      const body = req.body as Partial<RunePageRequest> | undefined;
      const page =
        body && Array.isArray(body.perkIds)
          ? { primaryStyleId: Number(body.primaryStyleId), subStyleId: Number(body.subStyleId), perkIds: body.perkIds.map(Number) }
          : undefined;
      res.json({ ok: true, message: await handlers.applyRunes(page) });
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

  // Błąd portu trafia zarówno do serwera HTTP, jak i do WebSocketServer (który go przekazuje dalej).
  // Bez obsługi w obu miejscach Node kończy się nieczytelnym stack trace.
  const onError = (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `[api] Port ${port} jest zajęty – zamknij inne okno z aplikacją albo ustaw inny port zmienną API_PORT.`
        : `[api] Błąd serwera: ${err.message}`,
    );
    process.exit(1);
  };
  server.on("error", onError);
  wss.on("error", onError);

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
