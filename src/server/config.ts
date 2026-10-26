import path from "node:path";
import { loadEnvFile } from "./env";

/**
 * Cała konfiguracja w jednym miejscu. Wartości można nadpisać zmiennymi środowiskowymi,
 * więc nic nie trzeba zmieniać w kodzie przy nowym patchu.
 */
export interface AppConfig {
  port: number;
  mock: boolean;
  /** Otwórz interfejs w przeglądarce po starcie (flaga --open). */
  openBrowser: boolean;
  dataDir: string;
  /** Folder z plikami aplikacji: dist/ (zbudowany interfejs) i seed/ (startowe statystyki). */
  resourcesDir: string;
  /** Język nazw w UI (Data Dragon obsługuje m.in. pl_PL). Analiza tekstu zawsze odbywa się na en_US. */
  displayLocale: string;
  /** Co ile minut sprawdzać, czy wyszedł nowy patch. */
  patchCheckMinutes: number;
  /** Opcjonalny zdalny serwer statystyk (np. Twój crawler publikujący JSON na CDN). */
  statsUrl: string | null;
  /** Klucz Riot API – tylko do lokalnego crawlera. NIE umieszczaj go w dystrybuowanej aplikacji. */
  riotApiKey: string | null;
  riotPlatform: string;
  /** Serwer pośredniczący wyszukiwarki graczy (z kluczem produkcyjnym) – zamiast klucza w .env. */
  playerApiUrl: string | null;
  /** Automatyczne odświeżanie statystyk co N godzin (0 = wyłączone). Wymaga riotApiKey. */
  autoCrawlHours: number;
  lolInstallPath: string | null;
}

export function loadConfig(argv: string[] = process.argv): AppConfig {
  loadEnvFile();
  const env = process.env;
  return {
    port: Number(env.API_PORT ?? 4777),
    mock: argv.includes("--mock") || env.MOCK_LCU === "1",
    openBrowser: argv.includes("--open"),
    dataDir: path.resolve(env.DATA_DIR ?? "data"),
    resourcesDir: path.resolve(env.RESOURCES_DIR ?? "."),
    displayLocale: env.LOCALE ?? "pl_PL",
    patchCheckMinutes: Number(env.PATCH_CHECK_MINUTES ?? 30),
    statsUrl: env.STATS_URL ?? null,
    riotApiKey: env.RIOT_API_KEY ?? null,
    riotPlatform: env.RIOT_PLATFORM ?? "euw1",
    playerApiUrl: env.PLAYER_API_URL ?? null,
    autoCrawlHours: Number(env.AUTO_CRAWL_HOURS ?? 0),
    lolInstallPath: env.LOL_PATH ?? null,
  };
}
