import fs from "node:fs/promises";
import path from "node:path";
import type { Position } from "../../shared/types";
import { fetchJson } from "./http";

/** Licznik gier i wygranych – podstawowa jednostka wszystkich statystyk. */
export interface WL {
  games: number;
  wins: number;
}

/**
 * Format pliku statystyk generowanego przez crawler (src/crawler) lub zdalny serwer statystyk.
 * Klucze to ID postaci/przedmiotów jako tekst (JSON nie ma kluczy liczbowych).
 */
export interface StatsFile {
  patch: string; // np. "16.21"
  generatedAt: string;
  matches: number;
  /** Przybliżony początek patcha (sekundy) – crawler pyta Riot tylko o nowsze mecze. */
  patchStartTime?: number;
  /** champion -> pozycja -> W/L */
  champions: Record<string, Partial<Record<Position, WL>>>;
  /** "champion:pozycja" -> przeciwnik z tej samej linii -> W/L */
  lane: Record<string, Record<string, WL>>;
  /** champion -> dowolny przeciwnik w drużynie wroga -> W/L */
  vs: Record<string, Record<string, WL>>;
  /** champion -> sojusznik -> W/L */
  with: Record<string, Record<string, WL>>;
  /** "champion:pozycja" -> dane buildów */
  builds: Record<string, BuildStats>;
}

export interface BuildStats {
  items: Record<string, WL>; // ukończone przedmioty w końcowym ekwipunku
  coreOrders: Record<string, WL>; // "id>id>id" – kolejność 3 pierwszych przedmiotów (z osi czasu meczu)
  summoners: Record<string, WL>; // "4+14"
  runes: Record<string, WL>; // "primaryStyle|subStyle|perk,perk,..."
  skillOrders: Record<string, WL>; // "QWE" – kolejność maksowania
  starters?: Record<string, WL>; // "1055+2003" – przedmioty kupione na starcie (z osi czasu meczu)
}

export function emptyStats(patch = "unknown"): StatsFile {
  return { patch, generatedAt: new Date().toISOString(), matches: 0, champions: {}, lane: {}, vs: {}, with: {}, builds: {} };
}

/**
 * Wygładzony winrate (średnia bayesowska).
 * Przy małej liczbie gier wynik jest "przyciągany" do 50%, żeby 3 wygrane na 3 gry
 * nie wyglądały na 100% winrate. `m` = ile "wirtualnych" gier po 50% dodajemy.
 */
export function smoothedWinrate(wl: WL | undefined, m = 30, prior = 0.5): number {
  if (!wl) return prior;
  return (wl.wins + m * prior) / (wl.games + m);
}

export class StatsStore {
  private stats: StatsFile = emptyStats();

  constructor(
    private dataDir: string,
    private statsUrl: string | null,
    /** Statystyki dołączone do repozytorium – dla osób bez własnego klucza Riot API. */
    private seedFile: string | null = null,
  ) {}

  get current(): StatsFile {
    return this.stats;
  }

  get hasData(): boolean {
    return this.stats.matches > 0;
  }

  /**
   * Ładuje statystyki w kolejności:
   * 1) zdalny serwer (STATS_URL), 2) lokalny plik crawlera, 3) plik dołączony do repozytorium (seed).
   */
  async load(): Promise<void> {
    if (this.statsUrl) {
      try {
        this.stats = await fetchJson<StatsFile>(this.statsUrl);
        return;
      } catch (err) {
        console.warn(`[stats] Nie udało się pobrać ${this.statsUrl}:`, (err as Error).message);
      }
    }
    const files = [path.join(this.dataDir, "stats", "latest.json"), this.seedFile].filter((f): f is string => !!f);
    for (const file of files) {
      try {
        this.stats = JSON.parse(await fs.readFile(file, "utf8")) as StatsFile;
        console.log(`[stats] Statystyki patcha ${this.stats.patch}: ${this.stats.matches} meczów (${path.basename(path.dirname(file))}/${path.basename(file)}).`);
        return;
      } catch {
        /* próbujemy kolejnego źródła */
      }
    }
    this.stats = emptyStats();
    console.warn("[stats] Brak statystyk – rekomendacje będą oparte tylko na analizie składu (tryb heurystyczny).");
  }

  championWL(championId: number, position: Position): WL | undefined {
    return this.stats.champions[championId]?.[position];
  }

  /** Ile gier dana postać rozegrała na danej pozycji (do ustalenia "puli" sensownych picków). */
  positionGames(championId: number, position: Position): number {
    return this.championWL(championId, position)?.games ?? 0;
  }

  totalGamesOnPosition(position: Position): number {
    let sum = 0;
    for (const byPos of Object.values(this.stats.champions)) sum += byPos[position]?.games ?? 0;
    return sum;
  }

  /** Ile różnych postaci zagrało na tej pozycji (do wyliczenia średniej popularności). */
  championsOnPosition(position: Position): number {
    let n = 0;
    for (const byPos of Object.values(this.stats.champions)) if ((byPos[position]?.games ?? 0) > 0) n++;
    return n;
  }

  /** Prawdopodobieństwo, że postać gra na danej pozycji (do zgadywania ról przeciwników). */
  positionProbability(championId: number, position: Position): number {
    const byPos = this.stats.champions[championId];
    if (!byPos) return 0;
    const total = Object.values(byPos).reduce((s, wl) => s + (wl?.games ?? 0), 0);
    return total ? (byPos[position]?.games ?? 0) / total : 0;
  }

  lane(championId: number, position: Position, enemyId: number): WL | undefined {
    return this.stats.lane[`${championId}:${position}`]?.[enemyId];
  }

  vs(championId: number, enemyId: number): WL | undefined {
    return this.stats.vs[championId]?.[enemyId];
  }

  with(championId: number, allyId: number): WL | undefined {
    return this.stats.with[championId]?.[allyId];
  }

  build(championId: number, position: Position): BuildStats | undefined {
    return this.stats.builds[`${championId}:${position}`];
  }
}
