# Wniosek o klucz produkcyjny Riot API

Klucz produkcyjny jest **darmowy**, nie wygasa po 24 h i ma dużo wyższe limity. Bez niego wyszukiwarka graczy
działa tylko u osoby, która ma własny klucz w `.env`.

**Jak złożyć:** zaloguj się na https://developer.riotgames.com → **Register Product** → **Production API Key** →
wklej poniższe teksty do odpowiednich pól. Riot odpowiada zwykle w ciągu kilku dni–kilku tygodni (mailem).
Wymagają działającego, publicznego produktu – link do repozytorium i wydań na GitHubie spełnia ten warunek.

---

## Product Name

LoL Draft Helper

## Product URL

https://github.com/natanielbuko-droid/lol-draft-helper

## Product Description

LoL Draft Helper is a free, open-source desktop companion app for League of Legends (Windows), aimed primarily at
Polish-speaking players. It helps players during champion select and lets them browse game data outside of it:

- **Champion select assistant** – reads the local League Client (LCU) to show pick recommendations for the player's
  role based on the current draft (counters, synergies, team composition), plus a dynamic build, runes and summoner
  spells. The player's own choices are imported into the client only on request / after locking in, and only into
  pages and item sets created by the app.
- **Statistics** – aggregated, anonymous win rates, matchups and builds computed from public ranked matches
  (Master and Grandmaster, one region). Only aggregated numbers are stored; no per-player data is kept or shown.
- **Player profile search** – a player can look up a Riot ID (gameName#tagLine) and see that account's rank,
  recent match history (champion, KDA, CS, items) and top champion mastery – the same information shown by
  established sites like op.gg.

**Compliance:**
- The app never de-anonymizes players in champion select and never shows names of players in the lobby.
  Profile search works only for a Riot ID typed in manually by the user.
- No features give an unfair advantage: no in-game overlays with hidden information, no automation of gameplay,
  no scripting. All in-game information shown (builds, item suggestions) is general guidance.
- The API key is never distributed with the client. Profile requests go through a small relay we run on
  Cloudflare Workers (source: `relay/` in the repository). It holds the key as a server-side secret, forwards ONLY
  the six endpoints listed below (everything else is rejected), and caches responses (matches for a week,
  profiles for minutes) to keep request volume low.
- The app is and will remain free. It displays the required legal notice ("LoL Draft Helper isn't endorsed by
  Riot Games…").

## APIs used

- ACCOUNT-V1 (`/riot/account/v1/accounts/by-riot-id`, `by-puuid`) – resolve Riot ID to PUUID
- SUMMONER-V4 (`/lol/summoner/v4/summoners/by-puuid`) – profile icon and level
- LEAGUE-V4 (`/lol/league/v4/entries/by-puuid`, master/grandmaster leagues) – rank on the profile page and the
  list of high-elo players for aggregated statistics
- CHAMPION-MASTERY-V4 (`/top`) – top champions on the profile page
- MATCH-V5 (match ids, match, timeline) – recent matches on the profile page and aggregated build/matchup statistics

## Expected usage

Small at start (tens to low hundreds of daily users – mostly testers recruited from the Polish community).
Each profile lookup costs ~5 requests plus one per uncached match (10 matches per page). Statistics are refreshed
once per patch by a background job.
