/**
 * Przekaźnik Riot API dla wyszukiwarki graczy (Cloudflare Worker).
 *
 * Aplikacja nie może mieć klucza Riot API (zasady Riot), więc zapytania idą przez ten mały serwer,
 * który dokłada klucz z sekretu RIOT_API_KEY. Przepuszcza WYŁĄCZNIE zapytania potrzebne do profilu gracza
 * (biała lista poniżej) – nie da się go użyć do niczego innego z naszym kluczem.
 *
 * Format: GET https://<worker>/<serwer lub region>/<ścieżka Riot API>?<parametry>
 *   np. /europe/riot/account/v1/accounts/by-riot-id/Nick/EUNE
 *       /eun1/lol/league/v4/entries/by-puuid/<puuid>
 *
 * Wdrożenie: relay/README.md.
 */

export interface Env {
  RIOT_API_KEY: string;
}

const PLATFORMS = new Set(["eun1", "euw1", "tr1", "ru", "me1", "na1", "br1", "la1", "la2", "kr", "jp1", "oc1", "sg2", "tw2", "vn2"]);
const REGIONS = new Set(["europe", "americas", "asia", "sea"]);

interface Route {
  path: RegExp;
  host: "platform" | "region";
  /** Ile sekund odpowiedź może leżeć w pamięci podręcznej (mniej zapytań do Riot). */
  ttl: number;
  /** Dozwolone parametry zapytania. */
  query?: string[];
}

const ID = "[A-Za-z0-9_-]{1,100}";
const SEGMENT = "[^/]{1,64}"; // nick lub tag (zakodowany w URL)

export const ROUTES: Route[] = [
  { path: new RegExp(`^/riot/account/v1/accounts/by-riot-id/${SEGMENT}/${SEGMENT}$`), host: "region", ttl: 600 },
  { path: new RegExp(`^/lol/summoner/v4/summoners/by-puuid/${ID}$`), host: "platform", ttl: 600 },
  { path: new RegExp(`^/lol/league/v4/entries/by-puuid/${ID}$`), host: "platform", ttl: 120 },
  { path: new RegExp(`^/lol/champion-mastery/v4/champion-masteries/by-puuid/${ID}/top$`), host: "platform", ttl: 600, query: ["count"] },
  { path: new RegExp(`^/lol/match/v5/matches/by-puuid/${ID}/ids$`), host: "region", ttl: 60, query: ["start", "count", "queue", "type"] },
  // Mecz po zakończeniu już się nie zmienia – można go trzymać długo.
  { path: /^\/lol\/match\/v5\/matches\/[A-Z0-9]{2,5}_\d{1,15}$/, host: "region", ttl: 7 * 86_400 },
];

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ status: { status_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });

/** Sprawdza zapytanie i buduje adres Riot API (albo zwraca błąd). */
export function riotUrl(url: URL): { target: string; ttl: number } | { error: Response } {
  const [, host, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const route = ROUTES.find((r) => r.path.test(path));
  if (!route) return { error: json(404, "Nieobsługiwane zapytanie.") };
  const hostOk = route.host === "platform" ? PLATFORMS.has(host) : REGIONS.has(host);
  if (!hostOk) return { error: json(400, `Nieznany ${route.host === "platform" ? "serwer" : "region"}: ${host}.`) };

  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (!route.query?.includes(k)) return { error: json(400, `Niedozwolony parametr: ${k}.`) };
    if (!/^[\w.-]{1,20}$/.test(v)) return { error: json(400, `Niepoprawna wartość parametru ${k}.`) };
    // Limit wielkości strony meczów, żeby jedno zapytanie nie zjadało limitu.
    params.set(k, k === "count" ? String(Math.min(20, Number(v) || 10)) : v);
  }
  const qs = params.toString();
  return { target: `https://${host}.api.riotgames.com${path}${qs ? `?${qs}` : ""}`, ttl: route.ttl };
}

/** Pamięć podręczna Cloudflare (w testach w Node jej nie ma). */
const edgeCache = (): Cache | null => (typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") return json(405, "Tylko GET.");
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("LoL Draft Helper – przekaźnik Riot API działa.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const built = riotUrl(url);
    if ("error" in built) return built.error;
    if (!env.RIOT_API_KEY) return json(503, "Serwer nie ma skonfigurowanego klucza Riot API.");

    const cache = edgeCache();
    const cacheKey = new Request(built.target);
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;

    const riot = await fetch(built.target, { headers: { "X-Riot-Token": env.RIOT_API_KEY } });
    const headers = new Headers({ "Content-Type": riot.headers.get("Content-Type") ?? "application/json" });
    // Limity i czas oczekiwania przekazujemy dalej – ogranicznik w aplikacji dostosuje się sam.
    for (const h of ["X-App-Rate-Limit", "X-App-Rate-Limit-Count", "Retry-After"]) {
      const v = riot.headers.get(h);
      if (v) headers.set(h, v);
    }
    const response = new Response(riot.body, { status: riot.status, headers });
    // Do pamięci tylko poprawne odpowiedzi; "nie ma takiego gracza" (404) na krótko.
    const ttl = riot.status === 200 ? built.ttl : riot.status === 404 ? 60 : 0;
    if (cache && ttl > 0) {
      const copy = response.clone();
      const toCache = new Response(copy.body, copy);
      toCache.headers.set("Cache-Control", `public, max-age=${ttl}`);
      await cache.put(cacheKey, toCache);
    }
    return response;
  },
};
