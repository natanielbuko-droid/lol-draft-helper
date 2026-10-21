import path from "node:path";
import type { AppState } from "../shared/types";
import { choosePort, openUrl, startApiServer } from "./api/server";
import { loadConfig } from "./config";
import { GameData } from "./data/gameData";
import { StatsStore } from "./data/statsStore";
import { computeRecommendations } from "./engine";
import { parseSession, type LcuSession } from "./lcu/champSelect";
import { LcuClient, type DraftSource } from "./lcu/lcuClient";
import { MockLcu } from "./lcu/mockLcu";
import { crawl } from "../crawler/crawl";

/**
 * Punkt startowy aplikacji. Przepływ danych:
 *
 *   Data Dragon / CDragon ──┐
 *   Statystyki (crawler) ───┼──> Silnik rekomendacji ──> API (REST + WebSocket) ──> UI (React)
 *   Klient LoL (LCU) ───────┘          ▲
 *        (zdarzenia champ select) ─────┘
 */
async function main() {
  const cfg = loadConfig();

  // Najpierw port: druga kopia aplikacji nie startuje – tylko otwiera już działającą w przeglądarce.
  const choice = await choosePort(cfg.port);
  if ("alreadyRunning" in choice) {
    const url = `http://localhost:${choice.alreadyRunning}`;
    console.log(`[api] LoL Draft Helper już działa w innym oknie (${url}).`);
    if (cfg.openBrowser) {
      openUrl(url);
      console.log("[api] Otworzyłem go w przeglądarce – to okno możesz zamknąć.");
    }
    return;
  }
  if (choice.port !== cfg.port) console.warn(`[api] Port ${cfg.port} jest zajęty przez inny program – używam portu ${choice.port}.`);
  cfg.port = choice.port;

  const data = new GameData(path.join(cfg.dataDir, "cache"), cfg.displayLocale);
  const stats = new StatsStore(cfg.dataDir, cfg.statsUrl, path.resolve("seed", "stats.json"));
  await Promise.all([data.init(), stats.load()]);
  data.startPatchWatcher(cfg.patchCheckMinutes);

  const source: DraftSource = cfg.mock ? new MockLcu(data) : new LcuClient(cfg.lolInstallPath);

  let lastSession: LcuSession | null = null;
  let state: AppState = {
    connection: "disconnected",
    gameflowPhase: "None",
    patch: data.version,
    statsPatch: stats.hasData ? stats.current.patch : null,
    statsMatches: stats.current.matches,
    draft: null,
    picks: [],
    build: null,
    allyAnalysis: null,
    enemyAnalysis: null,
    champions: data.championIndex(),
    updatedAt: new Date().toISOString(),
  };

  const api = startApiServer(cfg.port, {
    getState: () => state,
    refreshStats: async () => {
      await stats.load();
      await recompute();
    },
    applyRunes: async () => {
      const runes = state.build?.runes;
      if (!runes || runes.perkIds.length !== 9) {
        throw new Error("Import możliwy tylko dla pełnej strony run ze statystyk (zbierz dane crawlerem).");
      }
      await source.applyRunePage({
        name: `DraftHelper: ${state.build!.championName}`.slice(0, 25),
        primaryStyleId: runes.primaryStyleId,
        subStyleId: runes.subStyleId,
        selectedPerkIds: runes.perkIds,
      });
      return "Strona run zapisana w kliencie.";
    },
  }, cfg.openBrowser);

  const update = (patch: Partial<AppState>) => {
    state = { ...state, ...patch, updatedAt: new Date().toISOString() };
    api.broadcast(state);
  };

  async function recompute() {
    if (!lastSession) {
      update({ draft: null, picks: [], build: null, allyAnalysis: null, enemyAnalysis: null });
      return;
    }
    const draft = parseSession(lastSession, await source.getPickableChampionIds());
    const rec = computeRecommendations(draft, data, stats);
    update({ draft, ...rec, statsPatch: stats.hasData ? stats.current.patch : null, statsMatches: stats.current.matches });
  }

  source.on("status", (connection) => update({ connection }));
  // Po champ selekcie (ładowanie, gra, ekran końcowy) zostawiamy ostatni draft i build na ekranie –
  // gracz zagląda do buildu właśnie w trakcie gry. Zastąpi je dopiero następny champ select.
  source.on("phase", (gameflowPhase: string) => update({ gameflowPhase }));
  source.on("session", (session: LcuSession | null) => {
    if (!session) return; // koniec champ selectu – zachowujemy ostatnie rekomendacje
    lastSession = session;
    void recompute();
  });

  // Nowy patch -> nowe profile postaci i przedmiotów -> przeliczamy rekomendacje.
  data.on("updated", () => {
    update({ patch: data.version, champions: data.championIndex() });
    void recompute();
  });

  // Opcjonalnie: samodzielne odświeżanie statystyk (tylko z własnym kluczem Riot API).
  if (cfg.riotApiKey && cfg.autoCrawlHours > 0) {
    const run = async () => {
      try {
        await crawl({ apiKey: cfg.riotApiKey!, platform: cfg.riotPlatform, dataDir: cfg.dataDir, maxMatches: 300, timelines: false });
        await stats.load();
        await recompute();
      } catch (err) {
        console.warn("[crawl] Błąd:", (err as Error).message);
      }
    };
    setInterval(run, cfg.autoCrawlHours * 3_600_000);
    void run();
  }

  source.start();
  console.log(cfg.mock ? "[lcu] Tryb MOCK – symulowany champ select." : "[lcu] Czekam na klienta League of Legends...");

  const shutdown = () => {
    source.stop();
    data.stop();
    api.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Błąd krytyczny:", err);
  process.exit(1);
});
