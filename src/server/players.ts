import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { RiotApi, PLATFORM_TO_REGION, type MatchDto } from "../crawler/riotApi";
import { POSITIONS, type PlayerMatch, type PlayerProfile, type PlayerRank, type PlayerSearchMode, type Position } from "../shared/types";
import type { GameData } from "./data/gameData";

/**
 * Wyszukiwarka graczy: profil konta po Riot ID (ranga, ostatnie mecze, maestria).
 *
 * Dane pochodzą z Riot API, więc potrzebny jest klucz. Są dwa tryby:
 *  - "key"   – klucz z pliku .env (RIOT_API_KEY), czytany przy każdym wyszukiwaniu, więc nowy klucz działa bez restartu,
 *  - "proxy" – PLAYER_API_URL wskazuje przekaźnik (relay/), który dokłada klucz po swojej stronie.
 * Klucza nigdy nie dołączamy do instalatora (zasady Riot), dlatego bez .env i bez przekaźnika wyszukiwarka jest wyłączona.
 */

const QUEUE_NAME: Record<number, string> = {
  420: "Rankingowa solo/duo",
  440: "Rankingowa flex",
  400: "Normalna (draft)",
  430: "Normalna (blind)",
  490: "Szybka gra",
  480: "Swiftplay",
  450: "ARAM",
  1700: "Arena",
  1710: "Arena",
  900: "ARURF",
  1900: "URF",
  0: "Własna gra",
};

/** Domyślny tag, gdy gracz wpisze sam nick (większość kont z danego serwera ma taki tag). */
const DEFAULT_TAG: Record<string, string> = {
  eun1: "EUNE",
  euw1: "EUW",
  na1: "NA1",
  kr: "KR1",
  br1: "BR1",
  tr1: "TR1",
  jp1: "JP1",
  la1: "LAN",
  la2: "LAS",
  oc1: "OCE",
  ru: "RU1",
  me1: "ME1",
};

export const PLAYER_PLATFORMS = Object.keys(PLATFORM_TO_REGION);
/** Ile meczów wczytujemy naraz – każdy mecz to osobne zapytanie do Riot API (klucz deweloperski: 100 na 2 minuty). */
const PAGE = 10;
const MATCH_CACHE_LIMIT = 600;

/** Błąd z komunikatem dla gracza i kodem HTTP dla UI. */
export class PlayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** "Nick#TAG" -> [nick, tag]; sam nick -> domyślny tag serwera. */
export function parseRiotId(input: string, platform: string): [string, string] {
  const text = input.trim();
  const i = text.lastIndexOf("#");
  const name = (i >= 0 ? text.slice(0, i) : text).trim();
  const tag = (i >= 0 ? text.slice(i + 1) : (DEFAULT_TAG[platform] ?? "")).trim();
  if (!name || !tag) throw new PlayerError("Wpisz Riot ID w formacie nick#tag, np. Faker#KR1.", 400);
  return [name, tag];
}

export class PlayerService {
  private apis = new Map<string, RiotApi>();
  /** Mecze się nie zmieniają – trzymamy je w pamięci, żeby ponowne wyszukanie nie zużywało limitu API. */
  private matchCache = new Map<string, MatchDto>();

  constructor(
    private data: GameData,
    private envFile: string,
    private relayUrl: string | null,
  ) {}

  /** Klucz z .env (czytany za każdym razem) albo ze zmiennej środowiskowej. */
  private key(): string | null {
    try {
      const fromFile = parseEnv(fs.readFileSync(this.envFile, "utf8")).RIOT_API_KEY;
      if (fromFile) return fromFile;
    } catch {
      /* brak pliku .env */
    }
    return process.env.RIOT_API_KEY ?? null;
  }

  /** Własny klucz (programista) ma pierwszeństwo; bez niego – przekaźnik. */
  get mode(): PlayerSearchMode {
    if (this.key()) return "key";
    return this.relayUrl ? "proxy" : "off";
  }

  private api(platform: string): RiotApi {
    if (!PLATFORM_TO_REGION[platform]) throw new PlayerError(`Nieznany serwer: ${platform}.`, 400);
    const key = this.key();
    if (!key && !this.relayUrl) throw new PlayerError("Wyszukiwarka graczy potrzebuje klucza Riot API – ta funkcja wkrótce będzie dostępna dla wszystkich.", 503);
    const id = `${platform}:${key ?? `relay:${this.relayUrl}`}`;
    let api = this.apis.get(id);
    if (!api) this.apis.set(id, (api = key ? new RiotApi(key, platform) : new RiotApi("", platform, this.relayUrl)));
    return api;
  }

  /** Błędy Riot API -> zrozumiałe komunikaty. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PlayerError) throw err;
      const msg = (err as Error).message;
      const relay = this.mode === "proxy";
      if (msg === "RELAY_NO_KEY") {
        throw new PlayerError("Wyszukiwarka graczy ruszy po zatwierdzeniu klucza przez Riot Games – czekamy na ich decyzję. Reszta aplikacji działa normalnie.", 503);
      }
      if (/klucz/i.test(msg)) {
        throw new PlayerError(
          relay
            ? "Serwer wyszukiwarki ma nieaktualny klucz Riot API – spróbuj później."
            : "Klucz Riot API wygasł – wygeneruj nowy na developer.riotgames.com i wpisz go do pliku .env.",
          503,
        );
      }
      if (/429/.test(msg)) {
        throw new PlayerError(
          relay ? "Wyszukiwarka jest teraz bardzo oblegana – spróbuj za minutę." : "Limit zapytań Riot API jest wyczerpany (np. przez działający crawler) – spróbuj za minutę.",
          429,
        );
      }
      throw new PlayerError(`Riot API nie odpowiada: ${msg}`, 502);
    }
  }

  async profile(riotId: string, platform: string): Promise<PlayerProfile> {
    const api = this.api(platform);
    const [name, tag] = parseRiotId(riotId, platform);
    return this.call(async () => {
      const account = await api.account(name, tag);
      if (!account) throw new PlayerError(`Nie znaleziono gracza ${name}#${tag}. Sprawdź nick i tag (tag to część po #). Po niedawnej zmianie nicku Riot potrafi przez jakiś czas nie znajdować konta.`, 404);
      const [summoner, entries, mastery, matches] = await Promise.all([
        api.summoner(account.puuid),
        api.leagueEntries(account.puuid),
        api.topMastery(account.puuid),
        this.loadMatches(api, account.puuid, 0),
      ]);
      if (!summoner) throw new PlayerError(`${account.gameName}#${account.tagLine} nie ma konta LoL na serwerze ${platform.toUpperCase()}. Wybierz inny serwer.`, 404);
      return {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platform,
        level: summoner.summonerLevel,
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${this.data.version}/img/profileicon/${summoner.profileIconId}.png`,
        ranks: ranksOf(entries ?? []),
        mastery: (mastery ?? []).flatMap((m) => {
          const c = this.data.champions.get(m.championId);
          return c ? [{ championId: c.id, name: c.name, image: c.image, points: m.championPoints, level: m.championLevel }] : [];
        }),
        matches: matches.list,
        hasMore: matches.hasMore,
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  /** Kolejna strona meczów (przycisk „Wczytaj więcej”). */
  async moreMatches(puuid: string, platform: string, start: number): Promise<{ matches: PlayerMatch[]; hasMore: boolean }> {
    const api = this.api(platform);
    const page = await this.call(() => this.loadMatches(api, puuid, start));
    return { matches: page.list, hasMore: page.hasMore };
  }

  private async loadMatches(api: RiotApi, puuid: string, start: number): Promise<{ list: PlayerMatch[]; hasMore: boolean }> {
    const ids = (await api.recentMatchIds(puuid, start, PAGE)) ?? [];
    const dtos = await Promise.all(
      ids.map(async (id) => {
        const cached = this.matchCache.get(id);
        if (cached) return cached;
        const dto = await api.match(id);
        if (dto) {
          this.matchCache.set(id, dto);
          if (this.matchCache.size > MATCH_CACHE_LIMIT) this.matchCache.delete(this.matchCache.keys().next().value!);
        }
        return dto;
      }),
    );
    const list = dtos.flatMap((m) => (m ? [toPlayerMatch(m, puuid, this.data)].filter((x): x is PlayerMatch => !!x) : []));
    return { list, hasMore: ids.length === PAGE };
  }
}

export function ranksOf(entries: { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }[]): PlayerRank[] {
  const queues: [string, PlayerRank["queue"]][] = [
    ["RANKED_SOLO_5x5", "solo"],
    ["RANKED_FLEX_SR", "flex"],
  ];
  return queues.flatMap(([type, queue]) => {
    const e = entries.find((x) => x.queueType === type);
    if (!e) return [];
    const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(e.tier);
    return [{ queue, tier: e.tier, division: apex ? "" : e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses }];
  });
}

/** Mecz z perspektywy szukanego gracza. */
export function toPlayerMatch(m: MatchDto, puuid: string, data: GameData): PlayerMatch | null {
  const p = m.info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  const c = data.champions.get(p.championId);
  const duration = m.info.gameDuration ?? 0;
  const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].flatMap((id) => {
    const ref = id ? data.itemRefs.get(String(id)) : undefined;
    return ref ? [ref] : [];
  });
  return {
    id: m.metadata.matchId,
    queue: QUEUE_NAME[m.info.queueId] ?? "Inny tryb",
    win: p.win,
    remake: duration > 0 && duration < 300,
    championId: p.championId,
    championName: c?.name ?? `#${p.championId}`,
    championImage: c?.image ?? "",
    position: POSITIONS.includes(p.teamPosition as Position) ? (p.teamPosition as Position) : null,
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    durationSec: duration,
    endedAt: m.info.gameEndTimestamp ?? m.info.gameCreation + duration * 1000,
    items,
  };
}

/** Plik .env obok aplikacji (wersja z kodu źródłowego) – w instalatorze go nie ma. */
export const defaultEnvFile = () => path.resolve(".env");
