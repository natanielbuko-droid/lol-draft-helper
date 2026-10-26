/**
 * Minimalny klient Riot Games API z ogranicznikiem zapytań (rate limiter).
 * Klucz deweloperski: 20 zapytań/1 s i 100 zapytań/2 min – przekroczenie = błąd 429.
 * Limity odczytujemy też z nagłówka X-App-Rate-Limit, więc klucz produkcyjny zadziała szybciej sam.
 */
export const PLATFORM_TO_REGION: Record<string, string> = {
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe", me1: "europe",
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  kr: "asia", jp1: "asia",
  oc1: "sea", sg2: "sea", tw2: "sea", vn2: "sea",
};

interface Window {
  limit: number;
  ms: number;
  stamps: number[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MatchParticipant {
  participantId: number;
  championId: number;
  teamId: number;
  win: boolean;
  teamPosition: string;
  item0: number; item1: number; item2: number; item3: number; item4: number; item5: number; item6: number;
  /** Nagroda z zadania roli – np. buty ADC trzymane poza zwykłym ekwipunkiem. */
  roleBoundItem?: number;
  summoner1Id: number;
  summoner2Id: number;
  // Pola używane przez wyszukiwarkę graczy (profil konta).
  puuid?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  perks: {
    statPerks: { offense: number; flex: number; defense: number };
    styles: { description: string; style: number; selections: { perk: number }[] }[];
  };
}

export interface MatchDto {
  metadata: { matchId: string };
  info: {
    gameVersion: string;
    gameCreation: number;
    queueId: number;
    participants: MatchParticipant[];
    /** Długość gry w sekundach. */
    gameDuration?: number;
    gameEndTimestamp?: number;
  };
}

export interface TimelineDto {
  info: { frames: { events: { type: string; timestamp: number; participantId?: number; skillSlot?: number; itemId?: number }[] }[] };
}

export class RiotApi {
  private windows: Window[] = [
    { limit: 20, ms: 1_000, stamps: [] },
    { limit: 100, ms: 120_000, stamps: [] },
  ];
  readonly region: string;

  /**
   * `relayUrl` – przekaźnik z kluczem po stronie serwera (relay/): zapytania idą przez niego i bez nagłówka z kluczem.
   */
  constructor(
    private apiKey: string,
    readonly platform: string,
    private relayUrl: string | null = null,
  ) {
    this.region = PLATFORM_TO_REGION[platform] ?? "europe";
  }

  /** Czeka, aż we wszystkich oknach czasowych będzie wolne miejsce. */
  private async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      let wait = 0;
      for (const w of this.windows) {
        w.stamps = w.stamps.filter((t) => now - t < w.ms);
        if (w.stamps.length >= w.limit) wait = Math.max(wait, w.ms - (now - w.stamps[0]) + 50);
      }
      if (!wait) break;
      await sleep(wait);
    }
    for (const w of this.windows) w.stamps.push(Date.now());
  }

  private updateLimits(header: string | null) {
    if (!header) return;
    const parsed = header.split(",").map((p) => p.split(":").map(Number));
    if (parsed.every(([l, s]) => l > 0 && s > 0)) {
      this.windows = parsed.map(([limit, sec]) => ({
        limit,
        ms: sec * 1000,
        stamps: this.windows.find((w) => w.ms === sec * 1000)?.stamps ?? [],
      }));
    }
  }

  async get<T>(url: string, attempt = 0): Promise<T | null> {
    await this.acquire();
    const res = await fetch(url, this.apiKey ? { headers: { "X-Riot-Token": this.apiKey } } : {});
    this.updateLimits(res.headers.get("X-App-Rate-Limit"));
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 4) throw new Error(`Riot API ${res.status} po ${attempt} próbach: ${url}`);
      await sleep(Number(res.headers.get("Retry-After") ?? 2 ** attempt) * 1000);
      return this.get<T>(url, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) throw new Error("Nieprawidłowy lub wygasły klucz Riot API (klucz deweloperski działa 24 h).");
    if (!res.ok) throw new Error(`Riot API ${res.status}: ${url}`);
    return (await res.json()) as T;
  }

  private url = (host: string, path: string) =>
    this.relayUrl ? `${this.relayUrl.replace(/\/$/, "")}/${host}${path}` : `https://${host}.api.riotgames.com${path}`;
  private platformUrl = (path: string) => this.url(this.platform, path);
  private regionUrl = (path: string) => this.url(this.region, path);

  async leaguePlayers(tier: string, division = "I", page = 1): Promise<string[]> {
    if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)) {
      const res = await this.get<{ entries: { puuid: string }[] }>(
        this.platformUrl(`/lol/league/v4/${tier.toLowerCase()}leagues/by-queue/RANKED_SOLO_5x5`),
      );
      return res?.entries.map((e) => e.puuid).filter(Boolean) ?? [];
    }
    const res = await this.get<{ puuid: string }[]>(
      this.platformUrl(`/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`),
    );
    return res?.map((e) => e.puuid).filter(Boolean) ?? [];
  }

  /**
   * ID meczów od najnowszego. `startTime` / `endTime` (sekundy od 1970) – tylko mecze rozpoczęte
   * po / przed tym momentem (np. żeby przy zbieraniu starszego patcha pominąć gry z nowego).
   */
  async matchIds(puuid: string, count = 20, startTime?: number, endTime?: number): Promise<string[]> {
    const range = `${startTime ? `&startTime=${startTime}` : ""}${endTime ? `&endTime=${endTime}` : ""}`;
    return (await this.get<string[]>(this.regionUrl(`/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&count=${count}${range}`))) ?? [];
  }

  match(id: string) {
    return this.get<MatchDto>(this.regionUrl(`/lol/match/v5/matches/${id}`));
  }

  timeline(id: string) {
    return this.get<TimelineDto>(this.regionUrl(`/lol/match/v5/matches/${id}/timeline`));
  }

  // --- wyszukiwarka graczy (profil konta) ---

  /** Konto po Riot ID (nick#tag). Konta są globalne – wystarczy region serwera. */
  account(gameName: string, tagLine: string) {
    return this.get<{ puuid: string; gameName: string; tagLine: string }>(
      this.regionUrl(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`),
    );
  }

  summoner(puuid: string) {
    return this.get<{ profileIconId: number; summonerLevel: number }>(this.platformUrl(`/lol/summoner/v4/summoners/by-puuid/${puuid}`));
  }

  leagueEntries(puuid: string) {
    return this.get<{ queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }[]>(
      this.platformUrl(`/lol/league/v4/entries/by-puuid/${puuid}`),
    );
  }

  topMastery(puuid: string, count = 6) {
    return this.get<{ championId: number; championLevel: number; championPoints: number }[]>(
      this.platformUrl(`/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`),
    );
  }

  /** Ostatnie mecze ze wszystkich trybów (od `start`, najnowsze pierwsze). */
  recentMatchIds(puuid: string, start = 0, count = 10) {
    return this.get<string[]>(this.regionUrl(`/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`));
  }
}
