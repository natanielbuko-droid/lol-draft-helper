import path from "node:path";
import type { AppState, PoolEntry } from "../shared/types";
import { choosePort, openUrl, startApiServer } from "./api/server";
import { importBuild, loadSettings, saveSettings } from "./clientImport";
import { loadConfig } from "./config";
import { GameData } from "./data/gameData";
import { StatsStore } from "./data/statsStore";
import { computeRecommendations } from "./engine";
import { archetypes, championDetail, championList, tierLists } from "./engine/browse";
import { defaultEnvFile, PlayerService } from "./players";
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
export interface ServerHooks {
  /** Zmiana fazy gry w kliencie (np. "ChampSelect") – aplikacja desktopowa pokazuje wtedy okno. */
  onPhase?: (phase: string) => void;
}

/** Działający serwer: adres interfejsu i funkcja zatrzymania. */
export interface RunningServer {
  url: string;
  /** true = na tym porcie działa już inna kopia aplikacji, ta nic nie uruchomiła. */
  external: boolean;
  stop(): void;
}

export async function startServer(hooks: ServerHooks = {}): Promise<RunningServer> {
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
    return { url, external: true, stop: () => {} };
  }
  if (choice.port !== cfg.port) console.warn(`[api] Port ${cfg.port} jest zajęty przez inny program – używam portu ${choice.port}.`);
  cfg.port = choice.port;

  const data = new GameData(path.join(cfg.dataDir, "cache"), cfg.displayLocale);
  const stats = new StatsStore(cfg.dataDir, cfg.statsUrl, path.resolve(cfg.resourcesDir, "seed", "stats.json.gz"));
  await Promise.all([data.init(), stats.load()]);
  data.startPatchWatcher(cfg.patchCheckMinutes);

  const source: DraftSource = cfg.mock ? new MockLcu(data) : new LcuClient(cfg.lolInstallPath);

  /** Skąd pochodzą statystyki – pokazywane w nagłówku aplikacji. */
  const statsInfo = () => ({
    statsPatch: stats.hasData ? stats.current.patch : null,
    statsMatches: stats.current.matches,
    statsTiers: stats.hasData ? (stats.current.tiers ?? null) : null,
    statsPlatform: stats.hasData ? (stats.current.platform ?? null) : null,
  });

  let lastSession: LcuSession | null = null;
  const players = new PlayerService(data, defaultEnvFile(), cfg.playerApiUrl);
  const settings = await loadSettings(cfg.dataDir);
  /** Postać, dla której już zrobiono automatyczny import w tym champ selekcie (żeby nie powtarzać). */
  let autoImportedFor: number | null = null;
  let state: AppState = {
    clientImport: { auto: settings.autoImport, status: null },
    playerPool: null,
    playerSearch: players.mode,
    connection: "disconnected",
    gameflowPhase: "None",
    patch: data.version,
    ...statsInfo(),
    draft: null,
    picks: [],
    scenarios: [],
    jungle: null,
    build: null,
    allyAnalysis: null,
    enemyAnalysis: null,
    champions: data.championIndex(),
    updatedAt: new Date().toISOString(),
  };

  const api = startApiServer(cfg.port, cfg.resourcesDir, {
    getState: () => state,
    refreshStats: async () => {
      await stats.load();
      update(statsInfo()); // nagłówek odświeża się także poza champ selectem
      await recompute();
    },
    tierLists: () => tierLists(data, stats),
    championList: () => championList(data, stats, tierLists(data, stats)),
    champion: (id, position) => championDetail(id, position, data, stats, tierLists(data, stats)),
    archetypes: () => archetypes(data, stats),
    playerProfile: (riotId, platform) => players.profile(riotId, platform),
    playerMatches: (puuid, platform, start) => players.moreMatches(puuid, platform, start),
    importBuild: async () => {
      if (!state.build) throw new Error("Najpierw wybierz postać w champ selekcie.");
      await runImport(false);
    },
    setAutoImport: async (enabled) => {
      settings.autoImport = enabled;
      await saveSettings(cfg.dataDir, settings);
      update({ clientImport: { ...state.clientImport, auto: enabled } });
    },
    applyRunes: async (requested) => {
      const page = requested ?? state.build?.runes;
      if (!state.build || !page || page.perkIds.length !== 9) {
        throw new Error("Brak pełnej strony run do zapisania – wybierz najpierw postać.");
      }
      // Do klienta wysyłamy tylko runy, które istnieją w bieżącym patchu.
      const valid =
        page.perkIds.every((id) => data.perks.has(id)) &&
        [page.primaryStyleId, page.subStyleId].every((id) => data.perkStyles.some((s) => s.id === id));
      if (!valid) throw new Error("Ta strona run zawiera runy, których nie ma w bieżącym patchu.");
      await source.applyRunePage({
        name: `DraftHelper: ${state.build.championName}`.slice(0, 25),
        primaryStyleId: page.primaryStyleId,
        subStyleId: page.subStyleId,
        selectedPerkIds: page.perkIds,
      });
      return "Strona run zapisana w kliencie.";
    },
  }, cfg.openBrowser);

  const update = (patch: Partial<AppState>) => {
    // Tryb wyszukiwarki zależy od pliku .env – sprawdzany przy każdej zmianie stanu (nowy klucz działa bez restartu).
    state = { ...state, ...patch, playerSearch: players.mode, updatedAt: new Date().toISOString() };
    api.broadcast(state);
  };

  /** Pula postaci gracza z klienta (maestria + ostatnie mecze) – odświeżana przy połączeniu i każdym champ selekcie. */
  let pool = new Map<number, PoolEntry>();
  async function refreshPool() {
    const entries = await source.getPlayerPool().catch(() => []);
    if (!entries.length) return;
    const recentGames = entries.reduce((n, e) => n + e.games, 0);
    if (state.playerPool?.champions === entries.length && state.playerPool.recentGames === recentGames) return; // bez zmian
    pool = new Map(entries.map((e) => [e.championId, e]));
    console.log(`[pula] ${entries.length} postaci z maestrią lub ostatnimi grami (${recentGames} ostatnich meczów).`);
    update({ playerPool: { champions: entries.length, recentGames } });
    if (lastSession) await recompute();
  }

  /** Import buildu do klienta; wynik trafia do UI. */
  async function runImport(auto: boolean) {
    if (!state.build) return;
    const me = lastSession?.myTeam.find((p) => p.cellId === lastSession?.localPlayerCellId) ?? null;
    const status = await importBuild(source, state.build, data, me, auto);
    const ok = status.parts.filter((p) => p.ok).length;
    console.log(`[import] ${status.champion}: ${ok}/${status.parts.length} części zaimportowane${auto ? " (automatycznie)" : ""}.`);
    update({ clientImport: { ...state.clientImport, status } });
  }

  async function recompute() {
    if (!lastSession) {
      update({ draft: null, picks: [], scenarios: [], jungle: null, build: null, allyAnalysis: null, enemyAnalysis: null });
      return;
    }
    const draft = parseSession(lastSession, await source.getPickableChampionIds());
    const rec = computeRecommendations(draft, data, stats, pool);
    update({ draft, ...rec, ...statsInfo() });

    // Automatyczny import, gdy gracz zablokuje postać (raz na postać w danym champ selekcie).
    const meSlot = draft.myTeam.find((s) => s.isLocalPlayer);
    if (settings.autoImport && meSlot?.locked && rec.build && autoImportedFor !== rec.build.championId) {
      autoImportedFor = rec.build.championId;
      void runImport(true);
    }
  }

  source.on("status", (connection) => {
    update({ connection });
    if (connection === "connected" || connection === "mock") void refreshPool();
  });
  // Po champ selekcie (ładowanie, gra, ekran końcowy) zostawiamy ostatni draft i build na ekranie –
  // gracz zagląda do buildu właśnie w trakcie gry. Zastąpi je dopiero następny champ select.
  source.on("phase", (gameflowPhase: string) => {
    if (gameflowPhase === "ChampSelect") {
      autoImportedFor = null; // nowy champ select – można importować ponownie
      void refreshPool(); // świeża maestria i historia po ostatniej grze
    }
    update({ gameflowPhase });
    hooks.onPhase?.(gameflowPhase);
  });
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

  let crawlTimer: NodeJS.Timeout | null = null;
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
    crawlTimer = setInterval(run, cfg.autoCrawlHours * 3_600_000);
    void run();
  }

  source.start();
  console.log(cfg.mock ? "[lcu] Tryb MOCK – symulowany champ select." : "[lcu] Czekam na klienta League of Legends...");

  await api.ready;
  const stop = () => {
    if (crawlTimer) clearInterval(crawlTimer);
    source.stop();
    data.stop();
    api.close();
  };
  return { url: `http://localhost:${cfg.port}`, external: false, stop };
}
